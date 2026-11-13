import { createHash } from "crypto";
import { query } from "./db";

// Fixed-window rate limits stored in Postgres, so they hold across every server instance.
// Keys are hashed before storage; phone numbers and IPs never sit in this table in the clear.

export type Rule = { name: string; limit: number; windowSeconds: number };

export const RULES = {
  smsPerPhone:     { name: "sms-phone",    limit: 3,   windowSeconds: 15 * 60 },
  smsPerPhoneDay:  { name: "sms-phone-d",  limit: 6,   windowSeconds: 24 * 3600 },
  smsPerIp:        { name: "sms-ip",       limit: 10,  windowSeconds: 3600 },
  signupPerIp:     { name: "signup-ip",    limit: 10,  windowSeconds: 3600 },
  loginPerName:    { name: "login-name",   limit: 8,   windowSeconds: 15 * 60 },
  loginPerIp:      { name: "login-ip",     limit: 40,  windowSeconds: 15 * 60 },
  votesPerAccount: { name: "vote-acct",    limit: 60,  windowSeconds: 60 },
  asksPerAccount:  { name: "ask-acct",     limit: 5,   windowSeconds: 60 },
  reportsPerAccount: { name: "report-acct", limit: 20, windowSeconds: 3600 },
  feedPerIp:       { name: "feed-ip",      limit: 120, windowSeconds: 60 },
  statsPerIp:      { name: "stats-ip",     limit: 60,  windowSeconds: 60 },
  checkoutPerAccount: { name: "checkout",  limit: 10,  windowSeconds: 3600 },
} satisfies Record<string, Rule>;

const keyFor = (rule: Rule, subject: string) =>
  `${rule.name}:${createHash("sha256").update(`${process.env.PHONE_PEPPER ?? ""}:${subject}`).digest("hex").slice(0, 32)}`;

// Counts one hit against each rule and returns the first rule that is now over its limit,
// or null if every rule still has room.
export async function hit(...checks: [Rule, string][]): Promise<Rule | null> {
  const now = Date.now();
  for (const [rule, subject] of checks) {
    const windowStart = new Date(Math.floor(now / (rule.windowSeconds * 1000)) * rule.windowSeconds * 1000);
    const [row] = await query<{ hits: number }>(
      `insert into rate_limits (key, window_start, hits) values ($1, $2, 1)
       on conflict (key, window_start) do update set hits = rate_limits.hits + 1
       returning hits`,
      [keyFor(rule, subject), windowStart],
    );
    if (row.hits > rule.limit) return rule;
  }
  // Now and then, clear out windows that ended more than a day ago.
  if (Math.random() < 0.01) await query("delete from rate_limits where window_start < now() - interval '2 days'");
  return null;
}

export function tooMany(rule: Rule): string {
  const minutes = Math.ceil(rule.windowSeconds / 60);
  const span = minutes >= 1440 ? "tomorrow" : minutes >= 60 ? `in ${Math.round(minutes / 60)} hour${minutes >= 120 ? "s" : ""}` : `in ${minutes} minutes`;
  return `Too many attempts. Try again ${span}.`;
}
