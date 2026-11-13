// Demo data: a few hundred fake accounts voting, and sometimes changing their minds, over the
// last two weeks. Safe to run more than once; it does nothing if seed accounts already exist.
import { createHash } from "crypto";
import { Pool } from "pg";

type Seed = { text: string; pTrue: number; pUnsure: number; churn: number; privateShift?: number };

const QUESTIONS: Seed[] = [
  { text: "Is George Washington the first president of the United States?", pTrue: 0.96, pUnsure: 0.01, churn: 0.01 },
  { text: "Is the Earth flat?", pTrue: 0.03, pUnsure: 0.01, churn: 0.01 },
  { text: "Does Bigfoot exist?", pTrue: 0.17, pUnsure: 0.14, churn: 0.08, privateShift: 0.15 },
  { text: "Is a hot dog a sandwich?", pTrue: 0.44, pUnsure: 0.06, churn: 0.22 },
  { text: "Does pineapple belong on pizza?", pTrue: 0.52, pUnsure: 0.04, churn: 0.12 },
  { text: "Is cereal a soup?", pTrue: 0.21, pUnsure: 0.05, churn: 0.1 },
  { text: "Will humans land on Mars before 2040?", pTrue: 0.38, pUnsure: 0.2, churn: 0.25 },
  { text: "Is Michael Jordan the greatest basketball player of all time?", pTrue: 0.55, pUnsure: 0.07, churn: 0.15 },
  { text: "Should the designated hitter be used in all of baseball?", pTrue: 0.48, pUnsure: 0.12, churn: 0.14 },
  { text: "Will the Red Sox make the playoffs next season?", pTrue: 0.41, pUnsure: 0.18, churn: 0.3 },
  { text: "Should Election Day be a national holiday?", pTrue: 0.63, pUnsure: 0.08, churn: 0.09, privateShift: -0.1 },
  { text: "Is remote work more productive than office work?", pTrue: 0.5, pUnsure: 0.13, churn: 0.2, privateShift: 0.12 },
  { text: "Will AI write most software by 2030?", pTrue: 0.46, pUnsure: 0.16, churn: 0.33 },
];

const ACCOUNTS = 300;
const DAYS = 14;
const SOURCES: [string, number][] = [
  ["feed:random", 0.4], ["feed:contested", 0.2], ["feed:fresh", 0.1], ["search", 0.15], ["direct", 0.15],
];

// Small deterministic generator so every seed run produces the same data.
let state = 42;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const pick = (pTrue: number, pUnsure: number) => {
  const r = rand();
  return r < pUnsure ? "unsure" : r < pUnsure + pTrue * (1 - pUnsure) ? "true" : "false";
};
const pickSource = () => {
  let r = rand();
  for (const [name, weight] of SOURCES) if ((r -= weight) < 0) return name;
  return "direct";
};
const normalize = (t: string) =>
  t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const existing = await pool.query("select 1 from accounts where username like 'seed\\_%' limit 1");
  if (existing.rowCount) {
    console.log("seed data already present");
    return pool.end();
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const accountIds: number[] = [];
    for (let i = 1; i <= ACCOUNTS; i++) {
      const name = `seed_${String(i).padStart(4, "0")}`;
      const res = await client.query<{ id: number }>(
        `insert into accounts (username, phone_hash, password_hash, consented_at, created_at)
         values ($1, $2, 'seed-account-no-login', now() - interval '20 days', now() - interval '20 days') returning id`,
        [name, createHash("sha256").update(`seed:${name}`).digest("hex")],
      );
      accountIds.push(res.rows[0].id);
    }

    const now = Date.now();
    for (const seed of QUESTIONS) {
      const q = await client.query<{ id: number }>(
        `insert into questions (text, normalized, created_at) values ($1, $2, now() - interval '${DAYS} days')
         on conflict (normalized) do update set text = excluded.text returning id`,
        [seed.text, normalize(seed.text)],
      );
      const questionId = q.rows[0].id;

      for (const accountId of accountIds) {
        if (rand() > 0.7) continue; // not everyone answers everything
        const isPrivate = rand() < 0.2;
        const pTrue = Math.min(0.98, Math.max(0.02, seed.pTrue + (isPrivate ? seed.privateShift ?? 0 : 0)));
        let value = pick(pTrue, seed.pUnsure);
        let at = now - rand() * DAYS * 86_400_000;
        const source = pickSource();
        await client.query(
          `insert into vote_events (account_id, question_id, action, value, is_private, source, blind, created_at)
           values ($1, $2, 'cast', $3, $4, $5, $6, $7)`,
          [accountId, questionId, value, isPrivate, source, rand() < 0.85, new Date(at)],
        );
        // Some voters change their mind, at most once per day; a few do it twice.
        let changes = rand() < seed.churn ? (rand() < 0.35 ? 2 : 1) : 0;
        while (changes-- > 0) {
          at += 86_400_000 * (1 + rand() * 3);
          if (at >= now) break;
          const options = ["true", "false", "unsure"].filter((v) => v !== value);
          value = options[rand() < 0.75 ? 0 : 1];
          await client.query(
            `insert into vote_events (account_id, question_id, action, value, is_private, source, created_at)
             values ($1, $2, 'change', $3, $4, $5, $6)`,
            [accountId, questionId, value, isPrivate, source, new Date(at)],
          );
        }
      }
    }

    // Rebuild the current-vote cache from the event history.
    await client.query(
      `insert into votes (account_id, question_id, value, is_private, first_cast_at, updated_at)
       select l.account_id, l.question_id, l.value, l.is_private, f.first_at, l.created_at
         from (select distinct on (account_id, question_id) *
                 from vote_events order by account_id, question_id, created_at desc, id desc) l
         join (select account_id, question_id, min(created_at) as first_at
                 from vote_events group by 1, 2) f using (account_id, question_id)
        where l.value is not null
       on conflict do nothing`,
    );

    await client.query("commit");
    console.log(`seeded ${ACCOUNTS} accounts and ${QUESTIONS.length} questions`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
