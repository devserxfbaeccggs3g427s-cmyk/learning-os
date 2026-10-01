import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createdAt } from "./_helpers";
import { tasks } from "./tasks";
import { users } from "./users";

/**
 * Each task has one "current" note (TaskNote). Every save snapshots the
 * previous version into NoteRevision. This gives free revision history
 * without a heavyweight git-like system.
 */
export const taskNotes = sqliteTable(
  "task_notes",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    lastSavedAt: text("last_saved_at"),
    createdAt: createdAt(),
  },
  (t) => ({
    taskIdx: index("task_notes_task_idx").on(t.taskId),
  }),
);

export const noteRevisions = sqliteTable(
  "note_revisions",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .references(() => taskNotes.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    content: text("content").notNull(),
    message: text("message"), // optional commit-like message
    createdAt: createdAt(),
  },
  (t) => ({
    noteIdx: index("note_revisions_note_idx").on(t.noteId, t.revision),
  }),
);

export type TaskNoteRow = typeof taskNotes.$inferSelect;
export type NoteRevisionRow = typeof noteRevisions.$inferSelect;