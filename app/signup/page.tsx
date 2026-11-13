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
            <span className="field-note">One account per number. It is stored only as a one-way hash and never shared.</span>
          </label>
          <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
          <label className="check"><input type="checkbox" name="adult" required /> I am 18 or older.</label>
          <label className="check">
            <input type="checkbox" name="consent" required /> I agree that my votes are recorded and used, without my
            name, in published results and data.
          </label>
          <button className="btn solid">Create account</button>
        </form>
        <p className="q-join">Already have one? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>.</p>
      </main>
    </>
  );
}
