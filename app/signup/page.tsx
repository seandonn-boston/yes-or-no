import Link from "next/link";
import { signupAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";

type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function SignupPage({ searchParams }: Props) {
  const { error, next = "/" } = await searchParams;
  return (
    <>
      <Header />
      <main className="wrap wrap-narrow">
        <h1 className="page-title">Create an account</h1>
        <ErrorBanner message={error} />
        <form action={signupAction} className="form">
          <input type="hidden" name="back" value={next} />
          <label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={20} /></label>
          <label>
            Phone number
            <input name="phone" type="tel" autoComplete="tel" required />
            <span className="field-note">We text it a code to confirm it is yours. One account per number; it is stored only as a one-way hash and never shared.</span>
          </label>
          <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
          <label className="check"><input type="checkbox" name="adult" required /> I am 18 or older.</label>
          <label className="check">
            <input type="checkbox" name="consent" required />
            <span>
              I agree to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>, including
              that my votes are recorded and used, without my name, in published results and data.
            </span>
          </label>
          <button className="btn solid">Text me a code</button>
        </form>
        <p className="q-join">Already have one? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>.</p>
      </main>
    </>
  );
}
