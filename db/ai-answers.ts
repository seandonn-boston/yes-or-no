// Asks an AI model to answer the questions in the catalog and stores what it says in
// ai_answers. These are NOT votes: they live in their own table, are shown with an
// "AI answered" label, and never enter a tally, percentage or statistic about people.
//
//   ANTHROPIC_API_KEY=... npm run ai:answers            answer every question not yet answered
//   AI_LIMIT=200 npm run ai:answers                     stop after 200 questions
//   AI_MODEL=claude-haiku-5-5 npm run ai:answers        choose the model (this is the default)
//
// Questions go out in batches and the model replies with one letter per question, which
// keeps the cost to a few output tokens each.
import { pool } from "../lib/db";

const MODEL = process.env.AI_MODEL ?? "claude-haiku-5-5";
const BATCH = 40;
const LIMIT = Number(process.env.AI_LIMIT ?? 0);

const SYSTEM = `You will get numbered yes-or-no questions. Answer each with one letter:
T if the best answer is yes or true, F if it is no or false, U if you are unsure or it is a matter of opinion you would not take a side on.
Reply with one line per question in the form "<number> <letter>" and nothing else.`;

type Row = { id: number; text: string };

async function ask(rows: Row[]): Promise<Map<number, "true" | "false" | "unsure">> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: rows.length * 8,
      system: SYSTEM,
      messages: [{ role: "user", content: rows.map((r) => `${r.id} ${r.text}`).join("\n") }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const wanted = new Set(rows.map((r) => r.id));
  const answers = new Map<number, "true" | "false" | "unsure">();
  for (const match of text.matchAll(/^\s*(\d+)\s+([TFU])\b/gim)) {
    const id = Number(match[1]);
    if (wanted.has(id)) answers.set(id, ({ T: "true", F: "false", U: "unsure" } as const)[match[2].toUpperCase() as "T" | "F" | "U"]);
  }
  return answers;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to run this.");
  let done = 0;
  for (;;) {
    const size = LIMIT ? Math.min(BATCH, LIMIT - done) : BATCH;
    if (size <= 0) break;
    const { rows } = await pool.query<Row>(
      `select q.id, q.text from questions q
        where q.status = 'active'
          and not exists (select 1 from ai_answers a where a.question_id = q.id and a.model = $1)
        order by q.id limit $2`,
      [MODEL, size],
    );
    if (!rows.length) break;
    const answers = await ask(rows);
    if (!answers.size) throw new Error("The model's reply had no usable answers; stopping.");
    await pool.query(
      `insert into ai_answers (question_id, model, value)
       select * from unnest($1::int[], $2::text[], $3::text[])
       on conflict (question_id, model) do update set value = excluded.value, answered_at = now()`,
      [[...answers.keys()], [...answers.keys()].map(() => MODEL), [...answers.values()]],
    );
    done += answers.size;
    console.log(`${done} answered`);
    // Anything the model skipped is recorded as unsure so the loop always moves forward.
    const skipped = rows.filter((r) => !answers.has(r.id)).map((r) => r.id);
    if (skipped.length) {
      await pool.query(
        `insert into ai_answers (question_id, model, value) select id, $2, 'unsure' from unnest($1::int[]) as id
         on conflict do nothing`,
        [skipped, MODEL],
      );
    }
  }
  console.log(`finished: ${done} questions answered by ${MODEL}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
