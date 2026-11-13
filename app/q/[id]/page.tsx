import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { reportAction, revealAction, visibilityAction } from "@/app/actions";
import { Chart } from "@/components/Chart";
import { ErrorBanner, Header } from "@/components/Header";
import { QuestionCard } from "@/components/QuestionCard";
import { detailLevel, present, type DetailLevel } from "@/lib/access";
import { getAccount } from "@/lib/auth";
import { trendChart, visibilityChart } from "@/lib/charts";
import { query } from "@/lib/db";
import { REPORT_REASONS } from "@/lib/moderation";
import { getQuestion, mergedInto } from "@/lib/questions";
import { questionStats, type QuestionStats } from "@/lib/stats";
import { hasRevealed, myVotes } from "@/lib/votes";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; voted?: string; held?: string; reported?: string }>;
};

export default async function QuestionPage({ params, searchParams }: Props) {
  const [{ id }, { error, voted, held, reported }] = await Promise.all([params, searchParams]);
  const questionId = Number(id);
  if (!Number.isInteger(questionId) || questionId <= 0) notFound();
  const question = await getQuestion(questionId);
  if (!question) {
    const original = await mergedInto(questionId);
    if (original) redirect(`/q/${original}`);
    notFound();
  }

  const account = await getAccount();
  const [stats, mine, revealed] = await Promise.all([
    questionStats(questionId),
    account ? myVotes(account.id, [questionId]) : new Map(),
    account ? hasRevealed(account.id, questionId) : false,
  ]);
  const myVote = mine.get(questionId);
  const aiAnswers = await query<{ model: string; value: string }>(
    "select model, value from ai_answers where question_id = $1 order by answered_at",
    [questionId],
  );
  const back = `/q/${questionId}`;
  const shown = present(stats.tally, {
    account, voted: Boolean(myVote), revealed, closed: question.status !== "active",
  });
  const level = detailLevel(account, Boolean(myVote));

  return (
    <>
      <Header />
      <main className="wrap wrap-narrow">
        <ErrorBanner message={error} />
        {held && question.status === "review" && (
          <p className="notice" role="status">
            Your question is saved. A moderator checks questions that may name a private person or cause harm before
            they go live; this usually takes less than a day.
          </p>
        )}
        {reported && <p className="notice" role="status">Thanks. A moderator will look at it.</p>}
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

        {/* Only once the split is visible, so an AI's answer can't steer a first vote. */}
        {shown.split && aiAnswers.length > 0 && (
          <p className="ai-note">
            {aiAnswers.map((a) => `${a.model} answered ${a.value}`).join("; ")}.
            {" "}AI answers are shown for comparison and are never counted as votes.
          </p>
        )}

        {shown.split && shown.hasVotes && <Details stats={stats} level={level} signedIn={Boolean(account)} back={back} />}

        {account && question.status === "active" && !reported && (
          <details className="report">
            <summary>Report this question</summary>
            <form action={reportAction} className="form">
              <input type="hidden" name="questionId" value={questionId} />
              <input type="hidden" name="back" value={back} />
              <fieldset>
                <legend>What&apos;s wrong with it?</legend>
                {REPORT_REASONS.map((r) => (
                  <label key={r.value} className="check"><input type="radio" name="reason" value={r.value} required /> {r.label}</label>
                ))}
              </fieldset>
              <label>
                Anything a moderator should know <span className="field-note">(optional)</span>
                <input name="note" maxLength={500} placeholder="For a repeat, the number of the original question" />
              </label>
              <button className="btn">Send report</button>
            </form>
          </details>
        )}
      </main>
    </>
  );
}

// What the page shows grows with the viewer's level (lib/access.ts). Arrival routes and the
// time filters are never shown here; they are API-only.
function Details({ stats, level, signedIn, back }: { stats: QuestionStats; level: DetailLevel; signedIn: boolean; back: string }) {
  const { churn, visibility, blindFirstVotes, history } = stats;

  if (level !== "member") {
    return (
      <>
        {level === "voter" && (
          <section className="block">
            <h2>How firmly people hold this</h2>
            <p className="headline-stat">
              <span className="tile-value">{churn.pctChangedMind}%</span>
              <span>have changed their mind on this at least once</span>
            </p>
          </section>
        )}
        <section className="block locked">
          <h2>More on this question, for members</h2>
          <ul>
            <li>How the split has moved over the last 14 days</li>
            <li>How many changed once, more than once, or this week</li>
            <li>What people say publicly against what they say privately</li>
          </ul>
          <p className="note">
            {signedIn
              ? <><Link href="/membership">Join for $5 a month</Link> to see all of it.</>
              : <><Link href={`/signup?next=${encodeURIComponent(back)}`}>Create an account</Link> and vote to see how firmly people hold this. The rest comes with membership, $5 a month.</>}
          </p>
        </section>
      </>
    );
  }

  const count = (x: number) => `${x.toLocaleString("en-US")} people`;
  const tiles = [
    { value: churn.pctChangedOnce, label: "changed their vote once", sub: count(churn.changedOnce) },
    { value: churn.pctChangedMoreThanOnce, label: "changed it more than once", sub: count(churn.changedMoreThanOnce) },
    { value: churn.pctChangedInLast7Days, label: "changed or withdrew this week", sub: count(churn.changedInLast7Days) },
    { value: blindFirstVotes.pct, label: "voted before seeing results", sub: count(blindFirstVotes.count) },
  ];
  const days = history.filter((h) => h.total > 0);
  const first = days[0], last = days[days.length - 1];

  return (
    <>
      <section className="block">
        <h2>How firmly people hold this</h2>
        <ul className="tiles">
          {tiles.map((t) => (
            <li key={t.label}>
              <span className="tile-value">{t.value}%</span>
              <span className="tile-label">{t.label}</span>
              <span className="tile-sub">{t.sub}</span>
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
              ({visibility.public.total.toLocaleString("en-US")} public, {visibility.private.total.toLocaleString("en-US")} private).
              A gap is the difference between what people say with and without their name on it.
            </p>
          </>
        ) : (
          <p className="note">Too few public or private votes to compare yet.</p>
        )}
      </section>
    </>
  );
}
