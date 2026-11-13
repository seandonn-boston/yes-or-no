import Link from "next/link";
import { askAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";
import { QuestionCard } from "@/components/QuestionCard";
import { getAccount } from "@/lib/auth";
import { booleanProblem, normalize, search, tidy } from "@/lib/questions";
import { tallies } from "@/lib/stats";
import { myVotes } from "@/lib/votes";

type Props = { searchParams: Promise<{ q?: string; error?: string }> };

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", error } = await searchParams;
  const text = q.trim().slice(0, 200);
  const account = await getAccount();
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
      <main>
        <ErrorBanner message={error} />

        {text && !alreadyAsked && (
          <section className="card ask">
            {problem ? (
              <>
                <h2>Can&apos;t ask that as written</h2>
                <p>{problem}</p>
              </>
            ) : (
              <>
                <h2>Nobody has asked this yet</h2>
                <p className="question">{tidy(text)}</p>
                {matches.length > 0 && (
                  <p className="muted small">Check the similar questions below first. If none is yours, ask it.</p>
                )}
                {account ? (
                  <form action={askAction}>
                    <input type="hidden" name="text" value={text} />
                    <input type="hidden" name="back" value={back} />
                    <button className="primary">Ask now</button>
                    <span className="muted small"> Questions are always asked anonymously.</span>
                  </form>
                ) : (
                  <p className="small">
                    <Link href={`/signup?next=${encodeURIComponent(back)}`}>Create an account</Link> to ask it.
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {text && <h1>{matches.length ? "Questions like yours" : "No matching questions"}</h1>}
        {matches.map((m) => (
          <QuestionCard
            key={m.id}
            question={m}
            tally={tally.get(m.id)!}
            myVote={mine.get(m.id)}
            signedIn={Boolean(account)}
            source="search"
            back={back}
          />
        ))}
      </main>
    </>
  );
}
