import { query } from "./db";
import { MIN_GROUP_SIZE } from "./limits";

export type Tally = { true: number; false: number; unsure: number; total: number };

export const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

export function percentages(t: Tally) {
  return { true: pct(t.true, t.total), false: pct(t.false, t.total), unsure: pct(t.unsure, t.total) };
}

// Fast current tallies for lists of questions, read from the votes cache.
export async function tallies(questionIds: number[]): Promise<Map<number, Tally>> {
  const map = new Map<number, Tally>(questionIds.map((id) => [id, { true: 0, false: 0, unsure: 0, total: 0 }]));
  if (!questionIds.length) return map;
  const rows = await query<{ question_id: number; t: number; f: number; u: number }>(
    `select question_id,
            count(*) filter (where value = 'true')::int   as t,
            count(*) filter (where value = 'false')::int  as f,
            count(*) filter (where value = 'unsure')::int as u
       from votes where question_id = any($1::int[]) group by question_id`,
    [questionIds],
  );
  for (const r of rows) map.set(r.question_id, { true: r.t, false: r.f, unsure: r.u, total: r.t + r.f + r.u });
  return map;
}

export type StatsOptions = {
  asOf?: Date;          // reconstruct the vote as it stood at this moment
  activeSince?: Date;   // only count accounts active at or after this moment
};

export type GroupStat = { total: number; pctTrue: number; pctFalse: number; pctUnsure: number } | null; // null = below the minimum group size

export type QuestionStats = {
  asOf: string;
  activeSince: string | null;
  tally: Tally;
  percentages: { true: number; false: number; unsure: number };
  churn: {
    everVoted: number;
    changedOnce: number;
    changedMoreThanOnce: number;
    changedInLast7Days: number;
    pctChangedOnce: number;
    pctChangedMoreThanOnce: number;
    pctChangedInLast7Days: number;
  };
  blindFirstVotes: { count: number; pct: number };
  visibility: { public: GroupStat; private: GroupStat };
  sources: { source: string; votes: number }[];
  history: { day: string; total: number; pctTrue: number; pctFalse: number; pctUnsure: number }[];
};

// The state of each account's vote at $2: its most recent event at or before that moment.
const LATEST = `
  select distinct on (e.account_id) e.account_id, e.value, e.is_private
    from vote_events e join accounts a on a.id = e.account_id
   where e.question_id = $1 and e.created_at <= $2
     and ($3::timestamptz is null or a.last_active_at >= $3)
   order by e.account_id, e.created_at desc, e.id desc`;

const group = (total: number, t: number, f: number): GroupStat =>
  total >= MIN_GROUP_SIZE
    ? { total, pctTrue: pct(t, total), pctFalse: pct(f, total), pctUnsure: pct(total - t - f, total) }
    : null;

