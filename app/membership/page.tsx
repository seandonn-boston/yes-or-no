import type { Metadata } from "next";
import Link from "next/link";
import { billingPortalAction, checkoutAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";
import { getAccount } from "@/lib/auth";
import { billingMode } from "@/lib/billing";

export const metadata: Metadata = { title: "Membership · Belief Map" };

type Props = { searchParams: Promise<{ error?: string; welcome?: string }> };

export default async function MembershipPage({ searchParams }: Props) {
  const { error, welcome } = await searchParams;
  const account = await getAccount();
  const member = account?.tier === "paid";

  return (
    <>
      <Header />
      <main className="wrap wrap-narrow">
        <h1 className="page-title">{member ? "You're a member" : "Membership"}</h1>
        <ErrorBanner message={error} />
        {welcome && (
          <p className="notice" role="status">
            {member ? "Welcome. Your membership is active." : "Payment received. Your membership can take a few seconds to switch on; refresh in a moment."}
          </p>
        )}
        {!member && <p className="price">$5 <span>a month, cancel any time</span></p>}
        <ul className="member-list">
          <li>Unlimited votes, questions and changes to private votes</li>
          <li>Exact vote counts on every question, before you vote</li>
          <li>How firmly people hold each answer: who changed once, more than once, and this week</li>
          <li>Each question&apos;s 14-day trend</li>
          <li>What people say publicly against what they say privately</li>
        </ul>

        {!account ? (
          <p className="q-join">
            <Link href="/signup?next=%2Fmembership">Create an account</Link> or <Link href="/login?next=%2Fmembership">sign in</Link> to join.
          </p>
        ) : member ? (
          <form action={billingPortalAction}>
            <input type="hidden" name="back" value="/membership" />
            <button className="btn">{billingMode === "dev" ? "End membership (development mode)" : "Manage billing or cancel"}</button>
          </form>
        ) : billingMode === "off" ? (
          <p className="q-hint">Membership opens soon.</p>
        ) : (
          <form action={checkoutAction}>
            <input type="hidden" name="back" value="/membership" />
            <button className="btn solid">{billingMode === "dev" ? "Join (development mode, no charge)" : "Join for $5 a month"}</button>
            <p className="field-note">Payment is handled by Stripe. Your vote still counts once, like everyone else&apos;s.</p>
          </form>
        )}
      </main>
    </>
  );
}
