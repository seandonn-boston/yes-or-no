-- Keep the per-question counters right no matter how a vote row changes, including votes
-- removed when an account is deleted. The application no longer touches the counters.

create function sync_vote_counters() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update questions set
      true_count   = true_count   - (old.value = 'true')::int,
      false_count  = false_count  - (old.value = 'false')::int,
      unsure_count = unsure_count - (old.value = 'unsure')::int
    where id = old.question_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update questions set
      true_count   = true_count   + (new.value = 'true')::int,
      false_count  = false_count  + (new.value = 'false')::int,
      unsure_count = unsure_count + (new.value = 'unsure')::int
    where id = new.question_id;
  end if;
  return null;
end $$;

create trigger votes_sync_counters
  after insert or delete or update of value, question_id on votes
  for each row execute function sync_vote_counters();

-- Repair anything that drifted before the trigger existed.
update questions q
   set true_count = coalesce(c.t, 0), false_count = coalesce(c.f, 0), unsure_count = coalesce(c.u, 0)
  from questions q2
  left join (select question_id,
                    count(*) filter (where value = 'true')   as t,
                    count(*) filter (where value = 'false')  as f,
                    count(*) filter (where value = 'unsure') as u
               from votes group by question_id) c on c.question_id = q2.id
 where q.id = q2.id
   and (q.true_count, q.false_count, q.unsure_count) is distinct from (coalesce(c.t, 0), coalesce(c.f, 0), coalesce(c.u, 0));
