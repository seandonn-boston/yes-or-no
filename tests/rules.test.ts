// Rule tests. They run against the database in DATABASE_URL, create their own accounts and
// questions, and remove them afterwards.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { pool, query } from "../lib/db";
import type { Account } from "../lib/auth";
import { countAccess, detailLevel, estimate, present, shapeStats } from "../lib/access";
import { decodeCursor, feedPage, topPage } from "../lib/feed";
import { deleteAccount, exportData } from "../lib/account";
import { decide, report, REPORT_THRESHOLD, screenQuestion } from "../lib/moderation";
import { hit } from "../lib/rate-limit";
import { resendCode, startSignup, verifySignup } from "../lib/signup";
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
  return { id: row.id, username: `${tag}_${name}`, tier, verified: false, role: "user" };
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
  assert.deepEqual(now.visibility.public, { total: 6, pctTrue: 66.7, pctFalse: 33.3, pctUnsure: 0 });
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

test("vote counts are estimated before a free account votes", () => {
  const cases: [number, string][] = [
    [0, "<1k"], [999, "<1k"], [1000, "1K"], [4512, "4.5K"], [9999, "9.9K"], [45212, "45K"],
    [999999, "999K"], [1000000, "1M"], [8240000, "8.2M"], [45000000, "45M"], [2300000000, "2.3B"],
  ];
  for (const [n, expected] of cases) assert.equal(estimate(n), expected, String(n));
});

test("who sees how many votes", () => {
  const freeTier = { tier: "free" as const }, paidTier = { tier: "paid" as const };
  assert.equal(countAccess(null, false), "none");
  assert.equal(countAccess(freeTier, false), "estimate");
  assert.equal(countAccess(freeTier, true), "full");
  assert.equal(countAccess(paidTier, false), "full");

  const tally = { true: 30000, false: 14000, unsure: 1212, total: 45212 };
  // No account: the split, and nothing about how many voted.
  const visitor = present(tally, { account: null, voted: false });
  assert.deepEqual([visitor.split?.true, visitor.sides, visitor.totalLabel], [66.4, null, null]);
  // Free, before voting: no split, a rounded total.
  const before = present(tally, { account: freeTier, voted: false });
  assert.deepEqual([before.split, before.sides, before.totalLabel], [null, null, "about 45K votes"]);
  assert.equal(present({ ...tally, total: 312 }, { account: freeTier, voted: false }).totalLabel, "<1k votes");
  // Free, after asking to see results first: the split, still only a rounded total.
  const peeked = present(tally, { account: freeTier, voted: false, revealed: true });
  assert.deepEqual([peeked.split?.true, peeked.sides, peeked.totalLabel], [66.4, null, "about 45K votes"]);
  // Free, after voting: exact counts on every side.
  const after = present(tally, { account: freeTier, voted: true });
  assert.deepEqual([after.sides, after.totalLabel], [tally, "45,212 votes"]);
  // Paid, before voting: the exact total, but no split until they vote or ask.
  const paidBefore = present(tally, { account: paidTier, voted: false });
  assert.deepEqual([paidBefore.split, paidBefore.sides, paidBefore.totalLabel], [null, null, "45,212 votes"]);
});

test("question detail is tiered: visitor, voter, member, API", async () => {
  const freeTier = { tier: "free" as const }, paidTier = { tier: "paid" as const };
  assert.equal(detailLevel(null, false), "visitor");
  assert.equal(detailLevel(freeTier, false), "visitor");
  assert.equal(detailLevel(freeTier, true), "voter");
  assert.equal(detailLevel(paidTier, false), "member");
  assert.equal(detailLevel(null, false, true), "api");

  const stats = await questionStats(questionIds[0]);
  const keys = (level: Parameters<typeof shapeStats>[1], est?: string) => Object.keys(shapeStats(stats, level, est)).sort();
  assert.deepEqual(keys("visitor"), ["asOf", "percentages"]);
  assert.deepEqual(keys("visitor", "<1k"), ["asOf", "estimatedVotes", "percentages"]);
  assert.deepEqual(keys("voter"), ["asOf", "pctChangedMind", "percentages", "tally"]);
  assert.deepEqual(keys("member"), ["asOf", "blindFirstVotes", "churn", "history", "pctChangedMind", "percentages", "tally", "visibility"]);
  assert.deepEqual(keys("api"), ["activeSince", "asOf", "blindFirstVotes", "churn", "history", "pctChangedMind", "percentages", "sources", "tally", "visibility"]);
});

