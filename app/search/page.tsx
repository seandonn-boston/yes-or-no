import Link from "next/link";
import { askAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";
import { QuestionCard } from "@/components/QuestionCard";
import { present } from "@/lib/access";
import { getAccount } from "@/lib/auth";
import { booleanProblem, normalize, search, tidy } from "@/lib/questions";
import { tallies } from "@/lib/stats";
import { getView } from "@/lib/view";
import { myVotes } from "@/lib/votes";

type Props = { searchParams: Promise<{ q?: string; error?: string }> };

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", error } = await searchParams;
  const text = q.trim().slice(0, 200);
  const [account, preferred] = await Promise.all([getAccount(), getView()]);
  const view = preferred === "swipe" ? "compact" : preferred; // results are a list to scan, not to page through
  const matches = text ? await search(text) : [];
  const ids = matches.map((m) => m.id);
  const [tally, mine] = await Promise.all([tallies(ids), account ? myVotes(account.id, ids) : new Map()]);

  // There is no "new question" button anywhere. Asking is only offered here, after a search
  // that didn't turn up the same question.
  const alreadyAsked = matches.some((m) => normalize(m.text) === normalize(tidy(text)));
  const problem = text ? booleanProblem(text) : null;
  const back = `/search?q=${encodeURIComponent(text)}`;

  return (
    <>
      <Header q={text} />
      <main className={`wrap wrap-${view}`}>
        <ErrorBanner message={error} />

        {text && !alreadyAsked && (
          <section className="ask">
            {problem ? (
              <>
                <h1 className="list-title">Can&apos;t ask that as written</h1>
                <p>{problem}</p>
              </>
            ) : (
              <>
                <h1 className="list-title">Nobody has asked this yet</h1>
                <p className="ask-text">{tidy(text)}</p>
                {account ? (
                  <form action={askAction}>
                    <input type="hidden" name="text" value={text} />
                    <input type="hidden" name="back" value={back} />
                    <button className="btn solid">Ask now</button>
                    <span className="ask-note">
                      Asked anonymously.{matches.length > 0 && " Check the similar questions first."}
                    </span>
                  </form>
                ) : (
                  <p className="q-join">
                    <Link href={`/signup?next=${encodeURIComponent(back)}`}>Create an account</Link> to ask it.
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {text && <h1 className="list-title">{matches.length ? "Questions like yours" : "No matching questions"}</h1>}
        <div className={`feed feed-${view}`}>
          {matches.map((m) => (
            <QuestionCard
              key={m.id}
              question={m}
              shown={present(tally.get(m.id)!, { account, voted: mine.has(m.id), closed: m.status !== "active" })}
              myVote={mine.get(m.id)}
              signedIn={Boolean(account)}
              source="search"
              back={back}
            />
          ))}
        </div>
      </main>
    </>
  );
}
