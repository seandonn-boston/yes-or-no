import type { PoolClient } from "pg";
import { query, transaction } from "./db";
import { LIMITS, TODAY_UTC } from "./limits";
import type { Account } from "./auth";

export type VoteValue = "true" | "false" | "unsure";
export const VOTE_VALUES: VoteValue[] = ["true", "false", "unsure"];

export const SOURCES = ["feed:contested", "feed:fresh", "feed:random", "feed:top", "search", "direct"] as const;
export type Source = (typeof SOURCES)[number];

export type MyVote = { question_id: number; value: VoteValue; is_private: boolean };
export type VoteResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): VoteResult => ({ ok: false, error });

async function countToday(client: PoolClient, accountId: number, where: string, params: unknown[] = []) {
  const res = await client.query<{ n: number }>(
    `select count(*)::int as n from vote_events
      where account_id = $1 and ${TODAY_UTC("created_at")} and ${where}`,
    [accountId, ...params],
  );
  return res.rows[0].n;
}

// One change per question per day, for every tier. A change is a new value or a delete.
async function changedToday(client: PoolClient, accountId: number, questionId: number) {
  return (await countToday(client, accountId, "question_id = $2 and action in ('change', 'delete')", [questionId])) > 0;
}

async function activeQuestion(client: PoolClient, questionId: number) {
  const res = await client.query("select 1 from questions where id = $1 and status = 'active'", [questionId]);
  return res.rowCount === 1;
}

async function currentVote(client: PoolClient, accountId: number, questionId: number) {
  const res = await client.query<{ value: VoteValue; is_private: boolean }>(
    "select value, is_private from votes where account_id = $1 and question_id = $2 for update",
    [accountId, questionId],
  );
  return res.rows[0] ?? null;
}

// Cast a first vote, or change an existing one. `isPrivate` only applies to a first vote;
// visibility of an existing vote is changed with setVisibility.
export function castVote(
  account: Account,
  questionId: number,
  value: VoteValue,
  isPrivate: boolean,
  source: Source,
): Promise<VoteResult> {
  const limits = LIMITS[account.tier];
  return transaction(async (client) => {
    // Serialise this account's votes so daily limits can't be raced past.
    await client.query("select 1 from accounts where id = $1 for update", [account.id]);
    const existing = await currentVote(client, account.id, questionId);

    if (!existing) {
      if (!(await activeQuestion(client, questionId))) return fail("This question is closed to new votes.");
      if (await changedToday(client, account.id, questionId)) {
        return fail("You already changed your vote on this question today. Try again tomorrow.");
      }
      if ((await countToday(client, account.id, "action = 'cast'")) >= limits.votesPerDay) {
        return fail(`You've used your ${limits.votesPerDay} votes for today.`);
      }
      const revealed = await client.query(
        "select 1 from reveals where account_id = $1 and question_id = $2",
        [account.id, questionId],
      );
      await client.query(
        "insert into votes (account_id, question_id, value, is_private) values ($1, $2, $3, $4)",
        [account.id, questionId, value, isPrivate],
      );
      await client.query(
        `insert into vote_events (account_id, question_id, action, value, is_private, source, blind)
         values ($1, $2, 'cast', $3, $4, $5, $6)`,
        [account.id, questionId, value, isPrivate, source, revealed.rowCount === 0],
      );
      await client.query("delete from skips where account_id = $1 and question_id = $2", [account.id, questionId]);
      return { ok: true };
    }

    if (existing.value === value) return { ok: true };
    if (await changedToday(client, account.id, questionId)) {
      return fail("You already changed your vote on this question today. Try again tomorrow.");
    }
    if (
      existing.is_private &&
      (await countToday(client, account.id, "action = 'change' and is_private")) >= limits.privateRecastsPerDay
    ) {
      return fail(`You've used your ${limits.privateRecastsPerDay} private vote changes for today.`);
    }
    await client.query(
      "update votes set value = $3, updated_at = now() where account_id = $1 and question_id = $2",
      [account.id, questionId, value],
    );
    await client.query(
      `insert into vote_events (account_id, question_id, action, value, is_private, source)
       values ($1, $2, 'change', $3, $4, $5)`,
      [account.id, questionId, value, existing.is_private, source],
    );
    return { ok: true };
  });
}

// Remove your vote. The question stays, and can come back around in your feed.
export function deleteVote(account: Account, questionId: number, source: Source): Promise<VoteResult> {
  return transaction(async (client) => {
    await client.query("select 1 from accounts where id = $1 for update", [account.id]);
    const existing = await currentVote(client, account.id, questionId);
    if (!existing) return { ok: true };
    if (await changedToday(client, account.id, questionId)) {
      return fail("You already changed your vote on this question today. Try again tomorrow.");
    }
    await client.query("delete from votes where account_id = $1 and question_id = $2", [account.id, questionId]);
    await client.query(
      `insert into vote_events (account_id, question_id, action, value, is_private, source)
       values ($1, $2, 'delete', null, $3, $4)`,
      [account.id, questionId, existing.is_private, source],
    );
    return { ok: true };
  });
}

// Private to public is always free. Public to private is limited on the free tier.
export function setVisibility(account: Account, questionId: number, isPrivate: boolean): Promise<VoteResult> {
  const limits = LIMITS[account.tier];
  return transaction(async (client) => {
    await client.query("select 1 from accounts where id = $1 for update", [account.id]);
    const existing = await currentVote(client, account.id, questionId);
    if (!existing) return fail("Vote first, then choose who can see it.");
    if (existing.is_private === isPrivate) return { ok: true };
    if (
      isPrivate &&
      (await countToday(client, account.id, "action = 'visibility' and is_private")) >= limits.publicToPrivatePerDay
    ) {
      return fail(`You've made ${limits.publicToPrivatePerDay} votes private today. Try again tomorrow.`);
    }
    await client.query(
      "update votes set is_private = $3, updated_at = now() where account_id = $1 and question_id = $2",
      [account.id, questionId, isPrivate],
    );
    await client.query(
      `insert into vote_events (account_id, question_id, action, value, is_private, source)
       values ($1, $2, 'visibility', $3, $4, 'direct')`,
      [account.id, questionId, existing.value, isPrivate],
    );
    return { ok: true };
  });
}

export async function skip(account: Account, questionId: number): Promise<void> {
  await query(
    `insert into skips (account_id, question_id) values ($1, $2)
     on conflict (account_id, question_id) do update set skipped_at = now()`,
    [account.id, questionId],
  );
}

// The voter asked to see results before voting; their first vote will not count as blind.
export async function reveal(account: Account, questionId: number): Promise<void> {
  await query(
    "insert into reveals (account_id, question_id) values ($1, $2) on conflict do nothing",
    [account.id, questionId],
  );
}

export async function hasRevealed(accountId: number, questionId: number): Promise<boolean> {
  const rows = await query("select 1 from reveals where account_id = $1 and question_id = $2", [accountId, questionId]);
  return rows.length > 0;
}

export async function myVotes(accountId: number, questionIds: number[]): Promise<Map<number, MyVote>> {
  if (!questionIds.length) return new Map();
  const rows = await query<MyVote>(
    "select question_id, value, is_private from votes where account_id = $1 and question_id = any($2::int[])",
    [accountId, questionIds],
  );
  return new Map(rows.map((r) => [r.question_id, r]));
}
