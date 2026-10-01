/**
 * Apply Drizzle migrations. Run via `npm run db:migrate`.
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const url = process.env.DATABASE_URL ?? "./data/learning-os.db";
if (url !== ":memory:") {
  mkdirSync(dirname(url), { recursive: true });
}

const sqlite = new Database(url);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);

console.log(`[migrate] applying migrations to ${url}`);
migrate(db, { migrationsFolder: "./drizzle" });
console.log("[migrate] done");
sqlite.close();