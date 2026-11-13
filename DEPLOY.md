# Deploying to Vercel and Neon

About half an hour, most of it creating accounts. Do it in this order.

## 1. Vercel and the database

1. In Vercel, **Add New → Project** and import `seandonn-boston/yes-or-no`. Leave the build settings alone; `vercel.json` sets the build command, which runs database migrations before every build.
2. In the project, open **Storage → Create Database → Neon**. Accept the defaults and connect it to all environments. This adds `DATABASE_URL` for you, using Neon's pooled connection.
3. In Neon, turn on **branching for preview deployments** if offered. Each pull request then gets its own copy of the database, so preview builds never migrate production.

## 2. Required settings

In **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `PHONE_PEPPER` | Output of `openssl rand -hex 32`. Set once and never change it: a new value locks every existing account out. Keep a copy somewhere safe. |
| `SITE_URL` | Your domain, for example `https://beliefmap.com` |
| `MIN_GROUP_SIZE` | `5` |
| `CONTACT_EMAIL`, `OPERATOR_NAME` | Shown on the terms and privacy pages |

Deploy once now. `/api/health` should answer `{"ok":true,...}`.

## 3. Load the questions

From your laptop, with the production `DATABASE_URL` in `.env.local`:

```bash
npm run db:seed:questions
```

Never run `npm run db:seed:demo` against production; it creates fake accounts and refuses to run when `NODE_ENV=production`.

## 4. Phone verification (Twilio)

Signups stay closed in production until this is set up.

1. Create a Twilio account and upgrade it from trial (trial accounts only text verified numbers).
2. **Verify → Services → Create**. Name it Belief Map, code length 6, SMS channel on.
3. Under **Verify → Settings → Geo permissions**, allow only the countries you want to accept signups from. This is the main defence against SMS fraud.
4. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` to Vercel and redeploy.

## 5. Membership (Stripe)

Membership shows "opens soon" in production until this is set up.

1. In Stripe, **Product catalog → Add product**: "Belief Map membership", recurring, $5.00 monthly. Copy the price ID (`price_...`).
2. **Developers → Webhooks → Add endpoint**: `https://<your domain>/api/stripe/webhook`, with these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`. Copy the signing secret (`whsec_...`).
3. **Settings → Billing → Customer portal**: turn on cancellation and payment method updates.
4. Add `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET` to Vercel and redeploy.

Use test-mode keys first and buy a membership with card `4242 4242 4242 4242`. Switch to live keys when that works.

## 6. Moderators

Sign up on the live site, then from your laptop:

```bash
npm run admin:role -- <your username> admin
```

A **Review** link appears in the header for moderators and admins.

## 7. Optional

- `ANTHROPIC_API_KEY`: screens new questions for repeats and harm, and sorts them into subjects. Without it, simple rules hold any question with an unfamiliar name for a moderator.
- `API_KEYS`: comma-separated keys for the stats API.
- An uptime monitor (Better Stack, UptimeRobot) pointed at `/api/health`.
- Errors are logged as JSON lines in Vercel's **Logs** tab. To send them to Sentry, forward them from `instrumentation.ts`.

## Before you open to the public

- Have a lawyer review `/terms` and `/privacy`, then set `LEGAL_DRAFT = false` in `lib/legal.ts`.
- Highcharts needs a commercial licence for a commercial site.
- Neon's free plan keeps 24 hours of history to restore from; a paid plan keeps more.
