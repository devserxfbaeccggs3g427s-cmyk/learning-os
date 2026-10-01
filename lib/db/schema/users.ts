import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_helpers";

/**
 * User. The app is single-user today, but the schema is ready for
 * multi-user (auth) without refactoring.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
  // Settings version lets us run migrations on stored user JSON blobs.
  settingsVersion: integer("settings_version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type UserRow = typeof users.$inferSelect;