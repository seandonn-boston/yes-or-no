import { query } from "./db";
import type { Source } from "./votes";

// One row of a feed page: the question and its counters, straight from the questions table.
export type FeedRow = {
  id: number; text: string; status: string; category: string;
  t: number; f: number; u: number; shuffle: number; closeness: number | null;
  slot: Source;
};

export const PAGE_SIZE = 12;

// Where each stream of the feed has got to. Sent to the browser as an opaque string and
// handed back to fetch the next page, so no page ever rescans what came before it.
type Cursor = {
  // Lottery streams walk the `shuffle` index from a random starting point, wrapping once.
  o?: Lottery;                    // opinions and forecasts
  x?: Lottery;                    // facts
  c?: [number, number] | "end";   // contested: last (closeness, id)
  n?: number | "end";             // newest: last id
  top?: [number, number] | "end"; // signed-out: last (total votes, id)
};
type Lottery = { start: number; at: number; wrapped: boolean; end: boolean };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Cursor) : null;
  } catch {
    return null;
  }
}

const COLUMNS = "q.id, q.text, q.status, q.category, q.true_count as t, q.false_count as f, q.unsure_count as u, q.shuffle, q.closeness";

export type FeedPage = { rows: FeedRow[]; next: string | null };

// Signed-out feed: most-voted questions first, then newest. Keyset-paged on (total_count, id).
export async function topPage(cursor: Cursor | null, category: string | null, limit = PAGE_SIZE): Promise<FeedPage> {
  const after = cursor?.top;
  if (after === "end") return { rows: [], next: null };
  const rows = await query<Omit<FeedRow, "slot">>(
    `select ${COLUMNS} from questions q
      where q.status = 'active'
        and ($1::text is null or q.category = $1)
        and ($2::int is null or (q.total_count, q.id) < ($2, $3))
      order by q.total_count desc, q.id desc
      limit $4`,
    [category, after?.[0] ?? null, after?.[1] ?? null, limit],
  );
  const last = rows[rows.length - 1];
  return {
    rows: rows.map((r) => ({ ...r, slot: "feed:top" as const })),
    next: rows.length === limit && last ? encodeCursor({ top: [last.t + last.f + last.u, last.id] }) : null,
  };
}

// Signed-in feed: questions this account hasn't answered (or skipped in the last day), mixed
// from streams that never overlap, so no question is served twice. Each stream is an index
// range scan from its own cursor.
//   contested  enough votes to have a split; closest to even first
//   newest     asked by a person in the last week and not yet contested
//   lottery    everything else in random order, opinions and forecasts favoured two to one
//              over facts. Votes that arrive this way are the least self-selected sample
//              the site has.
export async function feedPage(
  accountId: number, cursor: Cursor | null, category: string | null, limit = PAGE_SIZE,
): Promise<FeedPage> {
  const open = `
    q.status = 'active'
    and ($2::text is null or q.category = $2)
    and not exists (select 1 from votes v where v.question_id = q.id and v.account_id = $1)
    and not exists (select 1 from skips s where s.question_id = q.id and s.account_id = $1
                       and s.skipped_at > now() - interval '1 day')`;
  const recent = "(q.asked_by is not null and q.created_at > now() - interval '7 days')";
  const want = { contested: Math.round(limit / 4), newest: Math.round(limit / 6) };

  const c = cursor?.c, n = cursor?.n;
  const [contested, newest] = await Promise.all([
    c === "end" ? [] : query<Omit<FeedRow, "slot">>(
      `select ${COLUMNS} from questions q
        where ${open} and q.closeness is not null
          and ($3::real is null or (q.closeness, q.id) > ($3::real, $4))
        order by q.closeness, q.id limit $5`,
      [accountId, category, c?.[0] ?? null, c?.[1] ?? null, want.contested],
    ),
    n === "end" ? [] : query<Omit<FeedRow, "slot">>(
      `select ${COLUMNS} from questions q
        where ${open} and q.closeness is null and ${recent}
          and ($3::int is null or q.id < $3)
        order by q.id desc limit $4`,
      [accountId, category, n ?? null, want.newest],
    ),
  ]);

  const taken = new Set<number>();
  const keep = (rows: Omit<FeedRow, "slot">[], slot: Source) =>
    rows.filter((r) => !taken.has(r.id) && taken.add(r.id)).map((r) => ({ ...r, slot }));
  const contestedRows = keep(contested, "feed:contested");
  const newestRows = keep(newest, "feed:fresh");

  // Fill the rest by lottery. Ask for a few spare in case of repeats from the other streams.
  const remaining = limit - contestedRows.length - newestRows.length;
  const wantFacts = Math.floor(remaining / 3);
  const draw = async (state: Lottery | undefined, kinds: string, count: number) => {
    const s: Lottery = state ?? { start: Math.random(), at: -1, wrapped: false, end: false };
    if (!state) s.at = s.start;
    const picked: Omit<FeedRow, "slot">[] = [];
    while (picked.length < count && !s.end) {
      const rows = await query<Omit<FeedRow, "slot">>(
        `select ${COLUMNS} from questions q
          where ${open} and q.kind ${kinds} and q.closeness is null and not ${recent}
            and q.shuffle > $3 and ($4::float8 is null or q.shuffle <= $4)
          order by q.shuffle limit $5`,
        [accountId, category, s.at, s.wrapped ? s.start : null, count - picked.length + 4],
      );
      for (const row of rows) {
        if (picked.length >= count) break;
        s.at = row.shuffle;
        if (!taken.has(row.id)) { taken.add(row.id); picked.push(row); }
      }
      if (picked.length < count) {
        if (s.wrapped) s.end = true;                  // been all the way round
        else { s.wrapped = true; s.at = -1; }         // reached the top of the range: start again from the bottom
      }
    }
    return { state: s, rows: picked.map((r) => ({ ...r, slot: "feed:random" as const })) };
  };
  const facts = await draw(cursor?.x, "= 'fact'", wantFacts);
  const others = await draw(cursor?.o, "<> 'fact'", remaining - facts.rows.length);
  // If opinions ran dry, top up with more facts.
  const extra = others.rows.length < remaining - facts.rows.length
    ? await draw(facts.state, "= 'fact'", remaining - facts.rows.length - others.rows.length)
    : { state: facts.state, rows: [] };

  // Deal the streams out in turn so a page reads as a mix, not four blocks.
  const queues = [others.rows, contestedRows, [...facts.rows, ...extra.rows], newestRows];
  const rows: FeedRow[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) { const r = q.shift(); if (r) rows.push(r); }

  const lastContested = contested[contested.length - 1], lastNewest = newest[newest.length - 1];
  const nextCursor: Cursor = {
    o: others.state,
    x: extra.state,
    c: c === "end" || contested.length < want.contested ? "end" : [lastContested.closeness!, lastContested.id],
    n: n === "end" || newest.length < want.newest ? "end" : lastNewest.id,
  };
  const exhausted = nextCursor.o!.end && nextCursor.x!.end && nextCursor.c === "end" && nextCursor.n === "end";
  return { rows, next: rows.length > 0 && !exhausted ? encodeCursor(nextCursor) : null };
}
