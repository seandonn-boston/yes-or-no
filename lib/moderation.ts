import type { Match } from "./questions";

// Second-layer duplicate check, run when someone presses "Ask now".
//
// The first layer is the search page itself: the asker sees similar questions and decides
// whether theirs is already there. Exact repeats (same words after normalising) are always
// refused. Everything in between needs judgement, because sibling questions are legitimately
// one word apart ("Will A win the Vermont seat?" / "Will B win the Vermont seat?") while true
// duplicates can share almost no words ("Is Bigfoot real?" / "Does Sasquatch exist?").
//
// Word-overlap scoring cannot tell those apart, so this is where a language-model check
// belongs. Until one is wired in, nothing beyond exact repeats is blocked automatically.
// Return the id of the existing question that `text` duplicates, or null if it is new.
export async function findDuplicate(text: string, candidates: Match[]): Promise<number | null> {
  void text;
  void candidates;
  return null;
}
