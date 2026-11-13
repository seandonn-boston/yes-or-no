import { hit, RULES, tooMany } from "@/lib/rate-limit";
import { ipFromRequest } from "@/lib/request";
import { getAccount } from "@/lib/auth";
import { toCard } from "@/lib/cards";
import { isCategory } from "@/lib/categories";
import { decodeCursor, feedPage, topPage } from "@/lib/feed";

// GET /api/feed?cursor=<opaque>&c=<category>
// The next page of the question feed for whoever is asking. Pages are fetched as the reader
// approaches the end of what is on screen; `next` is null when there is nothing more.
export async function GET(request: Request) {
  const limited = await hit([RULES.feedPerIp, ipFromRequest(request)]);
  if (limited) return Response.json({ error: tooMany(limited) }, { status: 429 });
  const url = new URL(request.url);
  const c = url.searchParams.get("c");
  const category = isCategory(c) ? c : null;
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const account = await getAccount();
  const page = account ? await feedPage(account.id, cursor, category) : await topPage(cursor, category);
  return Response.json(
    { items: page.rows.map((row) => toCard(row, account)), next: page.next },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
