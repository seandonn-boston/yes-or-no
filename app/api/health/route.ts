import { query } from "@/lib/db";

// GET /api/health: for uptime monitors. 200 when the database answers, 503 when it doesn't.
export async function GET() {
  try {
    const [row] = await query<{ migrations: number }>("select count(*)::int as migrations from migrations");
    return Response.json({ ok: true, migrations: row.migrations }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
