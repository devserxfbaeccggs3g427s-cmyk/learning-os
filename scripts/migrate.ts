/**
 * Apply Drizzle migrations. Run via `npm run db:migrate`.
 *
 * Uses postgres-js + drizzle-orm/postgres-js/migrator against the
 * Supabase Postgres URL configured via LEARNING_OS_POSTGRES_URL.
 *
 * Loads `.env.local` first (Next.js auto-loads it for the dev server, but
 * tsx doesn't).
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

loadEnv({ path: ".env.local", override: false });

const url =
  process.env.LEARNING_OS_POSTGRES_URL ??
  process.env.LEARNING_OS_SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "[migrate] LEARNING_OS_POSTGRES_URL (or LEARNING_OS_SUPABASE_DATABASE_URL) is required. Set it in .env.local.",
  );
}

const redacted = url.replace(/:[^:@/]+@/, ":***@");
console.log(`[migrate] applying migrations to ${redacted}`);

const client = postgres(url, {
  max: 1,
  prepare: false,
  ...(url.includes("sslmode=require") || url.includes("supabase")
    ? { ssl: "require" as const }
    : {}),
});
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("[migrate] done");
await client.end();
