import Link from "next/link";
import { deleteVoteAction, skipAction, voteAction } from "@/app/actions";
import type { Shown } from "@/lib/access";
import type { Question } from "@/lib/questions";
import type { MyVote, Source } from "@/lib/votes";
import { Split } from "./Split";

type Props = {
  question: Question;
  shown: Shown;
  myVote?: MyVote;
  signedIn: boolean;
  source: Source;
  back: string;          // path to return to after an action
  linkTitle?: boolean;
  reveal?: boolean;      // animate the split in: this is the question just voted on
};

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function QuestionCard({ question, shown, myVote, signedIn, source, back, linkTitle = true, reveal }: Props) {
  const closed = question.status !== "active";
  const canVote = signedIn && !(closed && !myVote);

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
        <form action={voteAction} className="vote">
          <input type="hidden" name="questionId" value={question.id} />
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="back" value={back} />
          <div className="vote-main">
            <button name="value" value="true" className={`btn answer true${myVote?.value === "true" ? " mine" : ""}`}
              aria-pressed={myVote?.value === "true"}>True</button>
            <button name="value" value="false" className={`btn answer false${myVote?.value === "false" ? " mine" : ""}`}
              aria-pressed={myVote?.value === "false"}>False</button>
          </div>
          <div className="vote-side">
            <button name="value" value="unsure" className={`btn quiet unsure${myVote?.value === "unsure" ? " mine" : ""}`}
              aria-pressed={myVote?.value === "unsure"}>Unsure</button>
            {myVote ? (
              <button formAction={deleteVoteAction} className="btn quiet">Delete</button>
            ) : (
              <button formAction={skipAction} className="btn quiet">Skip</button>
            )}
          </div>
          {myVote ? (
            <p className="vote-note">You voted {myVote.value}, {myVote.is_private ? "privately" : "publicly"}. One change per day.</p>
          ) : (
            <label className="vote-private"><input type="checkbox" name="private" /> Vote privately</label>
          )}
        </form>
      )}

      {closed && <p className="q-hint">Archived. This question no longer takes new votes.</p>}
      {!signedIn && (
        <p className="q-join"><Link href={`/signup?next=${encodeURIComponent(back)}`}>Create an account</Link> to vote.</p>
      )}
    </article>
  );
}
