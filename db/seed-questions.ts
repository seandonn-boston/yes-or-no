// Loads the question catalog: the curated files in db/questions/*.txt plus the generated fact
// families. Safe to run repeatedly; existing questions keep their votes and get their
// category, kind and reference answer refreshed.
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { pool } from "../lib/db";
import { isCategory } from "../lib/categories";
import { booleanProblem, normalize, tidy } from "../lib/questions";
import { generated, type Seed } from "./questions/generate";

const KINDS = { F: "fact", O: "opinion", P: "forecast" } as const;

function curated(): Seed[] {
  const dir = path.join(process.cwd(), "db", "questions");
  const seeds: Seed[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
    const category = file.replace(/\.txt$/, "");
    readFileSync(path.join(dir, file), "utf8").split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      const match = line.match(/^([FOP])([TF-]) (.+)$/);
      if (!match) throw new Error(`${file}:${i + 1}: expected "<F|O|P><T|F|-> question", got: ${line}`);
      const [, kind, answer, text] = match;
      if ((kind === "F") !== (answer !== "-")) throw new Error(`${file}:${i + 1}: only facts take an answer`);
      seeds.push({ category, kind: KINDS[kind as keyof typeof KINDS], answer: answer === "-" ? null : answer === "T", text });
    });
  }
  return seeds;
}

async function main() {
  const seen = new Map<string, Seed>();
  const rejected: string[] = [];
  for (const seed of [...curated(), ...generated]) {
    const problem = booleanProblem(seed.text);
    if (problem || !isCategory(seed.category)) {
      rejected.push(`${seed.category}: ${seed.text}  (${problem ?? "unknown category"})`);
      continue;
    }
    const key = normalize(tidy(seed.text));
    if (!seen.has(key)) seen.set(key, { ...seed, text: tidy(seed.text) });
  }
  if (rejected.length) {
    console.error(`${rejected.length} questions rejected:\n  ${rejected.join("\n  ")}`);
    process.exitCode = 1;
  }

  const rows = [...seen.entries()];
  let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const result = await pool.query<{ inserted: boolean }>(
      `insert into questions (text, normalized, category, kind, reference_answer)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::boolean[])
       on conflict (normalized) do update
         set category = excluded.category, kind = excluded.kind, reference_answer = excluded.reference_answer
       returning (xmax = 0) as inserted`,
      [
        chunk.map(([, s]) => s.text),
        chunk.map(([key]) => key),
        chunk.map(([, s]) => s.category),
        chunk.map(([, s]) => s.kind),
        chunk.map(([, s]) => s.answer),
      ],
    );
    added += result.rows.filter((r) => r.inserted).length;
  }

  const totals = await pool.query<{ category: string; n: number; facts: number }>(
    `select category, count(*)::int as n, count(*) filter (where kind = 'fact')::int as facts
       from questions where status = 'active' group by category order by n desc`,
  );
  console.table(totals.rows);
  console.log(`${rows.length} questions in the catalog, ${added} newly added`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
