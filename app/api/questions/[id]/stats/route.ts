import { getAccount } from "@/lib/auth";
import { getQuestion } from "@/lib/questions";
import { publicView, questionStats } from "@/lib/stats";

// GET /api/questions/:id/stats?as_of=<ISO time>&active_since=<ISO time>
//
//   as_of         reconstruct the vote as it stood at that moment (default: now)
//   active_since  only count accounts that have been active at or after that moment
//
// Without a session the response holds percentages only. Signed-in callers also get head
// counts, churn, the public/private split and arrival sources. API keys will replace the
// session check when the API tiers exist.
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
  return Response.json({
    question: { id: question.id, text: question.text, status: question.status, askedAt: question.created_at },
    stats: account ? stats : publicView(stats),
  });
}
