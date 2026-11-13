import { query } from "./db";
import type { Question } from "./questions";
import type { Source } from "./votes";

export type FeedItem = Question & { slot: Source };

// Questions with fewer votes than this can't be called contested yet.
const CONTESTED_MIN_VOTES = 10;

// Signed-in feed: questions you haven't answered, drawn from three slots.
//   contested: closest to an even true/false split
//   fresh:     newest questions
//   random:    assigned by lottery. Votes that arrive this way are the least self-selected
//              sample the site has, so every vote records which slot it came from.
export async function feedFor(accountId: number): Promise<FeedItem[]> {
  const unanswered = `
    q.status = 'active'
    and not exists (select 1 from votes v where v.question_id = q.id and v.account_id = $1)
    and not exists (select 1 from skips s where s.question_id = q.id and s.account_id = $1
                       and s.skipped_at > now() - interval '1 day')`;

  const [contested, fresh, random] = await Promise.all([
    query<Question>(
      `select q.id, q.text, q.status, q.created_at
         from questions q
         join lateral (
           select count(*) filter (where value = 'true')  as t,
                  count(*) filter (where value = 'false') as f
             from votes where question_id = q.id
         ) c on true
        where ${unanswered} and c.t + c.f >= ${CONTESTED_MIN_VOTES}
        order by abs(c.t - c.f)::float / (c.t + c.f), c.t + c.f desc
        limit 4`,
      [accountId],
    ),
    query<Question>(
      `select q.id, q.text, q.status, q.created_at from questions q
        where ${unanswered} order by q.created_at desc limit 3`,
      [accountId],
    ),
    query<Question>(
      `select q.id, q.text, q.status, q.created_at from questions q
        where ${unanswered} order by random() limit 8`,
      [accountId],
    ),
  ]);

  // Interleave the slots, dropping repeats; a question keeps the first slot that picked it.
  const queues: [Source, Question[]][] = [
    ["feed:random", random],
    ["feed:contested", contested],
    ["feed:fresh", fresh],
  ];
  const seen = new Set<number>();
  const items: FeedItem[] = [];
  while (queues.some(([, list]) => list.length) && items.length < 10) {
    for (const [slot, list] of queues) {
      let next = list.shift();
      while (next && seen.has(next.id)) next = list.shift();
      if (next) {
        seen.add(next.id);
        items.push({ ...next, slot });
      }
    }
  }
  return items.slice(0, 10);
}

// Signed-out home page: the most-voted questions.
export async function topQuestions(limit = 10): Promise<FeedItem[]> {
  const rows = await query<Question>(
    `select q.id, q.text, q.status, q.created_at
       from questions q left join votes v on v.question_id = q.id
      where q.status = 'active'
      group by q.id order by count(v.*) desc, q.created_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({ ...r, slot: "feed:top" as const }));
}
