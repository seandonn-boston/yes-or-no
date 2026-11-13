import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { billingPortalAction, deleteAccountAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";
import { getAccount } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata: Metadata = { title: "Settings · Belief Map" };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function SettingsPage({ searchParams }: Props) {
  const account = await getAccount();
  if (!account) redirect("/login?next=%2Fsettings");
  const { error } = await searchParams;
  const [info] = await query<{ created_at: Date; phone_verified_at: Date | null; votes: number; subscription_status: string | null; stripe_customer_id: string | null }>(
    `select created_at, phone_verified_at, subscription_status, stripe_customer_id,
            (select count(*)::int from votes where account_id = a.id) as votes
       from accounts a where id = $1`,
    [account.id],
  );
  const date = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <>
      <Header />
      <main className="wrap wrap-narrow">
        <h1 className="page-title">Settings</h1>
        <ErrorBanner message={error} />
        <dl>
          <div className="settings-row"><dt>Username</dt><dd>{account.username}</dd></div>
          <div className="settings-row"><dt>Phone</dt><dd>{info.phone_verified_at ? "Confirmed" : "Not confirmed"}</dd></div>
          <div className="settings-row"><dt>Joined</dt><dd>{date(info.created_at)}</dd></div>
          <div className="settings-row"><dt>Current votes</dt><dd>{info.votes.toLocaleString("en-US")}</dd></div>
          <div className="settings-row">
            <dt>Membership</dt>
            <dd>{account.tier === "paid" ? "Member" : <Link href="/membership">Free · Join</Link>}</dd>
          </div>
        </dl>

        {info.stripe_customer_id && (
          <form action={billingPortalAction} className="aside-form">
            <input type="hidden" name="back" value="/settings" />
            <span>Card details, invoices and cancelling are handled by Stripe.</span>
            <button className="link">Manage billing</button>
          </form>
        )}

        <section className="block">
          <h2>Your data</h2>
          <p className="note">
            Everything the site holds about your account: your votes and every change to them, questions you asked and
            reports you filed. Your phone number isn&apos;t included because it is never stored.
          </p>
          <p><a className="btn" href="/api/me/export" download>Download my data</a></p>
        </section>

        <section className="block">
          <h2>Delete your account</h2>
          <p className="note">
            Your current votes are withdrawn from every result straight away{account.tier === "paid" ? " and your membership is cancelled" : ""}.
            The dated record of past votes stays in the historical results, with nothing that connects it to you. This
            can&apos;t be undone. <Link href="/privacy">More in the privacy policy</Link>.
          </p>
          <form action={deleteAccountAction} className="form">
            <label>Type your username to confirm<input name="confirm" autoComplete="off" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            <button className="btn danger-solid">Delete my account</button>
          </form>
        </section>
      </main>
    </>
  );
}
