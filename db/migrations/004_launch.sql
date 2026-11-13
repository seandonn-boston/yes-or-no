-- Everything needed to let the public in: phone verification, rate limits, moderation,
-- account deletion, and paid membership.

-- ---------- Accounts ----------

alter table accounts
  add column phone_verified_at  timestamptz,
  add column role               text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  add column deleted_at         timestamptz,          -- set only on the anonymous stand-in left by a deleted account
  add column stripe_customer_id text unique,
  add column subscription_status text;

-- A signup waiting for its phone code. The phone number is kept only until the code is
-- checked or the row expires (15 minutes); the account itself only ever stores a hash.
create table pending_signups (
  token_hash    text primary key,
  username      text not null,
  phone         text not null,
  phone_hash    text not null,
  password_hash text not null,
  code_hash     text,                  -- development mode only; Twilio Verify holds the code otherwise
  attempts      integer not null default 0,
  sends         integer not null default 1,
  last_sent_at  timestamptz not null default now(),
  next_path     text not null default '/',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index pending_signups_expiry on pending_signups (expires_at);

-- ---------- Rate limits ----------

-- Fixed-window counters keyed by what is being limited, for example "sms:phone:<hash>".
create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window on rate_limits (window_start);

-- ---------- Moderation ----------

alter table questions drop constraint questions_status_check;
alter table questions add constraint questions_status_check
  check (status in ('active', 'review', 'archived', 'removed'));
alter table questions
  add column held_reason   text,                                   -- why a question is waiting for review
  add column duplicate_of  integer references questions(id),       -- set when removed as a repeat of another
  add column moderated_at  timestamptz,
  add column moderated_by  integer references accounts(id) on delete set null;

create table reports (
  id          bigint generated always as identity primary key,
  question_id integer not null references questions(id) on delete cascade,
  account_id  integer not null references accounts(id) on delete cascade,
  reason      text not null check (reason in ('duplicate', 'not_yes_no', 'private_person', 'hateful', 'spam', 'other')),
  note        text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolution  text,
  unique (question_id, account_id)
);
create index reports_open on reports (question_id) where resolved_at is null;

-- Every decision a moderator makes, kept for accountability.
create table moderation_log (
  id           bigint generated always as identity primary key,
  question_id  integer not null references questions(id) on delete cascade,
  moderator_id integer references accounts(id) on delete set null,
  action       text not null,
  detail       text,
  created_at   timestamptz not null default now()
);

-- ---------- Payments ----------

-- Stripe webhook events already applied, so a retried delivery is never applied twice.
create table stripe_events (
  id          text primary key,
  received_at timestamptz not null default now()
);
