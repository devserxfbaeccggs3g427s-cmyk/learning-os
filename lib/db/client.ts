/**
 * Database client (Drizzle + better-sqlite3).
 *
 * One shared instance per process. Server-only; do not import from client
 * components. Use of `server-only` would throw under tsx/scripts, so we rely
 * on file naming + Next.js bundler to keep this server-only.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const dbUrl = process.env.DATABASE_URL ?? "./data/learning-os.db";

if (dbUrl !== ":memory:") {
  try {
    mkdirSync(dirname(dbUrl), { recursive: true });
  } catch {
    // ignore; in serverless / read-only filesystems mkdir may fail.
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __learning_os_sqlite: Database.Database | undefined;
}

const sqlite = globalThis.__learning_os_sqlite ?? new Database(dbUrl);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");

if (process.env.NODE_ENV !== "production") {
  globalThis.__learning_os_sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export const rawSqlite = sqlite;
export type DB = typeof db;