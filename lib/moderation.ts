import { CATEGORIES, isCategory, type CategorySlug } from "./categories";
import { query } from "./db";
import type { Match } from "./questions";

// Checks a new question before it goes live. Three layers:
//   1. the search page, where the asker sees similar questions first;
//   2. this screen, when they press "Ask now";
//   3. reports from voters, and the moderator queue.
//
// The screen refuses questions that carry personal details, holds for a moderator anything
// that may name a private person, finds repeats worded differently, and picks a subject.
// With ANTHROPIC_API_KEY set a small model makes those calls; without it, rules do.

export type Screen = {
  reject?: string;              // refuse, with this message
  duplicateOf?: number;         // refuse as a repeat of this question
  hold?: string;                // accept, but keep out of feeds until a moderator approves
  category: CategorySlug;
};

const PERSONAL_DATA: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/, "Questions can't include email addresses."],
  [/(?:\+?\d[\s().-]*){10,}/, "Questions can't include phone numbers."],
  [/(^|\s)@[A-Za-z0-9_]{2,}/, "Questions can't include social media handles."],
  [/\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Ct|Court|Way|Pl|Place)\b/, "Questions can't include street addresses."],
];

// A run of capitalised words after the first word, such as "Jane Smith" or "Red Sox".
const NAME = /(?<!^)\b([A-Z][a-z'’-]+(?:\s+(?:[A-Z]\.|[A-Z][a-z'’-]+))+)/g;

async function unknownNames(text: string): Promise<string[]> {
  const names = [...new Set([...text.matchAll(NAME)].map((m) => m[1]))];
  const unknown: string[] = [];
  for (const name of names) {
    // A name already in the catalog (a president, a city, a team) is public enough.
    const rows = await query("select 1 from questions where status = 'active' and asked_by is null and text like $1 limit 1", [
      `%${name.replace(/[%_\\]/g, "")}%`,
    ]);
    if (!rows.length) unknown.push(name);
  }
  return unknown;
}

function categoryFrom(matches: Match[]): CategorySlug {
  const near = matches.find((m) => m.similarity >= 0.3 && m.category !== "general");
  return near && isCategory(near.category) ? near.category : "general";
}

async function rules(text: string, matches: Match[]): Promise<Screen> {
  const names = await unknownNames(text);
  return {
    category: categoryFrom(matches),
    hold: names.length ? `May name a private person: ${names.join(", ")}` : undefined,
  };
}

type Verdict = {
  duplicate_of: number | null;
  category: string;
  answerable_yes_no: boolean;
  names_private_person: boolean;
  harassing_or_hateful: boolean;
};

async function model(text: string, matches: Match[]): Promise<Verdict | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt = `A user wants to post this yes-or-no question to a public voting site:
"${text}"

Existing questions that may be the same:
${matches.map((m) => `#${m.id}: ${m.text}`).join("\n") || "(none)"}

Subjects: ${CATEGORIES.filter((c) => c.slug !== "general").map((c) => c.slug).join(", ")}

