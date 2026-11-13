import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForPool = globalThis as unknown as { __beliefMapPool?: Pool };

// On Vercel each function instance opens its own pool, so keep it small and point
// DATABASE_URL at Neon's pooled ("-pooler") host. Idle connections close quickly so a
// scaled-down instance doesn't hold them.
export const pool =
  globalForPool.__beliefMapPool ??
  (globalForPool.__beliefMapPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  }));

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
