import { query } from "./db";
import { LIMITS, TODAY_UTC } from "./limits";
import type { Account } from "./auth";
import { findDuplicate } from "./moderation";

export type Question = { id: number; text: string; status: string; category: string; created_at: Date };
export type Match = Question & { similarity: number };

// Lowercase, strip punctuation, collapse whitespace. Two questions with the same normalized
// form are the same question.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Tidy what the person typed into the form a question is stored in.
export function tidy(text: string): string {
  const t = text.replace(/\s+/g, " ").trim().replace(/[?.!\s]+$/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) + "?" : "";
}

const OPENERS = new Set([
  "is", "are", "was", "were", "am", "do", "does", "did", "will", "would", "can", "could",
  "should", "has", "have", "had", "may", "might", "must", "shall",
  "isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't", "won't", "wouldn't",
  "can't", "couldn't", "shouldn't", "hasn't", "haven't", "hadn't",
]);

// A question must be answerable with one tap: true or false. This is the cheap first gate;
// lib/moderation is where a model-based check belongs.
export function booleanProblem(text: string): string | null {
  const t = tidy(text);
  const words = t.slice(0, -1).split(" ").filter(Boolean);
  if (t.length < 12 || words.length < 3) return "That's too short to be a question.";
  if (t.length > 200) return "Keep questions under 200 characters.";
  if (!/\p{L}{2,}/u.test(t)) return "That doesn't look like a question.";
  if (!OPENERS.has(words[0].toLowerCase())) {
    return 'Questions need a true-or-false answer. Start with a word like "Is", "Did", "Will" or "Does".';
  }
  return null;
}

export async function search(text: string, limit = 10): Promise<Match[]> {
  const norm = normalize(text);
  if (!norm) return [];
  return query<Match>(
    `select id, text, status, category, created_at, similarity(normalized, $1)::float as similarity
       from questions
      where status <> 'removed'
        and (normalized % $1 or normalized like '%' || $2 || '%')
      order by similarity desc, created_at
      limit $3`,
    [norm, norm.replace(/[%_\\]/g, ""), limit],
  );
}

export async function getQuestion(id: number): Promise<Question | null> {
  const rows = await query<Question>(
    "select id, text, status, category, created_at from questions where id = $1 and status <> 'removed'",
    [id],
  );
  return rows[0] ?? null;
}

export type AskResult = { ok: true; id: number } | { ok: false; error: string; existingId?: number };

export async function ask(account: Account, raw: string): Promise<AskResult> {
  const problem = booleanProblem(raw);
  if (problem) return { ok: false, error: problem };

  const text = tidy(raw);
  const matches = await search(text, 5);
  const exact = matches.find((m) => normalize(m.text) === normalize(text));
  const existingId = exact?.id ?? (await findDuplicate(text, matches));
  if (existingId) return { ok: false, error: "That question has already been asked.", existingId };

  const limit = LIMITS[account.tier].questionsPerDay;
  if (Number.isFinite(limit)) {
    const [{ n }] = await query<{ n: number }>(
      `select count(*)::int as n from questions where asked_by = $1 and ${TODAY_UTC("created_at")}`,
      [account.id],
    );
    if (n >= limit) return { ok: false, error: `You've asked ${limit} questions today. Try again tomorrow.` };
  }

  const rows = await query<{ id: number }>(
    `insert into questions (text, normalized, asked_by) values ($1, $2, $3)
     on conflict (normalized) do nothing returning id`,
    [text, normalize(text), account.id],
  );
  if (!rows[0]) return { ok: false, error: "That question has already been asked." };
  return { ok: true, id: rows[0].id };
}
