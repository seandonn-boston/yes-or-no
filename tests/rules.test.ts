// Rule tests. They run against the database in DATABASE_URL, create their own accounts and
// questions, and remove them afterwards.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { pool, query } from "../lib/db";
import type { Account } from "../lib/auth";
import { ask, booleanProblem, normalize, search, tidy } from "../lib/questions";
import { questionStats } from "../lib/stats";
import { castVote, deleteVote, reveal, setVisibility } from "../lib/votes";

const tag = `t${Date.now().toString(36)}`;
let free: Account;
let paid: Account;
const questionIds: number[] = [];

async function makeAccount(name: string, tier: "free" | "paid"): Promise<Account> {
  const [row] = await query<{ id: number }>(
    `insert into accounts (username, phone_hash, password_hash, consented_at, tier)
     values ($1, $2, 'x', now(), $3) returning id`,
    [`${tag}_${name}`, `${tag}_${name}`, tier],
  );
  return { id: row.id, username: `${tag}_${name}`, tier, verified: false };
}

async function makeQuestion(text: string): Promise<number> {
  const result = await ask(paid, text);
  assert.ok(result.ok, result.ok ? "" : result.error);
  questionIds.push(result.id);
  return result.id;
}

before(async () => {
  free = await makeAccount("free", "free");
  paid = await makeAccount("paid", "paid");
});

after(async () => {
  await query("delete from questions where id = any($1::int[])", [questionIds]);
  await query("delete from accounts where username like $1", [`${tag}\\_%`]);
  await pool.end();
});

test("questions must be answerable true or false", () => {
  assert.equal(booleanProblem("Is the Earth flat?"), null);
  assert.equal(booleanProblem("will it rain in Boston tomorrow"), null);
  assert.ok(booleanProblem("Who will be senator?"));
  assert.ok(booleanProblem("asdkjh"));
  assert.ok(booleanProblem("Is it?"));
  assert.equal(tidy("  is  the earth flat ?? "), "Is the earth flat?");
  assert.equal(normalize("Is the Earth flat?"), "is the earth flat");
});

test("asking: new questions are accepted, repeats point at the original", async () => {
  const id = await makeQuestion(`Is the ${tag} test planet made of cheese`);
  const same = await ask(free, `is the ${tag} test planet made of cheese??`);
  assert.equal(same.ok, false);
  assert.equal(!same.ok && same.existingId, id);
  // A sibling one word away is a different question; it is accepted and shows up as similar.
  const sibling = await ask(free, `Is the ${tag} test planet made of granite?`);
  assert.ok(sibling.ok);
  if (sibling.ok) questionIds.push(sibling.id);
  const found = await search(`Is the ${tag} test planet made of cheese`);
  assert.equal(found[0]?.id, id);
  assert.ok(sibling.ok && found.some((m) => m.id === sibling.id));
  const bad = await ask(free, "What is the best planet?");
  assert.equal(bad.ok, false);
});

test("one change per question per day", async () => {
  const id = await makeQuestion(`Does the ${tag} lighthouse still work`);
  assert.deepEqual(await castVote(free, id, "true", false, "search"), { ok: true });
  assert.deepEqual(await castVote(free, id, "true", false, "search"), { ok: true }); // same value: no-op
  assert.deepEqual(await castVote(free, id, "false", false, "direct"), { ok: true });
  const again = await castVote(free, id, "unsure", false, "direct");
  assert.equal(again.ok, false);
  const del = await deleteVote(free, id, "direct");
  assert.equal(del.ok, false);
  const events = await query<{ action: string; value: string; blind: boolean | null }>(
    "select action, value, blind from vote_events where account_id = $1 and question_id = $2 order by id",
    [free.id, id],
  );
  assert.deepEqual(events.map((e) => [e.action, e.value]), [["cast", "true"], ["change", "false"]]);
  assert.equal(events[0].blind, true);
});

test("delete removes the vote, and a re-vote the same day counts as a second change", async () => {
  const id = await makeQuestion(`Was the ${tag} bridge built before the tunnel`);
  await castVote(free, id, "true", false, "feed:random");
  assert.deepEqual(await deleteVote(free, id, "direct"), { ok: true });
  const votes = await query("select 1 from votes where account_id = $1 and question_id = $2", [free.id, id]);
  assert.equal(votes.length, 0);
  assert.equal((await castVote(free, id, "false", false, "direct")).ok, false);
  const stats = await questionStats(id);
  assert.equal(stats.tally.total, 0);
  assert.equal(stats.churn.everVoted, 1);
});

