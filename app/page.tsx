import { ErrorBanner, Header } from "@/components/Header";
import { QuestionCard } from "@/components/QuestionCard";
import { present } from "@/lib/access";
import { getAccount } from "@/lib/auth";
import { feedFor, topQuestions } from "@/lib/feed";
import { getQuestion } from "@/lib/questions";
import { tallies } from "@/lib/stats";
import { getView } from "@/lib/view";
import { myVotes } from "@/lib/votes";

type Props = { searchParams: Promise<{ error?: string; voted?: string }> };

export default async function Home({ searchParams }: Props) {
  const { error, voted } = await searchParams;
  const [account, view] = await Promise.all([getAccount(), getView()]);
  const items = account ? await feedFor(account.id) : await topQuestions();

  // The question just voted on has left the feed; show it once more, now with its results.
  const votedId = Number(voted);
  const justVoted = account && Number.isInteger(votedId) && votedId > 0 ? await getQuestion(votedId) : null;
  const mine = account && justVoted ? await myVotes(account.id, [justVoted.id]) : new Map();
  const lastVote = justVoted ? mine.get(justVoted.id) : undefined;

  const tally = await tallies([...items.map((i) => i.id), ...(justVoted ? [justVoted.id] : [])]);
  const empty = items.length === 0 && !(justVoted && lastVote);

  return (
    <>
      <Header view={view} back="/" />
      <main className={`wrap wrap-${view}`}>
        <ErrorBanner message={error} />
        {view !== "swipe" && (
          <h1 className="list-title">{account ? "Questions waiting for you" : "What people believe right now"}</h1>
        )}
        {empty && (
          <p className="empty">
            {account ? "You've answered every question. Search above to ask a new one." : "No questions yet."}
          </p>
        )}
        <div className={`feed feed-${view}`}>
          {justVoted && lastVote && (
            <QuestionCard
              question={justVoted}
              shown={present(tally.get(justVoted.id)!, { account, voted: true })}
              myVote={lastVote}
              signedIn
              source="direct"
              back="/"
              reveal
            />
          )}
          {items.map((item) => (
            <QuestionCard
              key={item.id}
              question={item}
              shown={present(tally.get(item.id)!, { account, voted: false })}
              signedIn={Boolean(account)}
              source={item.slot}
              back="/"
            />
          ))}
        </div>
      </main>
    </>
  );
}
