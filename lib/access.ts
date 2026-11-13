import type { Tier } from "./limits";
import { percentages, type QuestionStats, type Tally } from "./stats";

// How much anyone may know about the number of votes on a question.
//   none      no account: percentages only
//   estimate  free account, before voting: a rounded figure such as "45K" or "<1k"
//   full      free account after voting, any paid account, API tiers: exact counts
export type CountAccess = "none" | "estimate" | "full";

export function countAccess(account: { tier: Tier } | null, hasVoted: boolean): CountAccess {
  if (!account) return "none";
  if (account.tier === "paid" || hasVoted) return "full";
  return "estimate";
}

// 312 -> "<1k", 4,512 -> "4.5K", 45,212 -> "45K", 8,240,000 -> "8.2M"
export function estimate(n: number): string {
  if (n < 1000) return "<1k";
  const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (n < size) continue;
    const scaled = n / size;
    // Round down so an estimate never overstates, and never rolls over into the next unit.
    const text = scaled < 10 ? (Math.floor(scaled * 10) / 10).toFixed(1).replace(/\.0$/, "") : String(Math.floor(scaled));
    return text + suffix;
  }
  return "<1k";
}

// "about 45K votes", or "<1k votes" below a thousand.
export function estimateLabel(n: number): string {
  const e = estimate(n);
  return e.startsWith("<") ? `${e} votes` : `about ${e} votes`;
}

export type Shown = {
  hasVotes: boolean;
  split: { true: number; false: number; unsure: number } | null; // null while results are hidden
  sides: Tally | null;        // exact per-answer counts
  totalLabel: string | null;  // "45,212 votes", "about 45K votes", "<1k votes", or nothing
};

type Viewer = {
  account: { tier: Tier } | null;
  voted: boolean;
  revealed?: boolean;   // chose to see results before voting
  closed?: boolean;     // archived questions show their results to everyone
};

// Everything a card or page may display about a question's votes, for this viewer.
// Signed-in viewers don't see the split until they vote (or ask to), so a first vote is their own.
export function present(tally: Tally, viewer: Viewer): Shown {
  const access = countAccess(viewer.account, viewer.voted);
  const splitVisible = !viewer.account || viewer.voted || Boolean(viewer.revealed) || Boolean(viewer.closed);
  const votes = (n: string) => `${n} ${n === "1" ? "vote" : "votes"}`;
  return {
    hasVotes: tally.total > 0,
    split: splitVisible ? percentages(tally) : null,
    sides: access === "full" && splitVisible ? tally : null,
    totalLabel:
      access === "full" ? votes(tally.total.toLocaleString("en-US"))
      : access === "estimate" ? estimateLabel(tally.total)
      : null,
  };
}

// How much of a question's detail a viewer gets. Each level includes the ones before it.
//   visitor  no account, or a free account that hasn't voted: the split only
//   voter    free account after voting: exact counts and one headline figure
//   member   paid account: conviction figures, the 14-day trend, public versus private
//   api      API key: arrival routes, and the as_of / active_since filters
// Pages never go above `member`; the deepest data is sold through the API.
export type DetailLevel = "visitor" | "voter" | "member" | "api";

export function detailLevel(account: { tier: Tier } | null, hasVoted: boolean, hasApiKey = false): DetailLevel {
  if (hasApiKey) return "api";
  if (account?.tier === "paid") return "member";
  if (account && hasVoted) return "voter";
  return "visitor";
}

// The stats API response for a given level. Nothing above the caller's level is included.
export function shapeStats(stats: QuestionStats, level: DetailLevel, estimatedVotes?: string) {
  const base = { asOf: stats.asOf, percentages: stats.percentages };
  if (level === "visitor") return estimatedVotes ? { ...base, estimatedVotes } : base;
  const voter = { ...base, tally: stats.tally, pctChangedMind: stats.churn.pctChangedMind };
  if (level === "voter") return voter;
  const member = {
    ...voter,
    churn: stats.churn,
    blindFirstVotes: stats.blindFirstVotes,
    visibility: stats.visibility,
    history: stats.history,
  };
  if (level === "member") return member;
  return { ...member, activeSince: stats.activeSince, sources: stats.sources };
}

// API keys come from the API_KEYS environment variable (comma-separated) until key management exists.
export function isApiKey(authorization: string | null): boolean {
  const key = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!key) return false;
  return (process.env.API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean).includes(key);
}
