/**
 * Apply a hand-written migration file directly.
 *
 * Run: `npm run db:apply -- <migration.sql>`
 *
 * Why this exists: `drizzle/meta/` is gitignored (see .gitignore)
 * and absent from the repo, so `npm run db:migrate` — which reads
 * `meta/_journal.json` via the Drizzle migrator — cannot discover
 * or replay any migration in this repo. The SQL files under
 * `drizzle/` are the source of truth and are applied by hand.
 *
 * This script applies one .sql file the same way the Drizzle
 * migrator would: split on `--> statement-breakpoint`, execute
 * each statement in order inside one transaction. It is a no-op
 * for already-applied migrations — every statement in the
 * hand-written files is idempotent (`IF NOT EXISTS` /
 * `duplicate_object` swallowed) — so re-running is safe.
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "node:fs";

loadEnv({ path: ".env.local", override: false });

const file = process.argv[2];
if (!file) {
  console.error("usage: npm run db:apply -- <path/to/migration.sql>");
  process.exit(1);
}

const url =
  process.env.LEARNING_OS_POSTGRES_URL ??
  process.env.LEARNING_OS_SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "[apply-migration] LEARNING_OS_POSTGRES_URL is required (set it in .env.local)",
  );
}

const redacted = url.replace(/:[^:@/]+@/, ":***@");
console.log(`[apply-migration] ${file} → ${redacted}`);

const text = readFileSync(file, "utf8");
const statements = text
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const client = postgres(url, { max: 1, prepare: false, ssl: "require" });

try {
  await client.begin(async (tx) => {
    for (const stmt of statements) {
      // postgres-js executes a statement string directly; no ORM
      // wrapper is needed here.
      await tx.unsafe(stmt);
      console.log(`[apply-migration] ✓ ${stmt.slice(0, 60).replace(/\s+/g, " ")}…`);
    }
  });
  console.log(`[apply-migration] applied ${statements.length} statements from ${file}`);
} catch (err) {
  console.error(`[apply-migration] failed on ${file}:`, err);
  process.exitCode = 1;
} finally {
  await client.end();
}
