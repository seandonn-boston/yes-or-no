import { handleWebhook } from "@/lib/billing";

// POST /api/stripe/webhook: subscription changes from Stripe. The raw body is needed to check
// Stripe's signature, so it is read as text, never parsed first.
export async function POST(request: Request) {
  const result = await handleWebhook(await request.text(), request.headers.get("stripe-signature"));
  return new Response(result.body, { status: result.status });
}
