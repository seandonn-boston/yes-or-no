import { ErrorBanner, Header } from "@/components/Header";
import { QuestionCard } from "@/components/QuestionCard";
import { getAccount } from "@/lib/auth";
import { feedFor, topQuestions } from "@/lib/feed";
import { getQuestion } from "@/lib/questions";
import { tallies } from "@/lib/stats";
import { myVotes } from "@/lib/votes";

type Props = { searchParams: Promise<{ error?: string; voted?: string }> };

export default async function Home({ searchParams }: Props) {
  const { error, voted } = await searchParams;
  const account = await getAccount();
  const items = account ? await feedFor(account.id) : await topQuestions();

  // The question just voted on has left the feed; show it once more, now with its results.
  const votedId = Number(voted);
  const justVoted = account && Number.isInteger(votedId) && votedId > 0 ? await getQuestion(votedId) : null;
  const mine = account && justVoted ? await myVotes(account.id, [justVoted.id]) : new Map();
  const lastVote = justVoted ? mine.get(justVoted.id) : undefined;

  const tally = await tallies([...items.map((i) => i.id), ...(justVoted ? [justVoted.id] : [])]);

  return (
    <>
      <Header />
      <main>
        <ErrorBanner message={error} />
        {justVoted && lastVote && (
          <section aria-label="Your last vote">
            <h1>How everyone else voted</h1>
            <QuestionCard
              question={justVoted}
              tally={tally.get(justVoted.id)!}
              myVote={lastVote}
              signedIn
              source="direct"
              back="/"
            />
          </section>
        )}
        <h1>{account ? "Questions waiting for you" : "What people believe right now"}</h1>
        {items.length === 0 && (
          <p className="muted">
            {account ? "You've answered everything. Search above to ask something new." : "No questions yet."}
          </p>
        )}
        {items.map((item) => (
          <QuestionCard
            key={item.id}
            question={item}
            tally={tally.get(item.id)!}
            signedIn={Boolean(account)}
            source={item.slot}
            back="/"
          />
        ))}
      </main>
    </>
  );
}
