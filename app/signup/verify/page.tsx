import Link from "next/link";
import { redirect } from "next/navigation";
import { resendCodeAction, verifySignupAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";
import { pendingSummary } from "@/lib/signup";
import { smsMode } from "@/lib/sms";

type Props = { searchParams: Promise<{ t?: string; error?: string; sent?: string }> };

export default async function VerifyPage({ searchParams }: Props) {
  const { t = "", error, sent } = await searchParams;
  const summary = t ? await pendingSummary(t) : null;
  if (!summary) redirect("/signup?error=" + encodeURIComponent("That code has expired. Start again."));

  return (
    <>
      <Header />
      <main className="wrap wrap-narrow">
        <h1 className="page-title">Enter the code we texted you</h1>
        <ErrorBanner message={error} />
        <form action={verifySignupAction} className="form">
          <input type="hidden" name="token" value={t} />
          <label>
            Code sent to the number ending {summary.phoneEnding}
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{4,12}" required autoFocus />
            {sent && <span className="field-note">A new code is on its way.</span>}
            {smsMode === "dev" && <span className="field-note">Development mode: the code is in the server log.</span>}
          </label>
          <button className="btn solid">Create account</button>
        </form>
        <form action={resendCodeAction} className="aside-form">
          <input type="hidden" name="token" value={t} />
          <span>No text after a minute?</span>
          <button className="link">Send a new code</button>
        </form>
        <p className="q-join"><Link href="/signup">Use a different number</Link></p>
      </main>
    </>
  );
}
