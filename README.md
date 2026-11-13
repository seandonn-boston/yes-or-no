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
npm run db:seed:questions       # the catalog: about 3,400 questions across 19 subjects
npm run db:seed:demo            # development only: 300 fake accounts voting over two weeks
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
- **Stats.** Split, share who changed once / more than once / recently, public versus private, blind first votes, arrival routes, and a 14-day trend, with charts drawn in Highcharts. How much of it a viewer gets depends on their tier (below). Breakdowns for groups smaller than `MIN_GROUP_SIZE` are withheld.
- **Three layouts.** Compact single column, masonry tiles, or one question per screen with swipe-to-next. The switcher is in the header and the choice is kept in a cookie.
- **Black theme.** True black background for OLED and QLED screens. Colour is used only for answers: blue for true, orange for false, grey for unsure.

## The question catalog

`db/questions/` holds about 3,400 questions in 19 subjects. Around 1,300 are written by hand (opinions, forecasts and one-off facts, one file per subject); the rest are families of facts generated from tables in `generate.ts` (primes, capitals, elements, presidents, dates, authors), with false versions mixed in so the wording never gives the answer away. Every question is tagged fact, forecast or opinion, and facts carry their settled answer for internal use; voters never see it.

`npm run db:seed:questions` loads or refreshes the catalog and can be rerun after edits.

## Feeds and lazy loading

The first page of 12 questions arrives with the HTML. `components/FeedList.tsx` fetches the next page from `GET /api/feed?cursor=...&c=<subject>` as the reader nears the end, in all three layouts:

- **Compact:** rows far off screen skip layout and paint.
- **Tiles:** cards are dealt into fixed columns in order, so loading more never moves a card.
- **One at a time:** the next page is fetched a few panels ahead.

Votes in a feed are saved in place (`components/LiveCard.tsx`), so the list keeps its position and the result appears on the card you voted on. Without scripts the same forms submit normally.

On the server, each page is a keyset query on an index, never an offset: most-voted for visitors; for signed-in readers a mix of contested, newly asked and lottery streams that don't overlap (`lib/feed.ts`). Vote counters live on each question and are kept by a database trigger.

## AI answers

`npm run ai:answers` asks a model (default `claude-haiku-5-5`, needs `ANTHROPIC_API_KEY`) to answer the catalog and stores the result in `ai_answers`. These are not votes. They are shown on a question's page with an "answered" label once the split is visible, and never enter a tally, percentage or statistic. The site's numbers are people only.

## Who sees how many votes

| Viewer | Before voting | After voting |
|---|---|---|
| No account | Percentages only | n/a |
| Free account | A rounded total: `<1k`, `45K`, `8.2M` | Exact counts for each answer |
| Paid account | Exact total | Exact counts for each answer |

Signed-in viewers don't see the split itself until they vote or choose "Show results first". The rules live in `lib/access.ts` and apply to pages and the stats API alike.

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

## Who sees how much detail

The split rewards the vote; the depth is what membership and the API sell. Each level includes the ones before it.

| Viewer | Question page | Stats API |
|---|---|---|
| No account, or free before voting | The split | Percentages (plus `estimatedVotes` for a free account) |
| Free, after voting | Exact counts and one figure: the share who have changed their mind | The same |
| Paid | Four conviction figures, the 14-day trend, public versus private | The same |
| API key | (pages never show more than paid) | Arrival routes, plus the `as_of` and `active_since` filters |

## Stats API

```
GET /api/questions/:id/stats
GET /api/questions/:id/stats?as_of=2026-11-01T00:00:00Z&active_since=2026-10-13T00:00:00Z
Authorization: Bearer <key>
```

- `as_of`: the vote as it stood at that moment. Defaults to now.
- `active_since`: count only accounts active at or after that moment.

Both filters need an API key. Keys are listed in the `API_KEYS` environment variable until key management exists. The response includes an `access` field naming the level it was served at.

## Layout

```
app/            pages, server actions (app/actions.ts), the feed and stats API routes
components/     question card, live card and feed list (lazy loading), split bar, chart wrapper,
                layout switcher, header
lib/            auth, questions (search, ask), votes (rules), stats, charts, access (count gating),
                feed, view (layout preference), limits, moderation
db/             SQL migrations and runner, the question catalog and its loader, the AI answers
                script, development-only demo votes
tests/          rule tests
```

## Highcharts licence

Highcharts is free for personal and non-commercial use and needs a paid licence for commercial use. All charts go through `components/Chart.tsx` and `lib/charts.ts`, so swapping in another library touches two files.

## Not built yet

- SMS confirmation of the phone number (the number is taken on trust for now)
- Model-based duplicate and question-quality check (`lib/moderation.ts` is the hook; today only exact repeats are refused)
- Verification, attribute attestations (home state, age band), and demographic filters
- Follows, profiles, tags, and sorting user-asked questions into subjects
- Question families, event dates, archiving and "Did X happen?" successors
- Payments, API key management and metering, embeds, reporting and moderator tools
- Search cap for visitors without an account