test("vote counters on the question follow every cast, change and delete", async () => {
  const id = await makeQuestion(`Is the ${tag} counter kept in step`);
  const a = await makeAccount("c1", "paid"), b = await makeAccount("c2", "paid");
  const counts = async () => (await query<{ t: number; f: number; u: number; total: number }>(
    "select true_count as t, false_count as f, unsure_count as u, total_count as total from questions where id = $1", [id]))[0];
  await castVote(a, id, "true", false, "direct");
  await castVote(b, id, "false", true, "direct");
  assert.deepEqual(await counts(), { t: 1, f: 1, u: 0, total: 2 });
  await castVote(a, id, "unsure", false, "direct");
  assert.deepEqual(await counts(), { t: 0, f: 1, u: 1, total: 2 });
  await deleteVote(b, id, "direct");
  assert.deepEqual(await counts(), { t: 0, f: 0, u: 1, total: 1 });
  // Deleting an account removes its votes, and the counters follow.
  await query("delete from accounts where id = $1", [a.id]);
  assert.deepEqual(await counts(), { t: 0, f: 0, u: 0, total: 0 });
});

test("feeds page through the catalog without repeats or gaps", async () => {
  const [{ n: active }] = await query<{ n: number }>("select count(*)::int as n from questions where status = 'active'");

  // Signed out: every active question exactly once, most-voted first.
  const seen = new Set<number>();
  let cursor: string | null = null, pages = 0, lastTotal = Infinity;
  do {
    const page = await topPage(decodeCursor(cursor), null, 400);
    for (const row of page.rows) {
      assert.ok(!seen.has(row.id), `repeat ${row.id}`);
      seen.add(row.id);
      const total = row.t + row.f + row.u;
      assert.ok(total <= lastTotal);
      lastTotal = total;
    }
    cursor = page.next;
    pages++;
  } while (cursor && pages < 50);
  assert.equal(seen.size, active);

  // Signed in: only unanswered questions, no repeats, and it reaches the end.
  const reader = await makeAccount("reader", "paid");
  const answered = [...seen][0];
  await castVote(reader, answered, "true", false, "direct");
  const mine = new Set<number>();
  cursor = null; pages = 0;
  do {
    const page = await feedPage(reader.id, decodeCursor(cursor), null, 300);
    for (const row of page.rows) {
      assert.ok(!mine.has(row.id), `repeat ${row.id}`);
      mine.add(row.id);
    }
    cursor = page.next;
    pages++;
  } while (cursor && pages < 60);
  assert.ok(!mine.has(answered));
  assert.equal(mine.size, active - 1);
  await deleteVote(reader, answered, "direct");

  // A subject filter only returns that subject.
  const math = await feedPage(reader.id, null, "math", 24);
  assert.equal(math.rows.length, 24);
  assert.ok(math.rows.every((r) => r.category === "math"));
  assert.equal(decodeCursor("not-a-cursor"), null);
});

test("signup needs the texted code before an account exists", async () => {
  process.env.SMS_DEV_CODE = "246810";
  const username = `${tag}_new`.slice(0, 20);
  const phone = `617${String(Date.now()).slice(-7)}`;
  const base = { username, phone, password: "correct horse", adult: true, consent: true, next: "/", ip: `ip-${tag}` };

  assert.equal((await startSignup({ ...base, consent: false })).ok, false);
  assert.equal((await startSignup({ ...base, username: "deleted_x" })).ok, false);
  const started = await startSignup(base);
  assert.ok(started.ok);
  if (!started.ok) return;
  const before = await query("select 1 from accounts where username = $1", [username]);
  assert.equal(before.length, 0);

  const wrong = await verifySignup(started.token, "000000");
  assert.equal(wrong.ok, false);
  assert.match(!wrong.ok ? wrong.error : "", /4 tries left/);
  const resend = await resendCode(started.token, base.ip);
  assert.equal(resend.ok, false); // too soon
  const right = await verifySignup(started.token, "246 810");
  assert.ok(right.ok);
  const [account] = await query<{ phone_verified_at: Date | null }>("select phone_verified_at from accounts where username = $1", [username]);
  assert.ok(account.phone_verified_at);
  const left = await query("select 1 from pending_signups where username = $1", [username]);
  assert.equal(left.length, 0);
  // The same phone can't start another account.
  const again = await startSignup({ ...base, username: `${tag}_2`.slice(0, 20) });
  assert.match(!again.ok ? again.error : "", /already has an account/);
});

test("wrong codes run out", async () => {
  const started = await startSignup({
    username: `${tag}_x`.slice(0, 20), phone: `508${String(Date.now()).slice(-7)}`, password: "correct horse",
    adult: true, consent: true, next: "/", ip: `ip2-${tag}`,
  });
  assert.ok(started.ok);
  if (!started.ok) return;
  for (let i = 0; i < 5; i++) await verifySignup(started.token, "111111");
  const last = await verifySignup(started.token, process.env.SMS_DEV_CODE ?? "");
  assert.equal(last.ok, false);
  assert.equal(!last.ok && last.restart, true);
});

