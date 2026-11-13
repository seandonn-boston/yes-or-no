import { hit, RULES, tooMany } from "@/lib/rate-limit";
import { ipFromRequest } from "@/lib/request";
import { countAccess, detailLevel, estimate, isApiKey, shapeStats } from "@/lib/access";
import { getAccount } from "@/lib/auth";
import { getQuestion } from "@/lib/questions";
import { questionStats } from "@/lib/stats";
import { myVotes } from "@/lib/votes";

// GET /api/questions/:id/stats
//
// What comes back depends on who is asking (see lib/access.ts):
//   no account                  percentages
//   free account, not voted     percentages and a rounded estimate of the vote count
//   free account, voted         exact counts and the share who have changed their mind
//   paid account                conviction figures, 14-day history, public versus private
//   API key (Authorization:     all of the above, arrival routes, and two filters:
//   Bearer <key>)                 as_of=<ISO time>         the vote as it stood at that moment
//                                 active_since=<ISO time>  only accounts active since then
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Keyed callers are metered separately; everyone else shares a per-IP allowance.
  if (!isApiKey(request.headers.get("authorization"))) {
    const limited = await hit([RULES.statsPerIp, ipFromRequest(request)]);
    if (limited) return Response.json({ error: tooMany(limited) }, { status: 429 });
  }
  const { id } = await params;
  const questionId = Number(id);
  if (!Number.isInteger(questionId) || questionId <= 0) {
    return Response.json({ error: "Invalid question id." }, { status: 400 });
  }
  const question = await getQuestion(questionId);
  if (!question) return Response.json({ error: "Question not found." }, { status: 404 });

  const hasKey = isApiKey(request.headers.get("authorization"));
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
  if ((asOf || activeSince) && !hasKey) {
    return Response.json({ error: "The as_of and active_since filters need an API key." }, { status: 403 });
  }

  const stats = await questionStats(questionId, { asOf, activeSince });
  const account = hasKey ? null : await getAccount();
  const voted = account ? (await myVotes(account.id, [questionId])).has(questionId) : false;
  const level = detailLevel(account, voted, hasKey);
  const estimated = countAccess(account, voted) === "estimate" ? estimate(stats.tally.total) : undefined;

  return Response.json({
    question: { id: question.id, text: question.text, status: question.status, askedAt: question.created_at },
    access: level,
    stats: shapeStats(stats, level, estimated),
  });
}
