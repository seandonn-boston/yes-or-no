import { createHash, randomInt } from "crypto";

// Phone codes are sent and checked by Twilio Verify, which holds the code itself.
// Without Twilio credentials, outside production, a development mode makes its own code and
// prints it to the server log, so signup works on a laptop. SMS_DEV_CODE fixes that code for
// automated tests. In production without Twilio, signup is closed rather than unverified.

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SERVICE = process.env.TWILIO_VERIFY_SERVICE_SID;

export const smsMode: "twilio" | "dev" | "off" =
  SID && TOKEN && SERVICE ? "twilio" : process.env.NODE_ENV === "production" ? "off" : "dev";

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

async function twilio(path: string, body: Record<string, string>) {
  const response = await fetch(`https://verify.twilio.com/v2/Services/${SERVICE}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const data = (await response.json().catch(() => ({}))) as { status?: string; message?: string; code?: number };
  return { ok: response.ok, status: response.status, data };
}

export type SendResult = { ok: true; devCodeHash?: string } | { ok: false; error: string };

// `e164` is "+" followed by digits.
export async function sendCode(e164: string): Promise<SendResult> {
  if (smsMode === "off") return { ok: false, error: "Phone verification isn't set up on this server yet." };
  if (smsMode === "dev") {
    const code = process.env.SMS_DEV_CODE || String(randomInt(0, 1_000_000)).padStart(6, "0");
    console.log(`[sms dev mode] code for ${e164.slice(0, -4).replace(/\d/g, "•")}${e164.slice(-4)}: ${code}`);
    return { ok: true, devCodeHash: hashCode(code) };
  }
  const { ok, data } = await twilio("Verifications", { To: e164, Channel: "sms" });
  if (ok) return { ok: true };
  // 60200: invalid parameter, 60205: landline or unreachable, 60410: blocked prefix.
  if (data.code === 60200 || data.code === 60205) return { ok: false, error: "That number can't receive text messages." };
  if (data.code === 60410) return { ok: false, error: "Texts to that number aren't allowed." };
  console.error("twilio verify send failed", data.code, data.message);
  return { ok: false, error: "The text didn't send. Try again in a minute." };
}

export async function checkCode(e164: string, code: string, devCodeHash: string | null): Promise<boolean> {
  if (!/^\d{4,10}$/.test(code)) return false;
  if (smsMode === "dev") return Boolean(devCodeHash) && hashCode(code) === devCodeHash;
  if (smsMode === "off") return false;
  const { ok, data } = await twilio("VerificationCheck", { To: e164, Code: code });
  return ok && data.status === "approved";
}
