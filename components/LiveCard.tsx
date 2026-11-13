"use client";

import { useState, useTransition, type FormEvent } from "react";
import { deleteVoteInline, skipInline, voteInline } from "@/app/actions";
import type { CardItem } from "@/lib/cards";
import { QuestionCard } from "./QuestionCard";

type Props = {
  item: CardItem;
  signedIn: boolean;
  back: string;
  onSkip: (id: number) => void;
};

// A question card whose votes are saved without leaving the page, so a long list keeps its
// place and the one-at-a-time view shows the result on the panel you are looking at.
export function LiveCard({ item, signedIn, back, onSkip }: Props) {
  const [card, setCard] = useState(item);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const act = submitter?.dataset.act;
    if (!act) return; // unknown button: let the form submit normally
    event.preventDefault();
    const isPrivate = new FormData(event.currentTarget).get("private") === "on";
    const base = { questionId: card.id, source: card.slot };

    startTransition(async () => {
      setError(null);
      if (act === "skip") {
        const result = await skipInline(base);
        if (result.ok) onSkip(card.id);
        else setError("That didn't save. Try again.");
        return;
      }
      const result = act === "delete" ? await deleteVoteInline(base) : await voteInline({ ...base, value: act, isPrivate });
      if (result.ok) setCard({ ...result.card, fresh: act !== "delete" });
      else setError(result.error);
    });
  }

  return (
    <QuestionCard
      question={card}
      shown={card.shown}
      myVote={card.myVote}
      signedIn={signedIn}
      source={card.slot}
      back={back}
      reveal={card.fresh}
      onSubmit={onSubmit}
      busy={busy}
      error={error}
    />
  );
}
