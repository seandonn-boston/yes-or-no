import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { getAccount } from "@/lib/auth";

export async function Header({ q = "" }: { q?: string }) {
  const account = await getAccount();
  return (
    <header className="header">
      <div className="topline">
        <Link href="/" className="brand">Belief Map</Link>
        <nav>
          {account ? (
            <form action={logoutAction} className="inline">
              <span className="muted">{account.username}</span>
              <button className="link">Sign out</button>
            </form>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              <Link href="/signup" className="cta">Join</Link>
            </>
          )}
        </nav>
      </div>
      <form action="/search" className="search" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search for a question, or ask one"
          aria-label="Search questions"
          maxLength={200}
          required
        />
        <button>Search</button>
      </form>
    </header>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  return message ? <p className="error" role="alert">{message}</p> : null;
}
