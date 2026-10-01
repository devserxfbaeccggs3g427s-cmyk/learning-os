import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_helpers";
import { tasks } from "./tasks";
import { studyBlocks } from "./schedule";
import { users } from "./users";

/**
 * StudySessions are *started* instances of a study block. One study block can
 * have multiple sessions if a user pauses/resumes or re-attempts the same
 * block on the same day.
 */
export const studySessions = sqliteTable(
  "study_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    blockId: text("block_id")
      .references(() => studyBlocks.id, { onDelete: "set null" }),

    status: text("status").notNull().default("ACTIVE"), // ACTIVE | PAUSED | COMPLETED | ABANDONED
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    pausedAt: text("paused_at"),
    durationSeconds: integer("duration_seconds").notNull().default(0),

    objective: text("objective"),
    difficultyFeedback: integer("difficulty_feedback"), // 1..5
    confidence: integer("confidence"), // 1..5
    completionStatus: text("completion_status").notNull().default("PENDING"), // PENDING | COMPLETED | ABANDONED | PARTIAL

    sessionNotes: text("session_notes"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    userTaskIdx: index("study_sessions_user_task_idx").on(t.userId, t.taskId),
    startedAtIdx: index("study_sessions_started_idx").on(t.startedAt),
  }),
);

/**
 * Per-task aggregated progress that we update on session completion.
 * Kept as a row-per-task instead of recomputing each query.
 */
export const taskProgress = sqliteTable("task_progress", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => tasks.id, { onDelete: "cascade" }),
  totalStudySeconds: integer("total_study_seconds").notNull().default(0),
  sessionsCompleted: integer("sessions_completed").notNull().default(0),
  lastSessionAt: text("last_session_at"),
  completionRatio: real("completion_ratio").notNull().default(0),
  updatedAt: updatedAt(),
});

export type StudySessionRow = typeof studySessions.$inferSelect;
export type TaskProgressRow = typeof taskProgress.$inferSelect;