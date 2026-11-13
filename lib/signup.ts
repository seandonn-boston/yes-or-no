import { createHash, randomBytes } from "crypto";
import { query, transaction } from "./db";
import { hashPassword, hashPhone, normalizePhone } from "./auth";
import { hit, RULES, tooMany } from "./rate-limit";
import { checkCode, sendCode } from "./sms";

// Signing up is two steps: details first, then the code texted to the phone. The account is
// only created once the code checks out.

const EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_SECONDS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type StartInput = { username: string; phone: string; password: string; adult: boolean; consent: boolean; next: string; ip: string };
export type StartResult = { ok: true; token: string } | { ok: false; error: string };

export async function startSignup(input: StartInput): Promise<StartResult> {
  const username = input.username.trim().toLowerCase();
  const digits = normalizePhone(input.phone);
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { ok: false, error: "Usernames are 3 to 20 letters, numbers or underscores." };
  if (/^(deleted|admin|moderator|support|beliefmap)/.test(username)) return { ok: false, error: "That username is taken." };
  if (input.password.length < 8) return { ok: false, error: "Passwords need at least 8 characters." };
  if (input.password.length > 200) return { ok: false, error: "Passwords can be at most 200 characters." };
  if (!digits) return { ok: false, error: "Enter a valid phone number, with country code if outside the US or Canada." };
  if (!input.adult) return { ok: false, error: "You must be 18 or older to hold an account." };
  if (!input.consent) return { ok: false, error: "You need to accept the terms and privacy policy to create an account." };

  const phoneHash = hashPhone(digits);
  const limited = await hit(
    [RULES.signupPerIp, input.ip],
    [RULES.smsPerIp, input.ip],
    [RULES.smsPerPhone, phoneHash],
    [RULES.smsPerPhoneDay, phoneHash],
  );
  if (limited) return { ok: false, error: tooMany(limited) };

  const [taken] = await query<{ username: boolean; phone: boolean }>(
    `select exists(select 1 from accounts where username = $1) as username,
            exists(select 1 from accounts where phone_hash = $2) as phone`,
    [username, phoneHash],
  );
  if (taken.phone) return { ok: false, error: "That phone number already has an account. Sign in instead." };
  if (taken.username) return { ok: false, error: "That username is taken." };

  const e164 = `+${digits}`;
  const sent = await sendCode(e164);
  if (!sent.ok) return sent;

  const token = randomBytes(24).toString("base64url");
  await query("delete from pending_signups where phone_hash = $1 or expires_at < now()", [phoneHash]);
  await query(
    `insert into pending_signups (token_hash, username, phone, phone_hash, password_hash, code_hash, next_path, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + interval '${EXPIRY_MINUTES} minutes')`,
    [hashToken(token), username, e164, phoneHash, hashPassword(input.password), sent.devCodeHash ?? null, input.next],
  );
  return { ok: true, token };
}

type Pending = {
  token_hash: string; username: string; phone: string; phone_hash: string; password_hash: string;
  code_hash: string | null; attempts: number; next_path: string; seconds_since_send: number;
};

async function pending(token: string): Promise<Pending | null> {
  const rows = await query<Pending>(
    `select *, extract(epoch from now() - last_sent_at)::int as seconds_since_send
       from pending_signups where token_hash = $1 and expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

// The last four digits, for "we texted a code to ••• 1234".
export async function pendingSummary(token: string): Promise<{ phoneEnding: string } | null> {
  const row = await pending(token);
  return row ? { phoneEnding: row.phone.slice(-4) } : null;
}

export type VerifyResult = { ok: true; accountId: number; next: string } | { ok: false; error: string; restart?: boolean };

export async function verifySignup(token: string, code: string): Promise<VerifyResult> {
  const row = await pending(token);
  if (!row) return { ok: false, error: "That code has expired. Start again.", restart: true };
  if (row.attempts >= MAX_ATTEMPTS) {
    await query("delete from pending_signups where token_hash = $1", [row.token_hash]);
    return { ok: false, error: "Too many wrong codes. Start again.", restart: true };
  }
  await query("update pending_signups set attempts = attempts + 1 where token_hash = $1", [row.token_hash]);
  const ok = await checkCode(row.phone, code.replace(/\s/g, ""), row.code_hash);
  if (!ok) {
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return { ok: false, error: left > 0 ? `That code didn't match. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code didn't match." };
  }

  try {
    return await transaction(async (client) => {
      const created = await client.query<{ id: number }>(
        `insert into accounts (username, phone_hash, password_hash, consented_at, phone_verified_at)
         values ($1, $2, $3, now(), now()) returning id`,
        [row.username, row.phone_hash, row.password_hash],
      );
      await client.query("delete from pending_signups where token_hash = $1", [row.token_hash]);
      return { ok: true as const, accountId: created.rows[0].id, next: row.next_path };
    });
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e.code !== "23505") throw err;
    await query("delete from pending_signups where token_hash = $1", [row.token_hash]);
    return {
      ok: false,
      restart: true,
      error: e.constraint?.includes("phone") ? "That phone number already has an account. Sign in instead." : "Someone just took that username. Start again with another.",
    };
  }
}

export async function resendCode(token: string, ip: string): Promise<{ ok: boolean; error?: string }> {
  const row = await pending(token);
  if (!row) return { ok: false, error: "That code has expired. Start again." };
  if (row.seconds_since_send < RESEND_AFTER_SECONDS) {
    return { ok: false, error: `Wait ${RESEND_AFTER_SECONDS - row.seconds_since_send} seconds before asking for another code.` };
  }
  const limited = await hit([RULES.smsPerIp, ip], [RULES.smsPerPhone, row.phone_hash], [RULES.smsPerPhoneDay, row.phone_hash]);
  if (limited) return { ok: false, error: tooMany(limited) };
  const sent = await sendCode(row.phone);
  if (!sent.ok) return sent;
  await query(
    `update pending_signups set sends = sends + 1, last_sent_at = now(), attempts = 0,
            code_hash = coalesce($2, code_hash) where token_hash = $1`,
    [row.token_hash, sent.devCodeHash ?? null],
  );
  return { ok: true };
}
