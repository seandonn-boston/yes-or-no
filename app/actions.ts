"use server";

import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import {
  endSession, getAccount, hashPassword, hashPhone, normalizePhone, startSession, verifyPassword,
} from "@/lib/auth";
import { ask } from "@/lib/questions";
import {
  castVote, deleteVote, reveal, setVisibility, skip, SOURCES, VOTE_VALUES, type Source, type VoteValue,
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
  const username = str(form, "username").toLowerCase();
  const password = String(form.get("password") ?? "");
  const phone = normalizePhone(str(form, "phone"));
  const next = backPath(form);
  const fail = (message: string) => redirect(withError(`/signup?next=${encodeURIComponent(next)}`, message));

  if (!/^[a-z0-9_]{3,20}$/.test(username)) fail("Usernames are 3 to 20 letters, numbers or underscores.");
  if (password.length < 8) fail("Passwords need at least 8 characters.");
  if (!phone) fail("Enter a valid phone number, with country code if outside the US or Canada.");
  if (form.get("adult") !== "on") fail("You must be 18 or older to hold an account.");
  if (form.get("consent") !== "on") fail("You need to accept the consent agreement to create an account.");

  let accountId: number;
  try {
    const rows = await query<{ id: number }>(
      `insert into accounts (username, phone_hash, password_hash, consented_at)
       values ($1, $2, $3, now()) returning id`,
      [username, hashPhone(phone!), hashPassword(password)],
    );
    accountId = rows[0].id;
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e.code !== "23505") throw err;
    return fail(
      e.constraint?.includes("phone")
        ? "That phone number already has an account."
        : "That username is taken.",
    );
  }
  await startSession(accountId);
  redirect(next);
}

export async function loginAction(form: FormData) {
  const username = str(form, "username").toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = backPath(form);
  const rows = await query<{ id: number; password_hash: string }>(
    "select id, password_hash from accounts where username = $1",
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
  const result = await ask(account, str(form, "text"));
  if (result.ok) redirect(`/q/${result.id}`);
  if (result.existingId) redirect(withError(`/q/${result.existingId}`, result.error));
  redirect(withError(backPath(form), result.error));
}

export async function voteAction(form: FormData) {
  const account = await requireAccount(form);
  const back = backPath(form);
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
