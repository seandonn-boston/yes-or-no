import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { query } from "./db";
import type { Tier } from "./limits";

const SESSION_COOKIE = "bm_session";
const SESSION_DAYS = 30;

export type Account = { id: number; username: string; tier: Tier; verified: boolean };

export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10) digits = "1" + digits; // assume US/Canada when no country code is given
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function hashPhone(digits: string): string {
  const pepper = process.env.PHONE_PEPPER;
  if (!pepper) throw new Error("PHONE_PEPPER is not set");
  return createHmac("sha256", pepper).update(digits).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function startSession(accountId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query("insert into sessions (token_hash, account_id, expires_at) values ($1, $2, $3)", [
    hashToken(token),
    accountId,
    expires,
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires,
    path: "/",
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from sessions where token_hash = $1", [hashToken(token)]);
  store.delete(SESSION_COOKIE);
}

// The signed-in account for this request, or null. Also keeps last_active_at fresh (at most hourly),
// which the stats API uses for "accounts active since" filters.
export const getAccount = cache(async (): Promise<Account | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await query<Account & { stale: boolean }>(
    `select a.id, a.username, a.tier, a.verified, a.last_active_at < now() - interval '1 hour' as stale
       from sessions s join accounts a on a.id = s.account_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.stale) await query("update accounts set last_active_at = now() where id = $1", [row.id]);
  return { id: row.id, username: row.username, tier: row.tier, verified: row.verified };
});
