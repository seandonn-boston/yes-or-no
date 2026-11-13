import Stripe from "stripe";
import { query } from "./db";

// Membership is a Stripe subscription. Stripe is the source of truth: every webhook re-reads
// the subscription from Stripe and sets the account's tier from its status.
//
// Without STRIPE_SECRET_KEY, outside production, a development mode switches the tier
// directly so the paid experience can be tried locally. In production without Stripe,
// joining is unavailable.

const KEY = process.env.STRIPE_SECRET_KEY;
const PRICE = process.env.STRIPE_PRICE_ID;

export const billingMode: "stripe" | "dev" | "off" =
  KEY && PRICE ? "stripe" : process.env.NODE_ENV === "production" ? "off" : "dev";

let client: Stripe | null = null;
const stripe = () => (client ??= new Stripe(KEY!));

// Statuses that keep membership benefits. past_due covers Stripe's retry window after a
// failed renewal.
const PAID = new Set(["active", "trialing", "past_due"]);

export function siteUrl(): string {
  const url = process.env.SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return url.replace(/\/$/, "");
}

type Member = { id: number; tier: "free" | "paid" };

export async function startCheckout(account: Member): Promise<{ url: string } | { error: string }> {
  if (account.tier === "paid") return { url: "/membership" };
  if (billingMode === "off") return { error: "Membership isn't available yet." };
  if (billingMode === "dev") {
    await query("update accounts set tier = 'paid', subscription_status = 'dev' where id = $1", [account.id]);
    return { url: "/membership?welcome=1" };
  }
  const [row] = await query<{ stripe_customer_id: string | null }>(
    "select stripe_customer_id from accounts where id = $1",
    [account.id],
  );
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: PRICE!, quantity: 1 }],
    client_reference_id: String(account.id),
    customer: row?.stripe_customer_id ?? undefined,
    subscription_data: { metadata: { account_id: String(account.id) } },
    metadata: { account_id: String(account.id) },
    allow_promotion_codes: true,
    success_url: `${siteUrl()}/membership?welcome=1`,
    cancel_url: `${siteUrl()}/membership`,
  });
  return session.url ? { url: session.url } : { error: "Checkout didn't open. Try again." };
}

// Stripe's own page for changing card details, seeing invoices or cancelling.
export async function billingPortal(account: Member): Promise<{ url: string } | { error: string }> {
  if (billingMode === "dev") {
    await query("update accounts set tier = 'free', subscription_status = 'canceled' where id = $1", [account.id]);
    return { url: "/membership" };
  }
  if (billingMode === "off") return { error: "Billing isn't available." };
  const [row] = await query<{ stripe_customer_id: string | null }>("select stripe_customer_id from accounts where id = $1", [account.id]);
  if (!row?.stripe_customer_id) return { error: "There's no billing record for this account yet." };
  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${siteUrl()}/settings`,
  });
  return { url: session.url };
}

async function applySubscription(subscriptionId: string, accountHint?: number): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const metaId = Number(sub.metadata?.account_id);
  const accountId = accountHint ?? (Number.isInteger(metaId) && metaId > 0 ? metaId : null);
  const tier = PAID.has(sub.status) ? "paid" : "free";
  const params = [customer, sub.status, tier];
  const updated = accountId
    ? await query(
        `update accounts set stripe_customer_id = $1, subscription_status = $2, tier = $3
          where id = $4 and deleted_at is null returning id`,
        [...params, accountId],
      )
    : await query(
        `update accounts set subscription_status = $2, tier = $3 where stripe_customer_id = $1 and deleted_at is null returning id`,
        params,
      );
  if (!updated.length) console.warn("stripe subscription for an unknown or deleted account", subscriptionId);
}

export type WebhookResult = { status: number; body: string };

export async function handleWebhook(payload: string, signature: string | null): Promise<WebhookResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (billingMode !== "stripe" || !secret) return { status: 404, body: "billing not configured" };
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature ?? "", secret);
  } catch {
    return { status: 400, body: "bad signature" };
  }
  const seen = await query("select 1 from stripe_events where id = $1", [event.id]);
  if (seen.length) return { status: 200, body: "already handled" };

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const accountId = Number(session.client_reference_id);
    if (session.mode === "subscription" && session.subscription && Number.isInteger(accountId)) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await applySubscription(subId, accountId);
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.paused" ||
    event.type === "customer.subscription.resumed"
  ) {
    await applySubscription(event.data.object.id);
  }

  await query("insert into stripe_events (id) values ($1) on conflict do nothing", [event.id]);
  return { status: 200, body: "ok" };
}

// Before an account is deleted, stop any subscription so the person is never billed again.
export async function cancelForDeletion(accountId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await query<{ stripe_customer_id: string | null }>("select stripe_customer_id from accounts where id = $1", [accountId]);
  if (billingMode !== "stripe" || !row?.stripe_customer_id) return { ok: true };
  try {
    const subs = await stripe().subscriptions.list({ customer: row.stripe_customer_id, status: "all", limit: 20 });
    for (const sub of subs.data) {
      if (!["canceled", "incomplete_expired"].includes(sub.status)) await stripe().subscriptions.cancel(sub.id);
    }
    return { ok: true };
  } catch (err) {
    console.error("stripe cancel before deletion failed", (err as Error).message);
    return { ok: false, error: "We couldn't cancel your membership, so the account wasn't deleted. Try again in a minute." };
  }
}
