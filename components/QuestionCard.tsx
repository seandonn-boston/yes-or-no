import Link from "next/link";
import type { FormEvent } from "react";
import { deleteVoteAction, skipAction, voteAction } from "@/app/actions";
import type { Shown } from "@/lib/access";
import type { MyVote, Source } from "@/lib/votes";
import { Split } from "./Split";

type Props = {
  question: { id: number; text: string; status: string };
  shown: Shown;
  myVote?: MyVote | null;
  signedIn: boolean;
  source: Source;
  back: string;          // path to return to after an action
  linkTitle?: boolean;
  reveal?: boolean;      // animate the split in: this is the question just voted on
  // Set by LiveCard in feeds, where votes are saved in place. Without it the forms submit
  // normally and the page reloads, which is also what happens when scripts are off.
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  error?: string | null;
};

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function QuestionCard({
  question, shown, myVote, signedIn, source, back, linkTitle = true, reveal, onSubmit, busy, error,
}: Props) {
  const closed = question.status !== "active";
  const canVote = signedIn && !(closed && !myVote);
  const answer = (value: "true" | "false" | "unsure", label: string, kind: string) => (
    <button name="value" value={value} data-act={value} disabled={busy}
      className={`btn ${kind} ${value}${myVote?.value === value ? " mine" : ""}`}
      aria-pressed={myVote?.value === value}>{label}</button>
  );

  return (
    <article className={`q${myVote ? " is-voted" : ""}`}>
      <h2 className="q-text">
        {linkTitle ? <Link href={`/q/${question.id}`}>{question.text}</Link> : question.text}
      </h2>

      {shown.split ? (
        <Split shown={shown} reveal={reveal} />
      ) : (
        <p className="q-hint">
          {shown.totalLabel ? `${sentence(shown.totalLabel)} so far. ` : ""}Vote to see how they split.
        </p>
      )}

      {canVote && (
        <form action={voteAction} onSubmit={onSubmit} className="vote">
          <input type="hidden" name="questionId" value={question.id} />
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="back" value={back} />
          <div className="vote-main">
            {answer("true", "True", "answer")}
            {answer("false", "False", "answer")}
          </div>
          <div className="vote-side">
            {answer("unsure", "Unsure", "quiet")}
            {myVote ? (
              <button formAction={deleteVoteAction} data-act="delete" disabled={busy} className="btn quiet">Delete</button>
            ) : (
              <button formAction={skipAction} data-act="skip" disabled={busy} className="btn quiet">Skip</button>
            )}
          </div>
          {error && <p className="q-error" role="alert">{error}</p>}
          {myVote ? (
            <p className="vote-note">You voted {myVote.value}, {myVote.is_private ? "privately" : "publicly"}. One change per day.</p>
          ) : (
            <label className="vote-private"><input type="checkbox" name="private" /> Vote privately</label>
          )}
        </form>
      )}

      {question.status === "archived" && <p className="q-hint">Archived. This question no longer takes new votes.</p>}
      {question.status === "review" && (
        <p className="q-hint">A moderator is reviewing this question. It takes votes again once approved.</p>
      )}
      {!signedIn && (
        <p className="q-join"><Link href={`/signup?next=${encodeURIComponent(back)}`}>Create an account</Link> to vote.</p>
      )}
    </article>
  );
}
