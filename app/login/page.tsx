import Link from "next/link";
import { loginAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";

type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { error, next = "/" } = await searchParams;
  return (
    <>
      <Header />
      <main>
        <h1>Sign in</h1>
        <ErrorBanner message={error} />
        <form action={loginAction} className="card form">
          <input type="hidden" name="back" value={next} />
          <label>Username<input name="username" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="primary">Sign in</button>
        </form>
        <p className="small">New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>.</p>
      </main>
    </>
  );
}
