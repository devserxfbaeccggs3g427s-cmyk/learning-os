import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * ISO 8601 strings for cross-language / cross-DB portability.
 * Always use these helpers so timestamps are consistent.
 */
export const nowMs = () => sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const id = () => text("id").primaryKey();
export const fk = (col: string) =>
  text(col)
    .notNull()
    .references(() => /* dummy */ (undefined as never));

export { sqliteTable, text, integer, uniqueIndex, sql };