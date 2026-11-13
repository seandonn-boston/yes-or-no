# yes-or-no

A belief map: people answer true-or-false questions, can change their minds, and every change is kept. The result is not a database of what is true but a record of what people believe, how firmly, and how that moves over time.

This is the first working slice. It runs end to end on Next.js and Postgres.

## Run it

Needs Node 20+ and Postgres 14+ with the `pg_trgm` extension available.

```bash
createdb beliefmap
cp .env.example .env.local      # then edit DATABASE_URL and PHONE_PEPPER
npm install
npm run db:migrate
npm run db:seed                 # optional: 300 demo accounts voting over two weeks
npm run dev
```

`npm test` runs the rule tests against the same database (they clean up after themselves).

## What works

- **Accounts.** Username, phone number, password, 18+ and consent. One account per phone number; the number is stored only as a keyed hash.
- **Search to ask.** There is no "new question" button. You search, see similar questions, and only then get "Ask now". Questions must open with a yes/no word (Is, Did, Will, Should...) and are asked anonymously.
- **Voting.** True, false, unsure, or skip. Votes can be public or private. Results stay hidden until you vote, unless you choose to see them first, and each first vote records which it was.
- **Changing your mind.** One change per question per UTC day, on every tier. Delete withdraws the vote; the question goes back into the pool.
- **History.** `vote_events` is append-only, so the state of any question at any past moment can be rebuilt.
- **Feed.** Unanswered questions from three slots: random, contested, and new. Every vote records the slot or route it arrived by.
- **Stats.** Split, share who changed once / more than once / recently, public versus private, blind first votes, arrival routes, and a 14-day trend. Breakdowns for groups smaller than `MIN_GROUP_SIZE` are withheld.
- **Who sees what.** Without an account: percentages only. With one: head counts too.

## Daily limits

| | Free | Paid |
|---|---|---|
| New votes | 100 | Unlimited |
| Questions asked | 10 | Unlimited |
| Changes to public votes | Unlimited | Unlimited |
| Changes to private votes | 10 | Unlimited |
| Private to public | Unlimited | Unlimited |
| Public to private | 10 | Unlimited |

Set in `lib/limits.ts`. Tiers exist in the schema (`accounts.tier`); there is no payment flow yet.

## Stats API

```
GET /api/questions/:id/stats?as_of=2026-11-01T00:00:00Z&active_since=2026-10-13T00:00:00Z
```

- `as_of`: the vote as it stood at that moment. Defaults to now.
- `active_since`: count only accounts active at or after that moment.

Signed-out callers get percentages and the trend. Signed-in callers get the full set. API keys and tiers will replace the session check.

## Layout

```
app/            pages, server actions (app/actions.ts), the stats API route
components/     question card, result bar, header
lib/            auth, questions (search, ask), votes (rules), stats, feed, limits, moderation
db/             SQL migrations, migration runner, seed data
tests/          rule tests
```

## Not built yet

- SMS confirmation of the phone number (the number is taken on trust for now)
- Model-based duplicate and question-quality check (`lib/moderation.ts` is the hook; today only exact repeats are refused)
- Verification, attribute attestations (home state, age band), and demographic filters
- Follows, profiles, categories and tags
- Question families, event dates, archiving and "Did X happen?" successors
- Payments, API keys, embeds, reporting and moderator tools
- Search cap for visitors without an account
