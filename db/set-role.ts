// Make someone a moderator or admin:   npm run admin:role -- <username> moderator
// Take it away again:                  npm run admin:role -- <username> user
import { pool } from "../lib/db";

async function main() {
  const [username, role] = process.argv.slice(2);
  if (!username || !["user", "moderator", "admin"].includes(role)) {
    throw new Error("Usage: npm run admin:role -- <username> <user|moderator|admin>");
  }
  const result = await pool.query("update accounts set role = $2 where username = $1 and deleted_at is null returning id", [
    username.toLowerCase(),
    role,
  ]);
  if (!result.rowCount) throw new Error(`No account named ${username}.`);
  console.log(`${username} is now ${role === "user" ? "a regular user" : `a ${role}`}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