test("seeing results first makes the first vote non-blind", async () => {
  const id = await makeQuestion(`Can the ${tag} robot climb stairs`);
  await reveal(free, id);
  await castVote(free, id, "true", false, "direct");
  const [event] = await query<{ blind: boolean }>(
    "select blind from vote_events where account_id = $1 and question_id = $2",
    [free.id, id],
  );
  assert.equal(event.blind, false);
});

test("visibility: private to public is free, public to private is capped on the free tier", async () => {
  const id = await makeQuestion(`Should the ${tag} museum open on Mondays`);
  assert.equal((await setVisibility(free, id, true)).ok, false); // no vote yet
  await castVote(free, id, "true", true, "direct");
  assert.deepEqual(await setVisibility(free, id, false), { ok: true });
  assert.deepEqual(await setVisibility(free, id, true), { ok: true });
  // Use up the rest of today's allowance, then try once more.
  await query(
    `insert into vote_events (account_id, question_id, action, value, is_private, source)
     select $1, $2, 'visibility', 'true', true, 'direct' from generate_series(1, 9)`,
    [free.id, id],
  );
  await setVisibility(free, id, false);
  assert.equal((await setVisibility(free, id, true)).ok, false);
  // The paid tier has no such cap.
  await castVote(paid, id, "false", false, "direct");
  await query(
    `insert into vote_events (account_id, question_id, action, value, is_private, source)
     select $1, $2, 'visibility', 'false', true, 'direct' from generate_series(1, 50)`,
    [paid.id, id],
  );
  assert.deepEqual(await setVisibility(paid, id, true), { ok: true });
});

test("free tier: 100 new votes a day", async () => {
  const id = await makeQuestion(`Will the ${tag} ferry run this winter`);
  const other = await makeAccount("capped", "free");
  await query(
    `insert into vote_events (account_id, question_id, action, value, source)
     select $1, $2, 'cast', 'true', 'direct' from generate_series(1, 100)`,
    [other.id, questionIds[0]],
  );
  const result = await castVote(other, id, "true", false, "direct");
  assert.equal(result.ok, false);
});

test("stats can be reconstructed for any past moment", async () => {
  const id = await makeQuestion(`Is the ${tag} clock tower taller than the church`);
  const voters: Account[] = [];
  for (let i = 0; i < 6; i++) voters.push(await makeAccount(`v${i}`, "free"));
  for (const v of voters) await castVote(v, id, "true", false, "feed:random");
  await query("update vote_events set created_at = now() - interval '3 days' where question_id = $1", [id]);

  // Two of them changed to false yesterday.
  for (const v of voters.slice(0, 2)) await castVote(v, id, "false", false, "direct");
  await query(
    "update vote_events set created_at = now() - interval '1 day' where question_id = $1 and action = 'change'",
    [id],
  );

  const now = await questionStats(id);
  assert.deepEqual(now.tally, { true: 4, false: 2, unsure: 0, total: 6 });
  assert.equal(now.churn.changedOnce, 2);
  assert.equal(now.churn.pctChangedOnce, 33.3);
  assert.equal(now.churn.changedInLast7Days, 2);
  assert.equal(now.blindFirstVotes.count, 6);
  assert.deepEqual(now.visibility.public, { total: 6, pctTrue: 66.7 });
  assert.equal(now.visibility.private, null); // below the minimum group size
  assert.equal(now.history.length, 14);
  assert.equal(now.history.at(-1)!.pctTrue, 66.7);

  const twoDaysAgo = await questionStats(id, { asOf: new Date(Date.now() - 2 * 86_400_000) });
  assert.deepEqual(twoDaysAgo.tally, { true: 6, false: 0, unsure: 0, total: 6 });
  assert.equal(twoDaysAgo.churn.changedOnce, 0);

  // Only accounts active since a cutoff: push four of them into the past.
  await query("update accounts set last_active_at = now() - interval '60 days' where id = any($1::int[])", [
    voters.slice(0, 4).map((v) => v.id),
  ]);
  const recent = await questionStats(id, { activeSince: new Date(Date.now() - 30 * 86_400_000) });
  assert.deepEqual(recent.tally, { true: 2, false: 0, unsure: 0, total: 2 });
});