test("rate limits stop at the limit", async () => {
  const rule = { name: `t-${tag}`, limit: 3, windowSeconds: 60 };
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await hit([rule, "someone"]));
  assert.deepEqual(results.map((r) => r === null), [true, true, true, false, false]);
  assert.equal(await hit([rule, "someone else"]), null);
});

test("new questions are screened", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.ok((await screenQuestion("Is jane@example.com a scammer?", [])).reject);
  assert.ok((await screenQuestion("Did 617 555 0100 call you last night?", [])).reject);
  assert.ok((await screenQuestion("Does @someone_here lie a lot?", [])).reject);
  const privateName = await screenQuestion("Is Brenda Kowalczyk a bad neighbor?", []);
  assert.match(privateName.hold ?? "", /Brenda Kowalczyk/);
  // A name the catalog already uses is treated as public.
  const publicName = await screenQuestion("Did Barack Obama like basketball?", []);
  assert.equal(publicName.hold, undefined);
  assert.equal((await screenQuestion("Is cereal better than toast?", [])).hold, undefined);
});

test("reports take a question out of feeds; moderators decide", async () => {
  const id = await makeQuestion(`Is the ${tag} reported question fine`);
  const reporters = await Promise.all(Array.from({ length: REPORT_THRESHOLD }, (_, i) => makeAccount(`r${i}`, "free")));
  for (const r of reporters.slice(0, -1)) await report(r.id, id, "spam", "");
  const mid = await query<{ status: string }>("select status from questions where id = $1", [id]);
  assert.equal(mid[0].status, "active");
  await report(reporters.at(-1)!.id, id, "private_person", "names my coworker");
  const held = await query<{ status: string }>("select status from questions where id = $1", [id]);
  assert.equal(held[0].status, "review");

  const mod = await makeAccount("mod", "free");
  assert.equal(await decide(mod.id, id, { action: "approve" }), null);
  const [after] = await query<{ status: string; open: number }>(
    "select status, (select count(*)::int from reports where question_id = $1 and resolved_at is null) as open from questions where id = $1",
    [id],
  );
  assert.deepEqual(after, { status: "active", open: 0 });

  const copy = await makeQuestion(`Is the ${tag} reported question fine at all`);
  assert.ok(await decide(mod.id, copy, { action: "duplicate", of: copy }));
  assert.equal(await decide(mod.id, copy, { action: "duplicate", of: id }), null);
  const [merged] = await query<{ status: string; duplicate_of: number }>("select status, duplicate_of from questions where id = $1", [copy]);
  assert.deepEqual(merged, { status: "removed", duplicate_of: id });
  const log = await query("select 1 from moderation_log where question_id = any($1::int[])", [[id, copy]]);
  assert.equal(log.length, 2);
});

test("deleting an account withdraws votes and keeps history without identity", async () => {
  const id = await makeQuestion(`Will the ${tag} deletion keep history`);
  const leaver = await makeAccount("leaver", "free");
  const stayer = await makeAccount("stayer", "free");
  await castVote(leaver, id, "true", true, "direct");
  await castVote(stayer, id, "false", false, "direct");
  await query("update vote_events set created_at = now() - interval '2 days' where question_id = $1", [id]);
  await report(leaver.id, id, "other", "");

  const exported = await exportData(leaver.id);
  assert.equal(exported.currentVotes.length, 1);
  assert.equal(exported.voteHistory.length, 1);
  assert.equal(JSON.stringify(exported).includes("phone_hash"), false);

  await deleteAccount(leaver.id);
  const gone = await query("select 1 from accounts where id = $1", [leaver.id]);
  assert.equal(gone.length, 0);
  const now = await questionStats(id);
  assert.deepEqual(now.tally, { true: 0, false: 1, unsure: 0, total: 1 });
  // Two days ago the vote was there, and it still is in the history.
  const then = await questionStats(id, { asOf: new Date(Date.now() - 86_400_000) });
  assert.deepEqual(then.tally, { true: 1, false: 1, unsure: 0, total: 2 });
  const [standIn] = await query<{ username: string; phone_hash: string; password_hash: string; deleted_at: Date | null }>(
    `select a.username, a.phone_hash, a.password_hash, a.deleted_at from vote_events e join accounts a on a.id = e.account_id
      where e.question_id = $1 and e.value = 'true'`,
    [id],
  );
  assert.match(standIn.username, /^deleted_/);
  assert.equal(standIn.password_hash, "!");
  assert.ok(standIn.deleted_at);
  await query("delete from accounts where username = $1", [standIn.username]);
});
