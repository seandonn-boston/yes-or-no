import { exportData } from "@/lib/account";
import { getAccount } from "@/lib/auth";

// GET /api/me/export: download everything held about the signed-in account as JSON.
export async function GET() {
  const account = await getAccount();
  if (!account) return Response.json({ error: "Sign in to download your data." }, { status: 401 });
  const data = await exportData(account.id);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="belief-map-${account.username}-${date}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
