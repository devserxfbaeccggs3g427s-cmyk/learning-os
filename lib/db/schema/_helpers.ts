import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * ISO 8601 timestamps stored as `timestamp with time zone` (Postgres).
 * All callers should treat these as JS `Date` objects; the Drizzle layer
 * serializes/deserializes automatically.
 */
export const nowMs = () => sql`(now())`;

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const id = (name = "id") => text(name).primaryKey();
export const fk = (col: string) => text(col).notNull();

export { pgTable, text, uniqueIndex, sql };
