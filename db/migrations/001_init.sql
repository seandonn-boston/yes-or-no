create extension if not exists pg_trgm;

create table accounts (
  id             integer generated always as identity primary key,
  username       text not null unique,
  phone_hash     text not null unique,          -- HMAC of the phone number; the number itself is never stored
  password_hash  text not null,
  consented_at   timestamptz not null,
  tier           text not null default 'free' check (tier in ('free', 'paid')),
  verified       boolean not null default false,
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  account_id integer not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table questions (
  id         integer generated always as identity primary key,
  text       text not null,
  normalized text not null unique,               -- lowercased, punctuation stripped; used for search and dedupe
  asked_by   integer references accounts(id),    -- internal only, for abuse handling; never shown or returned
  status     text not null default 'active' check (status in ('active', 'archived', 'removed')),
  created_at timestamptz not null default now()
);
create index questions_normalized_trgm on questions using gin (normalized gin_trgm_ops);

-- Current vote per account per question. A cache of vote_events for fast per-user lookups.
create table votes (
  account_id    integer not null references accounts(id) on delete cascade,
  question_id   integer not null references questions(id) on delete cascade,
  value         text not null check (value in ('true', 'false', 'unsure')),
  is_private    boolean not null default false,
  first_cast_at timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (account_id, question_id)
);
create index votes_question on votes (question_id);

-- Append-only history: the "wayback machine". Every row records the state that resulted from the action.
create table vote_events (
  id          bigint generated always as identity primary key,
  account_id  integer not null references accounts(id) on delete cascade,
  question_id integer not null references questions(id) on delete cascade,
  action      text not null check (action in ('cast', 'change', 'delete', 'visibility')),
  value       text check (value in ('true', 'false', 'unsure')),   -- null after a delete
  is_private  boolean not null default false,
  source      text not null default 'direct',     -- how the voter arrived: feed slot, search, direct link
  blind       boolean,                            -- on 'cast': had the voter not yet seen the results?
  created_at  timestamptz not null default now()
);
create index vote_events_question_time on vote_events (question_id, created_at);
create index vote_events_account_time on vote_events (account_id, created_at);

-- A voter chose to look at the results before voting, so their first vote is not blind.
create table reveals (
  account_id  integer not null references accounts(id) on delete cascade,
  question_id integer not null references questions(id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (account_id, question_id)
);

-- Skipped questions go back into the pool and can resurface after a day.
create table skips (
  account_id  integer not null references accounts(id) on delete cascade,
  question_id integer not null references questions(id) on delete cascade,
  skipped_at  timestamptz not null default now(),
  primary key (account_id, question_id)
);
