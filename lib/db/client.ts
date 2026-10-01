/**
 * Database client (Drizzle + postgres-js + Supabase Postgres).
 *
 * One shared connection pool per process. Server-only; do not import from
 * client components. We rely on file naming + Next.js bundler to keep this
 * server-only (the `server-only` package would throw under tsx/scripts).
 *
 * Connection: Supabase transaction pooler (port 6543) is the recommended
 * driver. We force `max: 1` per serverless instance + `prepare: false`
 * because pgBouncer in transaction mode does not support prepared
 * statements.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function readConnectionUrl(): string {
  return (
    process.env.LEARNING_OS_POSTGRES_URL ??
    process.env.LEARNING_OS_SUPABASE_DATABASE_URL ??
    process.env.DATABASE_URL ??
    ""
  );
}

function redact(url: string): string {
  return url.replace(/:[^:@/]+@/, ":***@");
}

const dbUrl = readConnectionUrl();
if (!dbUrl) {
  // Loud failure: surface the misconfig at import time on the server.
  // Build/typecheck don't reach this branch (Next inlines env vars only
  // when the app code is imported in a server context).
  throw new Error(
    "[db] LEARNING_OS_POSTGRES_URL is not set. Copy .env.local.example to .env.local and fill it in.",
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __learning_os_pg: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  return postgres(dbUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    // eslint-disable-next-line no-console
    debug: (_conn, query, params) => {
      // Postgres-js uses an internal logging channel; gated by env var to
      // avoid noise during normal runs.
      if (process.env.LEARNING_OS_PG_DEBUG === "1") {
        // eslint-disable-next-line no-console
        console.log(`[pg] ${query} -- ${JSON.stringify(params ?? [])}`);
      }
    },
    ...(dbUrl.includes("sslmode=require") || dbUrl.includes("supabase")
      ? { ssl: "require" as const }
      : {}),
  });
}

const client = globalThis.__learning_os_pg ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__learning_os_pg = client;
}

// eslint-disable-next-line no-console
console.log(`[db] connected to ${redact(dbUrl)}`);

export const db = drizzle(client, { schema });
export type DB = typeof db;
