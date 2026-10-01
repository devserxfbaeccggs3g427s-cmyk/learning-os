import { pgTable, text, integer, index } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_helpers";
import { users } from "./users";
import { tasks } from "./tasks";

/**
 * ScheduleDays are *generated* per user. They group study blocks for a given
 * calendar day. We keep one row per (user, date) so we can query Today and
 * the surrounding week.
 */
export const schedules = pgTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // ISO date (no TZ); interpreted in user TZ
    objective: text("objective"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    userDateIdx: index("schedules_user_date_idx").on(t.userId, t.date),
  }),
);

export const studyBlocks = pgTable(
  "study_blocks",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    type: text("type").notNull().default("LEARN"),
    title: text("title").notNull(),
    objective: text("objective"),
    startMinute: integer("start_minute").notNull(), // minutes since 00:00
    durationMinutes: integer("duration_minutes").notNull(),
    deliverable: text("deliverable"),
    status: text("status").notNull().default("PLANNED"), // PLANNED | IN_PROGRESS | DONE | SKIPPED
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    schedIdx: index("study_blocks_sched_idx").on(t.scheduleId, t.startMinute),
    taskIdx: index("study_blocks_task_idx").on(t.taskId),
  }),
);

export type ScheduleRow = typeof schedules.$inferSelect;
export type StudyBlockRow = typeof studyBlocks.$inferSelect;
