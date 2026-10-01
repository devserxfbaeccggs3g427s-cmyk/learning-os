import { sqliteTable, text, real, integer, index } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_helpers";
import { tasks } from "./tasks";
import { users } from "./users";

/**
 * Mastery records. The score is a derived value that combines several
 * signals (see MASTERY_WEIGHTS). The breakdown keeps the contributing
 * components around for analytics and overrides.
 */
export const masteryRecords = sqliteTable(
  "mastery_records",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: real("score").notNull().default(0),
    band: text("band").notNull().default("DEVELOPING"), // DEVELOPING | SOLID | MASTERED
    breakdown: text("breakdown").notNull(), // JSON {taskCompletion,quizPerformance,...}
    override: integer("override", { mode: "boolean" }).notNull().default(false),
    overrideReason: text("override_reason"),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    userTaskIdx: index("mastery_user_task_idx").on(t.userId, t.taskId),
  }),
);

export type MasteryRecordRow = typeof masteryRecords.$inferSelect;