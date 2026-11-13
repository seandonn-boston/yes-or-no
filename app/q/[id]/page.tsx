import { notFound } from "next/navigation";
import { revealAction, visibilityAction } from "@/app/actions";
import { Chart } from "@/components/Chart";
import { ErrorBanner, Header } from "@/components/Header";
import { QuestionCard } from "@/components/QuestionCard";
import { countAccess, present } from "@/lib/access";
import { getAccount } from "@/lib/auth";
import { arrivalChart, trendChart, visibilityChart } from "@/lib/charts";
import { getQuestion } from "@/lib/questions";
import { questionStats, type QuestionStats } from "@/lib/stats";
import { hasRevealed, myVotes } from "@/lib/votes";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; voted?: string }> };

const SOURCE_LABELS: Record<string, string> = {
  "feed:random": "Random slot",
  "feed:contested": "Contested slot",
  "feed:fresh": "New questions",
  "feed:top": "Home page",
  search: "Search",
  direct: "Direct link",
};

export default async function QuestionPage({ params, searchParams }: Props) {
  const [{ id }, { error, voted }] = await Promise.all([params, searchParams]);
  const questionId = Number(id);
  if (!Number.isInteger(questionId) || questionId <= 0) notFound();
  const question = await getQuestion(questionId);
  if (!question) notFound();

  const account = await getAccount();
  const [stats, mine, revealed] = await Promise.all([
    questionStats(questionId),
    account ? myVotes(account.id, [questionId]) : new Map(),
    account ? hasRevealed(account.id, questionId) : false,
  ]);
  const myVote = mine.get(questionId);
  const back = `/q/${questionId}`;
  const shown = present(stats.tally, {
    account, voted: Boolean(myVote), revealed, closed: question.status !== "active",
  });
  const exact = countAccess(account, Boolean(myVote)) === "full";

  return (
    <>
      <Header />
      <main className="wrap wrap-narrow">
        <ErrorBanner message={error} />
        <div className="feed feed-detail">
          <QuestionCard
            question={question}
            shown={shown}
            myVote={myVote}
            signedIn={Boolean(account)}
            source="direct"
            back={back}
            linkTitle={false}
            reveal={Boolean(voted)}
          />
        </div>

        {account && myVote && (
          <form action={visibilityAction} className="aside-form">
            <input type="hidden" name="questionId" value={questionId} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="to" value={myVote.is_private ? "public" : "private"} />
            <span>Your vote is {myVote.is_private ? "private" : "public"}.</span>
            <button className="link">Make it {myVote.is_private ? "public" : "private"}</button>
          </form>
        )}

        {!shown.split && (
          <form action={revealAction} className="aside-form">
            <input type="hidden" name="questionId" value={questionId} />
            <input type="hidden" name="back" value={back} />
            <span>Voting before you see the results keeps your answer your own.</span>
            <button className="link">Show results first</button>
          </form>
        )}

        {shown.split && shown.hasVotes && <Details stats={stats} exact={exact} />}
      </main>
    </>
  );
}

function Details({ stats, exact }: { stats: QuestionStats; exact: boolean }) {
  const { churn, visibility, blindFirstVotes, sources, history } = stats;
  const count = (x: number) => (exact ? `${x.toLocaleString("en-US")} people` : null);
  const tiles = [
    { value: churn.pctChangedOnce, label: "changed their vote once", sub: count(churn.changedOnce) },
    { value: churn.pctChangedMoreThanOnce, label: "changed it more than once", sub: count(churn.changedMoreThanOnce) },
    { value: churn.pctChangedInLast7Days, label: "changed or withdrew this week", sub: count(churn.changedInLast7Days) },
    { value: blindFirstVotes.pct, label: "voted before seeing results", sub: count(blindFirstVotes.count) },
  ];
  const days = history.filter((h) => h.total > 0);
  const first = days[0], last = days[days.length - 1];
  const arrivals = sources.map((s) => ({ label: SOURCE_LABELS[s.source] ?? s.source, votes: s.votes }));

  return (
    <>
      <section className="block">
        <h2>How firmly people hold this</h2>
        <ul className="tiles">
          {tiles.map((t) => (
            <li key={t.label}>
              <span className="tile-value">{t.value}%</span>
              <span className="tile-label">{t.label}</span>
              {t.sub && <span className="tile-sub">{t.sub}</span>}
            </li>
          ))}
        </ul>
        <p className="note">Shares of everyone who has ever voted on this question.</p>
      </section>

      <section className="block">
        <h2>Over the last 14 days</h2>
        {days.length >= 2 ? (
          <>
            <Chart
              options={trendChart(history)}
              label={`Share answering true went from ${first.pctTrue}% on ${first.day} to ${last.pctTrue}% on ${last.day}; false went from ${first.pctFalse}% to ${last.pctFalse}%.`}
            />
            <p className="note">
              True moved from {first.pctTrue}% to {last.pctTrue}%, false from {first.pctFalse}% to {last.pctFalse}%.
              The dashed line marks an even split.
            </p>
          </>
        ) : (
          <p className="note">Not enough history yet.</p>
        )}
      </section>

      <section className="block">
        <h2>With a name attached, and without</h2>
        {visibility.public && visibility.private ? (
          <>
            <Chart
              options={visibilityChart(visibility.public, visibility.private)}
              label={`Public votes: ${visibility.public.pctTrue}% true, ${visibility.public.pctFalse}% false. Private votes: ${visibility.private.pctTrue}% true, ${visibility.private.pctFalse}% false.`}
            />
            <p className="note">
              {visibility.public.pctTrue}% of public votes say true, against {visibility.private.pctTrue}% of private ones
              {exact && ` (${visibility.public.total.toLocaleString("en-US")} public, ${visibility.private.total.toLocaleString("en-US")} private)`}.
              A gap is the difference between what people say with and without their name on it.
            </p>
          </>
        ) : (
          <p className="note">Too few public or private votes to compare yet.</p>
        )}
      </section>

      {exact && arrivals.length > 0 && (
        <section className="block">
          <h2>How voters arrived</h2>
          <Chart
            options={arrivalChart(arrivals)}
            label={arrivals.map((a) => `${a.label}: ${a.votes} first votes`).join(", ")}
          />
          <p className="note">A surge from direct links can mean a question is being passed around to stack the vote.</p>
        </section>
      )}
    </>
  );
}
