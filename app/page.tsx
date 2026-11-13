import Link from "next/link";
import { FeedList } from "@/components/FeedList";
import { ErrorBanner, Header } from "@/components/Header";
import { getAccount } from "@/lib/auth";
import { toCard } from "@/lib/cards";
import { CATEGORIES, isCategory } from "@/lib/categories";
import { query } from "@/lib/db";
import { feedPage, topPage } from "@/lib/feed";
import { getView } from "@/lib/view";
import { myVotes } from "@/lib/votes";

type Props = { searchParams: Promise<{ error?: string; voted?: string; c?: string }> };

export default async function Home({ searchParams }: Props) {
  const { error, voted, c } = await searchParams;
  const category = isCategory(c) ? c : null;
  const [account, view] = await Promise.all([getAccount(), getView()]);
  const page = account ? await feedPage(account.id, null, category) : await topPage(null, category);
  const items = page.rows.map((row) => toCard(row, account));

  // Without scripts a vote reloads the page; the question voted on has then left the feed,
  // so put it back at the top with its results.
  const votedId = Number(voted);
  if (account && Number.isInteger(votedId) && votedId > 0) {
    const mine = await myVotes(account.id, [votedId]);
    const [row] = await query<{ id: number; text: string; status: string; category: string; t: number; f: number; u: number }>(
      `select id, text, status, category, true_count as t, false_count as f, unsure_count as u
         from questions where id = $1 and status <> 'removed'`,
      [votedId],
    );
    if (row && mine.has(votedId)) items.unshift({ ...toCard(row, account, mine.get(votedId)), fresh: true });
  }

  const back = category ? `/?c=${category}` : "/";
  return (
    <>
      <Header view={view} back={back} />
      <nav className="cats" aria-label="Subjects">
        <div className="cats-in">
          <Link href="/" aria-current={category ? undefined : "page"}>Everything</Link>
          {CATEGORIES.map((cat) => (
            <Link key={cat.slug} href={`/?c=${cat.slug}`} aria-current={category === cat.slug ? "page" : undefined}>
              {cat.label}
            </Link>
          ))}
        </div>
      </nav>
      <main className={`wrap wrap-${view}`}>
        <ErrorBanner message={error} />
        {items.length === 0 && (
          <p className="empty">
            {account ? "You've answered every question here. Pick another subject, or search to ask a new one." : "No questions here yet."}
          </p>
        )}
        {/* Remount when the layout or subject changes so the list starts from its first page. */}
        <FeedList
          key={`${view}:${category ?? "all"}:${account?.id ?? 0}`}
          initial={items}
          next={page.next}
          view={view}
          signedIn={Boolean(account)}
          category={category}
          back={back}
        />
      </main>
    </>
  );
}
