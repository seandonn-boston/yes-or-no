-- Catalog metadata, denormalised vote counters, and the indexes that let feeds page through
-- thousands of questions without scanning them.

alter table questions
  add column category text not null default 'general',
  add column kind text not null default 'opinion' check (kind in ('fact', 'forecast', 'opinion')),
  add column reference_answer boolean,          -- internal only: the settled answer to a fact, if there is one
  add column true_count integer not null default 0,
  add column false_count integer not null default 0,
  add column unsure_count integer not null default 0,
  add column shuffle double precision not null default random();   -- fixed random position for lottery ordering

alter table questions
  add column total_count integer generated always as (true_count + false_count + unsure_count) stored,
  -- 0 = dead even, 1 = unanimous; null until there are enough votes to call a question contested
  add column closeness real generated always as (
    case when true_count + false_count >= 10
         then abs(true_count - false_count)::real / (true_count + false_count) end
  ) stored;

update questions q
   set true_count = c.t, false_count = c.f, unsure_count = c.u
  from (select question_id,
               count(*) filter (where value = 'true')   as t,
               count(*) filter (where value = 'false')  as f,
               count(*) filter (where value = 'unsure') as u
          from votes group by question_id) c
 where c.question_id = q.id;

create index questions_top       on questions (total_count desc, id desc) where status = 'active';
create index questions_shuffle   on questions (shuffle)                   where status = 'active';
create index questions_closeness on questions (closeness, id)             where status = 'active' and closeness is not null;
create index questions_category  on questions (category, id desc)         where status = 'active';

-- Answers given by AI models. Kept apart from votes on purpose: they are shown with a label
-- and never counted in any tally, percentage or statistic about what people believe.
create table ai_answers (
  question_id integer not null references questions(id) on delete cascade,
  model       text not null,
  value       text not null check (value in ('true', 'false', 'unsure')),
  answered_at timestamptz not null default now(),
  primary key (question_id, model)
);
