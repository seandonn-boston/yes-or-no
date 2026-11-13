import Link from "next/link";
import { loginAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";

type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { error, next = "/" } = await searchParams;
  return (
    <>
      <Header />
      <main className="wrap wrap-narrow">
        <h1 className="page-title">Sign in</h1>
        <ErrorBanner message={error} />
        <form action={loginAction} className="form">
          <input type="hidden" name="back" value={next} />
          <label>Username<input name="username" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn solid">Sign in</button>
        </form>
        <p className="q-join">New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>.</p>
      </main>
    </>
  );
}
