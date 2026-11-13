// Twilio and Stripe, with their network calls replaced, so the request shapes and webhook
// checks are tested without real accounts.
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.TWILIO_ACCOUNT_SID = "AC_test";
process.env.TWILIO_AUTH_TOKEN = "token_test";
process.env.TWILIO_VERIFY_SERVICE_SID = "VA_test";
process.env.STRIPE_SECRET_KEY = "sk_test_123";
process.env.STRIPE_PRICE_ID = "price_test";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

const realFetch = globalThis.fetch;
const calls: { url: string; body: string; auth: string | null }[] = [];

after(async () => {
  globalThis.fetch = realFetch;
  const { pool } = await import("../lib/db");
  await pool.query("delete from stripe_events where id like 'evt_test_%'");
  await pool.end();
});

test("Twilio Verify: sends and checks codes with the right requests", async () => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body), auth: new Headers(init.headers).get("authorization") });
    const approved = String(init.body).includes("Code=123456");
    const payload = url.endsWith("VerificationCheck") ? { status: approved ? "approved" : "pending" } : { status: "pending" };
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;
  const sms = await import("../lib/sms");
  assert.equal(sms.smsMode, "twilio");
  assert.deepEqual(await sms.sendCode("+16175550100"), { ok: true });
  assert.equal(calls[0].url, "https://verify.twilio.com/v2/Services/VA_test/Verifications");
  assert.equal(calls[0].body, "To=%2B16175550100&Channel=sms");
  assert.equal(calls[0].auth, `Basic ${Buffer.from("AC_test:token_test").toString("base64")}`);
  assert.equal(await sms.checkCode("+16175550100", "123456", null), true);
  assert.equal(await sms.checkCode("+16175550100", "654321", null), false);
  assert.equal(await sms.checkCode("+16175550100", "abc", null), false);
  assert.equal(calls.length, 3); // the malformed code never reaches Twilio

  globalThis.fetch = (async () => new Response(JSON.stringify({ code: 60205, message: "landline" }), { status: 400 })) as typeof fetch;
  const landline = await sms.sendCode("+16175550199");
  assert.deepEqual(landline, { ok: false, error: "That number can't receive text messages." });
});

test("Stripe webhook: rejects bad signatures, records events once", async () => {
  globalThis.fetch = realFetch;
  const Stripe = (await import("stripe")).default;
  const billing = await import("../lib/billing");
  assert.equal(billing.billingMode, "stripe");

  const bad = await billing.handleWebhook("{}", "t=1,v1=nope");
  assert.equal(bad.status, 400);

  // An event type the site ignores, so no call to Stripe's API is needed.
  const id = `evt_test_${Date.now()}`;
  const payload = JSON.stringify({ id, object: "event", type: "invoice.paid", data: { object: {} }, api_version: "2026-10-28.endive", created: 0, livemode: false, pending_webhooks: 0, request: null });
  const header = new Stripe("sk_test_123").webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
  assert.deepEqual(await billing.handleWebhook(payload, header), { status: 200, body: "ok" });
  assert.deepEqual(await billing.handleWebhook(payload, header), { status: 200, body: "already handled" });
});
