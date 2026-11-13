import Link from "next/link";
import { deleteVoteAction, skipAction, voteAction } from "@/app/actions";
import type { Question } from "@/lib/questions";
import type { Tally } from "@/lib/stats";
import type { MyVote, Source, VoteValue } from "@/lib/votes";
import { ResultBar } from "./ResultBar";

const CHOICES: { value: VoteValue; label: string }[] = [
  { value: "true", label: "True" },
  { value: "false", label: "False" },
  { value: "unsure", label: "Unsure" },
];

type Props = {
  question: Question;
  tally: Tally;
  myVote?: MyVote;
  signedIn: boolean;
  source: Source;
  back: string;           // path to return to after an action
  revealed?: boolean;     // signed-in voter chose to see results before voting
  linkTitle?: boolean;
};

export function QuestionCard({ question, tally, myVote, signedIn, source, back, revealed, linkTitle = true }: Props) {
  const closed = question.status !== "active";
  const showResults = !signedIn || Boolean(myVote) || Boolean(revealed) || closed;

  return (
    <article className="card">
      <h2 className="question">
        {linkTitle ? <Link href={`/q/${question.id}`}>{question.text}</Link> : question.text}
      </h2>

      {signedIn && !(closed && !myVote) && (
        <form action={voteAction} className="vote">
          <input type="hidden" name="questionId" value={question.id} />
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="back" value={back} />
          <div className="choices">
            {CHOICES.map((c) => (
              <button
                key={c.value}
                name="value"
                value={c.value}
                className={`choice ${c.value}${myVote?.value === c.value ? " mine" : ""}`}
                aria-pressed={myVote?.value === c.value}
              >
                {c.label}
              </button>
            ))}
            {myVote ? (
              <button formAction={deleteVoteAction} className="choice ghost">Delete</button>
            ) : (
              <button formAction={skipAction} className="choice ghost">Skip</button>
            )}
          </div>
          {!myVote && (
            <label className="private">
              <input type="checkbox" name="private" /> Vote privately (your name isn&apos;t attached)
            </label>
          )}
          {myVote && (
            <p className="muted small">
              You voted {myVote.value}, {myVote.is_private ? "privately" : "publicly"}. One change per day.
            </p>
          )}
        </form>
      )}

      {closed && <p className="muted small">This question is archived and no longer takes new votes.</p>}

      {showResults ? (
        <ResultBar tally={tally} showCounts={signedIn} />
      ) : (
        <p className="muted small">Results appear once you vote.</p>
      )}

      {!signedIn && (
        <p className="small">
          <Link href={`/signup?next=${encodeURIComponent(back)}`}>Create an account</Link> to vote.
        </p>
      )}
    </article>
  );
}