// Everything is computed from vote_events, so any past moment can be reconstructed.
export async function questionStats(questionId: number, opts: StatsOptions = {}): Promise<QuestionStats> {
  const asOf = opts.asOf ?? new Date();
  const activeSince = opts.activeSince ?? null;
  const params = [questionId, asOf, activeSince];

  const [[now], [churn], sources, history] = await Promise.all([
    query<{ t: number; f: number; u: number; pub_n: number; pub_t: number; pub_f: number; priv_n: number; priv_t: number; priv_f: number }>(
      `with latest as (${LATEST})
       select count(*) filter (where value = 'true')::int   as t,
              count(*) filter (where value = 'false')::int  as f,
              count(*) filter (where value = 'unsure')::int as u,
              count(*) filter (where not is_private)::int                    as pub_n,
              count(*) filter (where not is_private and value = 'true')::int as pub_t,
              count(*) filter (where not is_private and value = 'false')::int as pub_f,
              count(*) filter (where is_private)::int                        as priv_n,
              count(*) filter (where is_private and value = 'true')::int     as priv_t,
              count(*) filter (where is_private and value = 'false')::int    as priv_f
         from latest where value is not null`,
      params,
    ),
    query<{ ever: number; once: number; multi: number; recent: number; blind_n: number }>(
      `select count(*)::int                             as ever,
              count(*) filter (where changes = 1)::int  as once,
              count(*) filter (where changes > 1)::int  as multi,
              count(*) filter (where recent > 0)::int   as recent,
              count(*) filter (where first_blind)::int  as blind_n
         from (
           select e.account_id,
                  count(*) filter (where e.action = 'change') as changes,
                  count(*) filter (where e.action in ('change', 'delete')
                                     and e.created_at > $2::timestamptz - interval '7 days') as recent,
                  (array_agg(e.blind order by e.created_at, e.id) filter (where e.action = 'cast'))[1] as first_blind
             from vote_events e join accounts a on a.id = e.account_id
            where e.question_id = $1 and e.created_at <= $2
              and ($3::timestamptz is null or a.last_active_at >= $3)
            group by e.account_id
         ) per_account`,
      params,
    ),
    query<{ source: string; votes: number }>(
      `select e.source, count(*)::int as votes
         from vote_events e join accounts a on a.id = e.account_id
        where e.question_id = $1 and e.created_at <= $2 and e.action = 'cast'
          and ($3::timestamptz is null or a.last_active_at >= $3)
        group by e.source order by votes desc`,
      params,
    ),
    query<{ day: string; t: number; f: number; u: number }>(
      `select to_char(d, 'YYYY-MM-DD') as day, s.t, s.f, s.u
         from generate_series(date_trunc('day', $2::timestamptz, 'UTC') - interval '13 days',
                              date_trunc('day', $2::timestamptz, 'UTC'), interval '1 day') d
        cross join lateral (
          select count(*) filter (where value = 'true')::int   as t,
                 count(*) filter (where value = 'false')::int  as f,
                 count(*) filter (where value = 'unsure')::int as u
            from (
              select distinct on (e.account_id) e.value
                from vote_events e join accounts a on a.id = e.account_id
               where e.question_id = $1
                 and e.created_at < d + interval '1 day' and e.created_at <= $2
                 and ($3::timestamptz is null or a.last_active_at >= $3)
               order by e.account_id, e.created_at desc, e.id desc
            ) l
           where value is not null
        ) s
        order by d`,
      params,
    ),
  ]);

  const tally: Tally = { true: now.t, false: now.f, unsure: now.u, total: now.t + now.f + now.u };
  return {
    asOf: asOf.toISOString(),
    activeSince: activeSince ? activeSince.toISOString() : null,
    tally,
    percentages: percentages(tally),
    churn: {
      everVoted: churn.ever,
      changedOnce: churn.once,
      changedMoreThanOnce: churn.multi,
      changedInLast7Days: churn.recent,
      pctChangedOnce: pct(churn.once, churn.ever),
      pctChangedMoreThanOnce: pct(churn.multi, churn.ever),
      pctChangedInLast7Days: pct(churn.recent, churn.ever),
    },
    blindFirstVotes: { count: churn.blind_n, pct: pct(churn.blind_n, churn.ever) },
    visibility: { public: group(now.pub_n, now.pub_t, now.pub_f), private: group(now.priv_n, now.priv_t, now.priv_f) },
    sources: sources.filter((s) => s.votes >= MIN_GROUP_SIZE),
    history: history.map((h) => {
      const total = h.t + h.f + h.u;
      return { day: h.day, total, pctTrue: pct(h.t, total), pctFalse: pct(h.f, total), pctUnsure: pct(h.u, total) };
    }),
  };
}

// What someone without an account may see: percentages, never head counts.
export function publicView(stats: QuestionStats) {
  return {
    asOf: stats.asOf,
    activeSince: stats.activeSince,
    percentages: stats.percentages,
    history: stats.history.map(({ day, pctTrue, pctFalse, pctUnsure }) => ({ day, pctTrue, pctFalse, pctUnsure })),
  };
}
