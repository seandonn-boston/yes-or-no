import { readdirSync, readFileSync } from "fs";
import path from "path";
import { Pool } from "pg";

// Applies db/migrations/*.sql in order, each in its own transaction. Runs on every deploy;
// an advisory lock keeps two deploys from migrating at the same time.
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(727274)");
    await client.query(
      "create table if not exists migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const done = await client.query("select 1 from migrations where name = $1", [file]);
      if (done.rowCount) continue;
      try {
        await client.query("begin");
        await client.query(readFileSync(path.join(dir, file), "utf8"));
        await client.query("insert into migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`${file}: ${(err as Error).message}`);
      }
    }
    console.log("migrations up to date");
  } finally {
    await client.query("select pg_advisory_unlock(727274)").catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
