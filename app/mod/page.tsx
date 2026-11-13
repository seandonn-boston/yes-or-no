import Link from "next/link";
import { notFound } from "next/navigation";
import { moderateAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";
import { getAccount } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { queue, REPORT_REASONS } from "@/lib/moderation";

type Props = { searchParams: Promise<{ error?: string; done?: string }> };

const reasonLabel = (value: string) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value;

export default async function ModerationPage({ searchParams }: Props) {
  const account = await getAccount();
  if (!account || account.role === "user") notFound();
  const { error, done } = await searchParams;
  const items = await queue();

  return (
    <>
      <Header />
      <main className="wrap wrap-narrow">
        <h1 className="page-title">Review queue</h1>
        <ErrorBanner message={error} />
        {done && <p className="notice" role="status">Question #{done} updated.</p>}
        {items.length === 0 && <p className="empty">Nothing waiting. Held and reported questions appear here.</p>}

        {items.map((item) => (
          <section key={item.id} className="mod-item">
            <p className="mod-meta">
              #{item.id} · {item.status === "review" ? "Held" : "Live"} · {CATEGORIES.find((c) => c.slug === item.category)?.label ?? item.category}
              {" · "}{item.votes.toLocaleString("en-US")} votes · {item.asked_by_user ? "asked by a user" : "catalog"}
            </p>
            <h2 className="q-text"><Link href={`/q/${item.id}`}>{item.text}</Link></h2>
            {item.held_reason && <p className="mod-why">{item.held_reason}</p>}
            {item.reasons && (
              <ul className="mod-reports">
                {Object.entries(item.reasons).map(([reason, n]) => <li key={reason}>{n} × {reasonLabel(reason)}</li>)}
              </ul>
            )}
            {item.notes?.map((note, i) => <blockquote key={i} className="mod-note">{note}</blockquote>)}

            <form action={moderateAction} className="mod-actions">
              <input type="hidden" name="questionId" value={item.id} />
              <button name="action" value="approve" className="btn small">{item.status === "review" ? "Approve" : "Keep"}</button>
              <button name="action" value="remove" className="btn small">Remove</button>
              <button name="action" value="archive" className="btn small">Archive</button>
            </form>
            <form action={moderateAction} className="mod-actions">
              <input type="hidden" name="questionId" value={item.id} />
              <input type="hidden" name="action" value="duplicate" />
              <input name="of" inputMode="numeric" placeholder="Original #" aria-label="Number of the original question" required />
              <button className="btn small">Merge as repeat</button>
            </form>
            <form action={moderateAction} className="mod-actions">
              <input type="hidden" name="questionId" value={item.id} />
              <input type="hidden" name="action" value="category" />
              <select name="category" defaultValue={item.category} aria-label="Subject">
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
              <button className="btn small">Change subject</button>
            </form>
          </section>
        ))}
      </main>
    </>
  );
}
