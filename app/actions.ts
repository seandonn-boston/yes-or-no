"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { endSession, getAccount, startSession, verifyPassword } from "@/lib/auth";
import { hit, RULES, tooMany } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { resendCode, startSignup, verifySignup } from "@/lib/signup";
import { toCard, type CardItem } from "@/lib/cards";
import { deleteAccount } from "@/lib/account";
import { billingPortal, cancelForDeletion, startCheckout } from "@/lib/billing";
import { CATEGORIES } from "@/lib/categories";
import { decide, report, REPORT_REASONS, type Decision, type ReportReason } from "@/lib/moderation";
import { ask } from "@/lib/questions";
import { VIEW_COOKIE, VIEWS, type View } from "@/lib/view";
import {
  castVote, deleteVote, myVotes, reveal, setVisibility, skip, SOURCES, VOTE_VALUES, type Source, type VoteValue,
} from "@/lib/votes";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

// Where to send the browser afterwards. Only same-site paths are accepted.
function backPath(form: FormData): string {
  const back = str(form, "back");
  return back.startsWith("/") && !back.startsWith("//") ? back : "/";
}

function withError(path: string, message: string): string {
  const [base, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("error", message);
  return `${base}?${params}`;
}

// Clears any stale error, and optionally marks which question was just voted on so the page
// can show its results (a voted question otherwise drops out of the feed unseen).
function withoutError(path: string, votedId?: number): string {
  const [base, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.delete("error");
  params.delete("voted");
  if (votedId) params.set("voted", String(votedId));
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

async function requireAccount(form: FormData) {
  const account = await getAccount();
  if (!account) redirect(`/login?next=${encodeURIComponent(backPath(form))}`);
  return account;
}

const questionId = (form: FormData) => {
  const id = Number(str(form, "questionId"));
  return Number.isInteger(id) && id > 0 ? id : null;
};

const source = (form: FormData): Source => {
  const s = str(form, "source") as Source;
  return SOURCES.includes(s) ? s : "direct";
};

export async function signupAction(form: FormData) {
  const next = backPath(form);
  const result = await startSignup({
    username: str(form, "username"),
    phone: str(form, "phone"),
    password: String(form.get("password") ?? ""),
    adult: form.get("adult") === "on",
    consent: form.get("consent") === "on",
    next,
    ip: await clientIp(),
  });
  if (!result.ok) redirect(withError(`/signup?next=${encodeURIComponent(next)}`, result.error));
  redirect(`/signup/verify?t=${result.token}`);
}

export async function verifySignupAction(form: FormData) {
  const token = str(form, "token");
  const result = await verifySignup(token, str(form, "code"));
  if (!result.ok) {
    redirect(result.restart ? withError("/signup", result.error) : withError(`/signup/verify?t=${token}`, result.error));
  }
  await startSession(result.accountId);
  redirect(result.next.startsWith("/") && !result.next.startsWith("//") ? result.next : "/");
}

export async function resendCodeAction(form: FormData) {
  const token = str(form, "token");
  const result = await resendCode(token, await clientIp());
  redirect(result.ok ? `/signup/verify?t=${token}&sent=1` : withError(`/signup/verify?t=${token}`, result.error!));
}

export async function loginAction(form: FormData) {
  const username = str(form, "username").toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = backPath(form);
  const limited = await hit([RULES.loginPerIp, await clientIp()], [RULES.loginPerName, username]);
  if (limited) redirect(withError(`/login?next=${encodeURIComponent(next)}`, tooMany(limited)));
  const rows = await query<{ id: number; password_hash: string }>(
    "select id, password_hash from accounts where username = $1 and deleted_at is null",
    [username],
  );
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) {
    redirect(withError(`/login?next=${encodeURIComponent(next)}`, "Wrong username or password."));
  }
  await startSession(rows[0].id);
  redirect(next);
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

export async function askAction(form: FormData) {
  const account = await requireAccount(form);
  const limited = await hit([RULES.asksPerAccount, String(account.id)]);
  if (limited) redirect(withError(backPath(form), tooMany(limited)));
  const result = await ask(account, str(form, "text"));
  if (result.ok) redirect(`/q/${result.id}${result.held ? "?held=1" : ""}`);
  if (result.existingId) redirect(withError(`/q/${result.existingId}`, result.error));
  redirect(withError(backPath(form), result.error));
}

export async function voteAction(form: FormData) {
  const account = await requireAccount(form);
  const back = backPath(form);
  const limited = await hit([RULES.votesPerAccount, String(account.id)]);
  if (limited) redirect(withError(back, tooMany(limited)));
  const id = questionId(form);
  const value = str(form, "value") as VoteValue;
  if (!id || !VOTE_VALUES.includes(value)) redirect(withError(back, "That vote wasn't valid."));
  const result = await castVote(account, id!, value, form.get("private") === "on", source(form));
  redirect(result.ok ? withoutError(back, id!) : withError(back, result.error));
}

export async function deleteVoteAction(form: FormData) {
  const account = await requireAccount(form);
  const back = backPath(form);
  const id = questionId(form);
  if (!id) redirect(withError(back, "That question wasn't found."));
  const result = await deleteVote(account, id!, source(form));
  redirect(result.ok ? withoutError(back) : withError(back, result.error));
}

export async function visibilityAction(form: FormData) {
  const account = await requireAccount(form);
  const back = backPath(form);
  const id = questionId(form);
  if (!id) redirect(withError(back, "That question wasn't found."));
  const result = await setVisibility(account, id!, str(form, "to") === "private");
  redirect(result.ok ? withoutError(back) : withError(back, result.error));
}

export async function skipAction(form: FormData) {
  const account = await requireAccount(form);
  const id = questionId(form);
  if (id) await skip(account, id);
  redirect(withoutError(backPath(form)));
}

export async function revealAction(form: FormData) {
  const account = await requireAccount(form);
  const id = questionId(form);
  if (id) await reveal(account, id);
  redirect(withoutError(backPath(form)));
}

// Remember how this browser likes its question lists laid out.
export async function setViewAction(form: FormData) {
  const view = str(form, "view") as View;
  if (VIEWS.includes(view)) {
    (await cookies()).set(VIEW_COOKIE, view, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  redirect(withoutError(backPath(form)));
}

// ---- In-place versions, called from the feed so a vote never reloads the page ----

export type InlineResult = { ok: true; card: CardItem } | { ok: false; error: string };

async function cardFor(questionId: number, account: { id: number; tier: "free" | "paid" }, slot: Source): Promise<InlineResult> {
  const rows = await query<{ id: number; text: string; status: string; category: string; t: number; f: number; u: number }>(
    `select id, text, status, category, true_count as t, false_count as f, unsure_count as u
       from questions where id = $1 and status <> 'removed'`,
    [questionId],
  );
  if (!rows[0]) return { ok: false, error: "That question wasn't found." };
  const mine = await myVotes(account.id, [questionId]);
  return { ok: true, card: toCard({ ...rows[0], slot }, account, mine.get(questionId) ?? null) };
}

type InlineInput = { questionId: number; source: string };
const cleanSource = (s: string): Source => (SOURCES.includes(s as Source) ? (s as Source) : "direct");
const validId = (id: number) => Number.isInteger(id) && id > 0;

export async function voteInline(input: InlineInput & { value: string; isPrivate: boolean }): Promise<InlineResult> {
  const account = await getAccount();
  if (!account) return { ok: false, error: "Sign in to vote." };
  const limited = await hit([RULES.votesPerAccount, String(account.id)]);
  if (limited) return { ok: false, error: tooMany(limited) };
  if (!validId(input.questionId) || !VOTE_VALUES.includes(input.value as VoteValue)) {
    return { ok: false, error: "That vote wasn't valid." };
  }
  const slot = cleanSource(input.source);
  const result = await castVote(account, input.questionId, input.value as VoteValue, input.isPrivate, slot);
  return result.ok ? cardFor(input.questionId, account, slot) : result;
}

export async function deleteVoteInline(input: InlineInput): Promise<InlineResult> {
  const account = await getAccount();
  if (!account) return { ok: false, error: "Sign in to vote." };
  if (!validId(input.questionId)) return { ok: false, error: "That question wasn't found." };
  const slot = cleanSource(input.source);
  const result = await deleteVote(account, input.questionId, slot);
  return result.ok ? cardFor(input.questionId, account, slot) : result;
}

export async function skipInline(input: InlineInput): Promise<{ ok: boolean }> {
  const account = await getAccount();
  if (!account || !validId(input.questionId)) return { ok: false };
  await skip(account, input.questionId);
  return { ok: true };
}

// ---------- Reports and moderation ----------

export async function reportAction(form: FormData) {
  const account = await requireAccount(form);
  const back = backPath(form);
  const id = questionId(form);
  const reason = str(form, "reason") as ReportReason;
  if (!id || !REPORT_REASONS.some((r) => r.value === reason)) redirect(withError(back, "Choose a reason for the report."));
  const limited = await hit([RULES.reportsPerAccount, String(account.id)]);
  if (limited) redirect(withError(back, tooMany(limited)));
  await report(account.id, id!, reason, str(form, "note"));
  const [base, search = ""] = withoutError(back).split("?");
  const params = new URLSearchParams(search);
  params.set("reported", "1");
  redirect(`${base}?${params}`);
}

export async function moderateAction(form: FormData) {
  const account = await getAccount();
  if (!account || account.role === "user") redirect("/");
  const id = questionId(form);
  const action = str(form, "action");
  let decision: Decision | null = null;
  if (action === "approve" || action === "remove" || action === "archive") decision = { action };
  if (action === "duplicate") {
    const of = Number(str(form, "of").replace(/^#/, ""));
    if (Number.isInteger(of) && of > 0) decision = { action, of };
  }
  if (action === "category") {
    const category = str(form, "category");
    const match = CATEGORIES.find((c) => c.slug === category);
    if (match) decision = { action, category: match.slug };
  }
  if (!id || !decision) redirect(withError("/mod", "That decision wasn't complete."));
  const error = await decide(account!.id, id!, decision!);
  redirect(error ? withError("/mod", error) : `/mod?done=${id}`);
}

// ---------- Membership ----------

export async function checkoutAction(form: FormData) {
  const account = await requireAccount(form);
  const limited = await hit([RULES.checkoutPerAccount, String(account.id)]);
  if (limited) redirect(withError("/membership", tooMany(limited)));
  const result = await startCheckout(account);
  redirect("url" in result ? result.url : withError("/membership", result.error));
}

export async function billingPortalAction(form: FormData) {
  const account = await requireAccount(form);
  const result = await billingPortal(account);
  redirect("url" in result ? result.url : withError("/settings", result.error));
}

// ---------- Account ----------

export async function deleteAccountAction(form: FormData) {
  const account = await requireAccount(form);
  const fail = (message: string) => redirect(withError("/settings", message));
  if (str(form, "confirm").toLowerCase() !== account.username) fail("Type your username to confirm.");
  const [row] = await query<{ password_hash: string }>("select password_hash from accounts where id = $1", [account.id]);
  const limited = await hit([RULES.loginPerName, account.username]);
  if (limited) fail(tooMany(limited));
  if (!row || !verifyPassword(String(form.get("password") ?? ""), row.password_hash)) fail("That password isn't right.");
  const cancelled = await cancelForDeletion(account.id);
  if (!cancelled.ok) fail(cancelled.error);
  await deleteAccount(account.id);
  await endSession();
  redirect("/goodbye");
}
