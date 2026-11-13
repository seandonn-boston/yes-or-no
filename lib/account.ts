import { randomBytes } from "crypto";
import { query, transaction } from "./db";

// ---------- Export ----------

// Everything the site holds about one account, in a form the owner can read.
export async function exportData(accountId: number) {
  const [account] = await query(
    `select username, created_at, consented_at, phone_verified_at, tier, subscription_status, role, last_active_at
       from accounts where id = $1`,
    [accountId],
  );
  const [votes, history, asked, reports] = await Promise.all([
    query(
      `select q.id as question_id, q.text as question, v.value, v.is_private, v.first_cast_at, v.updated_at
         from votes v join questions q on q.id = v.question_id where v.account_id = $1 order by v.first_cast_at`,
      [accountId],
    ),
    query(
      `select e.question_id, q.text as question, e.action, e.value, e.is_private, e.source, e.blind, e.created_at
         from vote_events e join questions q on q.id = e.question_id where e.account_id = $1 order by e.created_at, e.id`,
      [accountId],
    ),
    query("select id, text, status, created_at from questions where asked_by = $1 order by created_at", [accountId]),
    query(
      `select r.question_id, q.text as question, r.reason, r.note, r.created_at, r.resolution
         from reports r join questions q on q.id = r.question_id where r.account_id = $1 order by r.created_at`,
      [accountId],
    ),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    note: "Your phone number is not included because the site never stores it, only a one-way hash of it.",
    account,
    currentVotes: votes,
    voteHistory: history,
    questionsAsked: asked,
    reportsFiled: reports,
  };
}

// ---------- Deletion ----------

// Deleting an account:
//   - withdraws every current vote, so it leaves all tallies from this moment on;
//   - keeps the dated history of past votes, moved to a new anonymous stand-in record with a
//     new id and no username, phone, password or payment details, so nothing links it back;
//   - keeps questions the person asked (they were always anonymous) and their reports, also
//     moved to the stand-in;
//   - removes the account, its sessions, skips and everything else tied to it.
export async function deleteAccount(accountId: number): Promise<void> {
  await transaction(async (client) => {
    const { rows } = await client.query<{ consented_at: Date; last_active_at: Date }>(
      "select consented_at, last_active_at from accounts where id = $1 and deleted_at is null for update",
      [accountId],
    );
    if (!rows[0]) return;

    await client.query(
      `insert into vote_events (account_id, question_id, action, value, is_private, source)
       select account_id, question_id, 'delete', null, is_private, 'direct' from votes where account_id = $1`,
      [accountId],
    );
    await client.query("delete from votes where account_id = $1", [accountId]);

    const stand = randomBytes(12).toString("hex");
    const { rows: [standIn] } = await client.query<{ id: number }>(
      `insert into accounts (username, phone_hash, password_hash, consented_at, last_active_at, deleted_at)
       values ($1, $2, '!', $3, $4, now()) returning id`,
      [`deleted_${stand}`, `deleted:${stand}`, rows[0].consented_at, rows[0].last_active_at],
    );
    await client.query("update vote_events set account_id = $2 where account_id = $1", [accountId, standIn.id]);
    await client.query("update reports set account_id = $2 where account_id = $1", [accountId, standIn.id]);
    // Questions stay marked as asked by a person (not part of the catalog), via the stand-in.
    await client.query("update questions set asked_by = $2 where asked_by = $1", [accountId, standIn.id]);
    await client.query("delete from accounts where id = $1", [accountId]);
  });
}
