import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { getAccount } from "@/lib/auth";
import type { View } from "@/lib/view";
import { ViewSwitcher } from "./ViewSwitcher";

type Props = {
  q?: string;
  view?: View;     // pass with `back` on pages that list questions to show the layout switcher
  back?: string;
};

export async function Header({ q = "", view, back }: Props) {
  const account = await getAccount();
  return (
    <header className="header">
      <div className="header-in">
        <div className="topline">
          <Link href="/" className="brand" aria-label="Belief Map, home">
            Belief<span>Map</span>
          </Link>
          <nav>
            {view && back && <ViewSwitcher current={view} back={back} />}
            {account ? (
              <form action={logoutAction} className="who">
                <span>{account.username}</span>
                <button className="link">Sign out</button>
              </form>
            ) : (
              <>
                <Link href="/login">Sign in</Link>
                <Link href="/signup" className="btn solid small">Join</Link>
              </>
            )}
          </nav>
        </div>
        <form action="/search" className="search" role="search">
          <input name="q" defaultValue={q} placeholder="Search for a question, or ask one"
            aria-label="Search questions" maxLength={200} required />
          <button className="btn">Search</button>
        </form>
      </div>
    </header>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  return message ? <p className="error" role="alert">{message}</p> : null;
}
