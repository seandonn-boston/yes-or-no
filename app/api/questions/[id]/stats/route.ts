import { countAccess, estimate } from "@/lib/access";
import { getAccount } from "@/lib/auth";
import { getQuestion } from "@/lib/questions";
import { publicView, questionStats } from "@/lib/stats";
import { myVotes } from "@/lib/votes";

// GET /api/questions/:id/stats?as_of=<ISO time>&active_since=<ISO time>
//
//   as_of         reconstruct the vote as it stood at that moment (default: now)
//   active_since  only count accounts that have been active at or after that moment
//
// What comes back depends on who is asking (see lib/access.ts):
//   no account                 percentages only
//   free account, not voted    percentages plus a rounded estimate of the vote count
//   free account after voting, exact counts, churn, the public/private split and arrival
//   or any paid account        sources
// API keys will join the paid branch when the API tiers exist.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const questionId = Number(id);
  if (!Number.isInteger(questionId) || questionId <= 0) {
    return Response.json({ error: "Invalid question id." }, { status: 400 });
  }
  const question = await getQuestion(questionId);
  if (!question) return Response.json({ error: "Question not found." }, { status: 404 });

  const url = new URL(request.url);
  const parse = (key: string) => {
    const raw = url.searchParams.get(key);
    if (!raw) return undefined;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const asOf = parse("as_of");
  const activeSince = parse("active_since");
  if (asOf === null || activeSince === null) {
    return Response.json({ error: "as_of and active_since must be ISO 8601 times." }, { status: 400 });
  }

  const stats = await questionStats(questionId, { asOf, activeSince });
  const account = await getAccount();
  const voted = account ? (await myVotes(account.id, [questionId])).has(questionId) : false;
  const access = countAccess(account, voted);
  return Response.json({
    question: { id: question.id, text: question.text, status: question.status, askedAt: question.created_at },
    stats:
      access === "full" ? stats
      : access === "estimate" ? { ...publicView(stats), estimatedVotes: estimate(stats.tally.total) }
      : publicView(stats),
  });
}
