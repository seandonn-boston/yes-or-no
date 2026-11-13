import { notFound } from "next/navigation";
import { revealAction, visibilityAction } from "@/app/actions";
import { ErrorBanner, Header } from "@/components/Header";
import { QuestionCard } from "@/components/QuestionCard";
import { getAccount } from "@/lib/auth";
import { getQuestion } from "@/lib/questions";
import { questionStats, type GroupStat, type QuestionStats } from "@/lib/stats";
import { hasRevealed, myVotes } from "@/lib/votes";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };

const SOURCE_LABELS: Record<string, string> = {
  "feed:random": "Random feed slot",
  "feed:contested": "Contested feed slot",
  "feed:fresh": "New questions feed slot",
  "feed:top": "Home page",
  search: "Search",
  direct: "Direct link",
};

export default async function QuestionPage({ params, searchParams }: Props) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
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
  const canSeeResults = !account || Boolean(myVote) || revealed || question.status !== "active";

  return (
    <>
      <Header />
      <main>
        <ErrorBanner message={error} />
        <QuestionCard
          question={question}
          tally={stats.tally}
          myVote={myVote}
          signedIn={Boolean(account)}
          source="direct"
          back={back}
          revealed={revealed}
          linkTitle={false}
        />

        {account && myVote && (
          <form action={visibilityAction} className="card inline-form">
            <input type="hidden" name="questionId" value={questionId} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="to" value={myVote.is_private ? "public" : "private"} />
            <span>Your vote is {myVote.is_private ? "private" : "public"}.</span>
            <button className="link">Make it {myVote.is_private ? "public" : "private"}</button>
          </form>
        )}

        {!canSeeResults && (
          <form action={revealAction} className="card inline-form">
            <input type="hidden" name="questionId" value={questionId} />
            <input type="hidden" name="back" value={back} />
            <span className="muted">Voting before you see the results keeps your answer your own.</span>
            <button className="link">Show results first</button>
          </form>
        )}

        {canSeeResults && stats.tally.total > 0 && <Details stats={stats} signedIn={Boolean(account)} />}
      </main>
    </>
  );
}

function Details({ stats, signedIn }: { stats: QuestionStats; signedIn: boolean }) {
  const { churn, visibility, blindFirstVotes, sources, history } = stats;
  const n = (x: number) => (signedIn ? ` (${x.toLocaleString("en-US")})` : "");
  return (
    <>
      <section className="card">
        <h2>How firmly people hold this</h2>
        <dl className="stats">
          <div><dt>Changed their vote once</dt><dd>{churn.pctChangedOnce}%{n(churn.changedOnce)}</dd></div>
          <div><dt>Changed more than once</dt><dd>{churn.pctChangedMoreThanOnce}%{n(churn.changedMoreThanOnce)}</dd></div>
          <div><dt>Changed or withdrew in the last 7 days</dt><dd>{churn.pctChangedInLast7Days}%{n(churn.changedInLast7Days)}</dd></div>
          <div><dt>Voted before seeing results</dt><dd>{blindFirstVotes.pct}%{n(blindFirstVotes.count)}</dd></div>
        </dl>
        <p className="muted small">Shares of everyone who has ever voted on this question.</p>
      </section>

      <section className="card">
        <h2>Public and private votes</h2>
        <dl className="stats">
          <GroupRow label="Public votes saying true" group={visibility.public} signedIn={signedIn} />
          <GroupRow label="Private votes saying true" group={visibility.private} signedIn={signedIn} />
        </dl>
        <p className="muted small">A gap here is the difference between what people say with and without their name attached.</p>
      </section>

      <section className="card">
        <h2>Last 14 days</h2>
        <Trend history={history} />
      </section>

      {signedIn && sources.length > 0 && (
        <section className="card">
          <h2>How voters arrived</h2>
          <dl className="stats">
            {sources.map((s) => (
              <div key={s.source}><dt>{SOURCE_LABELS[s.source] ?? s.source}</dt><dd>{s.votes.toLocaleString("en-US")}</dd></div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}

function GroupRow({ label, group, signedIn }: { label: string; group: GroupStat; signedIn: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {group ? `${group.pctTrue}%${signedIn ? ` of ${group.total.toLocaleString("en-US")}` : ""}` : "Too few to show"}
      </dd>
    </div>
  );
}

// Share voting "true" per day, as a simple line.
function Trend({ history }: { history: QuestionStats["history"] }) {
  const points = history.filter((h) => h.total > 0);
  if (points.length < 2) return <p className="muted">Not enough history yet.</p>;
  const w = 320, h = 90, pad = 6;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (history.length - 1);
  const y = (p: number) => pad + ((100 - p) * (h - pad * 2)) / 100;
  const line = history
    .map((d, i) => (d.total > 0 ? `${x(i).toFixed(1)},${y(d.pctTrue).toFixed(1)}` : null))
    .filter(Boolean)
    .join(" ");
  const first = points[0], last = points[points.length - 1];
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} className="trend" role="img"
        aria-label={`Share voting true went from ${first.pctTrue}% on ${first.day} to ${last.pctTrue}% on ${last.day}`}>
        <line x1={pad} x2={w - pad} y1={y(50)} y2={y(50)} className="mid" />
        <polyline points={line} />
      </svg>
      <p className="muted small">
        Share voting true: {first.pctTrue}% on {first.day}, {last.pctTrue}% on {last.day}. Dashed line marks 50%.
      </p>
    </>
  );
}