Reply with JSON only, no other text:
{"duplicate_of": <id of an existing question asking the same thing in other words, or null; questions about different people, places, numbers or dates are NOT duplicates>,
 "category": <one subject from the list>,
 "answerable_yes_no": <true if it can be answered true or false>,
 "names_private_person": <true if it names or identifies a private individual rather than a public figure, place, team or organisation>,
 "harassing_or_hateful": <true if it insults, harasses or demeans a person or group>}`;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.MODERATION_MODEL ?? "claude-haiku-5-5",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data = (await response.json()) as { content: { type: string; text?: string }[] };
    const raw = data.content.map((c) => c.text ?? "").join("");
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    return JSON.parse(json) as Verdict;
  } catch (err) {
    console.error("moderation model unavailable, using rules", (err as Error).message);
    return null;
  }
}

export async function screenQuestion(text: string, matches: Match[]): Promise<Screen> {
  for (const [pattern, message] of PERSONAL_DATA) if (pattern.test(text)) return { reject: message, category: "general" };

  const verdict = await model(text, matches);
  if (!verdict) return rules(text, matches);

  const category = isCategory(verdict.category) ? verdict.category : categoryFrom(matches);
  if (!verdict.answerable_yes_no) return { reject: "Ask it so it can be answered true or false.", category };
  const duplicate = matches.find((m) => m.id === verdict.duplicate_of);
  if (duplicate) return { duplicateOf: duplicate.id, category };
  if (verdict.harassing_or_hateful) return { hold: "Flagged as possibly harassing or hateful", category };
  if (verdict.names_private_person) return { hold: "Flagged as possibly naming a private person", category };
  return { category };
}

// ---------- Reports ----------

export const REPORT_REASONS = [
  { value: "duplicate", label: "It repeats another question" },
  { value: "not_yes_no", label: "It can't be answered true or false" },
  { value: "private_person", label: "It's about a private person" },
  { value: "hateful", label: "It's hateful or harassing" },
  { value: "spam", label: "It's spam or advertising" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

// Reports from this many different accounts take a question out of feeds until reviewed.
export const REPORT_THRESHOLD = Number(process.env.REPORT_THRESHOLD ?? 5);

export async function report(accountId: number, questionId: number, reason: ReportReason, note: string): Promise<void> {
  await query(
    `insert into reports (question_id, account_id, reason, note) values ($1, $2, $3, nullif($4, ''))
     on conflict (question_id, account_id) do update
       set reason = excluded.reason, note = excluded.note, created_at = now(), resolved_at = null, resolution = null`,
    [questionId, accountId, reason, note.slice(0, 500)],
  );
  await query(
    `update questions set status = 'review', held_reason = 'Reported by ' || $2 || ' or more people'
      where id = $1 and status = 'active'
        and (select count(*) from reports where question_id = $1 and resolved_at is null) >= $2`,
    [questionId, REPORT_THRESHOLD],
  );
}

// ---------- Moderator decisions ----------

export type Decision =
  | { action: "approve" }
  | { action: "remove" }
  | { action: "archive" }
  | { action: "duplicate"; of: number }
  | { action: "category"; category: CategorySlug };

export async function decide(moderatorId: number, questionId: number, decision: Decision): Promise<string | null> {
  const set: Record<Decision["action"], string> = {
    approve: "status = 'active', held_reason = null",
    remove: "status = 'removed'",
    archive: "status = 'archived'",
    duplicate: "status = 'removed', duplicate_of = $3",
    category: "category = $3",
  };
  const extra = decision.action === "duplicate" ? decision.of : decision.action === "category" ? decision.category : null;
  if (decision.action === "duplicate") {
    if (decision.of === questionId) return "A question can't duplicate itself.";
    const target = await query("select 1 from questions where id = $1 and status in ('active', 'archived')", [decision.of]);
    if (!target.length) return `Question #${decision.of} isn't live, so it can't be the original.`;
  }
  const params: unknown[] = [questionId, moderatorId];
  if (extra !== null) params.push(extra);
  const updated = await query(
    `update questions set ${set[decision.action]}, moderated_at = now(), moderated_by = $2 where id = $1 returning id`,
    params,
  );
  if (!updated.length) return "That question wasn't found.";
  if (decision.action !== "category") {
    await query(
      "update reports set resolved_at = now(), resolution = $2 where question_id = $1 and resolved_at is null",
      [questionId, decision.action],
    );
  }
  await query(
    "insert into moderation_log (question_id, moderator_id, action, detail) values ($1, $2, $3, $4)",
    [questionId, moderatorId, decision.action, extra === null ? null : String(extra)],
  );
  return null;
}

export type QueueItem = {
  id: number; text: string; status: string; category: string; held_reason: string | null;
  created_at: Date; asked_by_user: boolean; votes: number; open_reports: number;
  reasons: Record<string, number> | null; notes: string[] | null;
};

// Questions waiting for review, then live questions with open reports, most-reported first.
export async function queue(limit = 50): Promise<QueueItem[]> {
  return query<QueueItem>(
    `select q.id, q.text, q.status, q.category, q.held_reason, q.created_at, q.asked_by is not null as asked_by_user,
            q.total_count as votes, coalesce(r.n, 0)::int as open_reports, r.reasons, r.notes
       from questions q
       left join lateral (
         select count(*) as n,
                (select jsonb_object_agg(reason, c) from (select reason, count(*)::int as c from reports
                   where question_id = q.id and resolved_at is null group by reason) x) as reasons,
                (array_agg(note order by created_at desc) filter (where note is not null))[1:5] as notes
           from reports where question_id = q.id and resolved_at is null
       ) r on true
      where q.status = 'review' or (q.status = 'active' and coalesce(r.n, 0) > 0)
      order by (q.status = 'review') desc, coalesce(r.n, 0) desc, q.created_at
      limit $1`,
    [limit],
  );
}
