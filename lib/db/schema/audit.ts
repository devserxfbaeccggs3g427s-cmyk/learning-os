import { pgTable, text, jsonb, index } from "drizzle-orm/pg-core";
import { createdAt } from "./_helpers";
import { users } from "./users";

/**
 * Append-only audit log. We use this sparingly (feature toggles, schema
 * changes, important user actions) and never log secrets.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => ({
    userIdx: index("audit_user_idx").on(t.userId, t.createdAt),
    subjectIdx: index("audit_subject_idx").on(t.subjectType, t.subjectId),
  }),
);

export type AuditLogRow = typeof auditLog.$inferSelect;
