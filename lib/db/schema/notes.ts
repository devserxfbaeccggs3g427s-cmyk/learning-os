import { pgTable, text, integer, index } from "drizzle-orm/pg-core";
import { createdAt } from "./_helpers";
import { tasks } from "./tasks";
import { studyBlocks } from "./schedule";
import { users } from "./users";

/**
 * Each task has one "current" note (TaskNote). Every save snapshots the
 * previous version into NoteRevision. This gives free revision history
 * without a heavyweight git-like system.
 *
 * `task_notes.content` is plain markdown (not structured JSON) — keep it
 * as `text` so it round-trips losslessly.
 */
export const taskNotes = pgTable(
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
    // The task detail query looks up by (taskId, userId). Composite
    // beats single-column here because the WHERE uses both columns.
    taskUserIdx: index("task_notes_task_user_idx").on(t.taskId, t.userId),
  }),
);

export const noteRevisions = pgTable(
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

/**
 * Same one-note-per-subject + revision-snapshot pattern as `task_notes`,
 * but keyed on the STUDY BLOCK instead of the task.
 *
 * Why a separate table rather than a `block_id` column on `task_notes`:
 * one task can have many blocks on the same day (PAY-01 had six on
 * 2026-10-05 alone). A single task-level row means the second session of
 * the day silently overwrites the first one's notes — which is what
 * happened before this table existed. Splitting by block also keeps the
 * task-note read paths (AI frame corpus, search) untouched: they still
 * read what they always read, and block notes are additive.
 *
 * `content` is plain markdown, same contract as `task_notes.content`.
 */
export const blockNotes = pgTable(
  "block_notes",
  {
    id: text("id").primaryKey(),
    blockId: text("block_id")
      .notNull()
      .references(() => studyBlocks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    lastSavedAt: text("last_saved_at"),
    createdAt: createdAt(),
  },
  (t) => ({
    blockIdx: index("block_notes_block_idx").on(t.blockId),
    // The read path filters on both columns, so the composite index
    // beats the single-column one for it.
    blockUserIdx: index("block_notes_block_user_idx").on(t.blockId, t.userId),
  }),
);

export const blockNoteRevisions = pgTable(
  "block_note_revisions",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .references(() => blockNotes.id, { onDelete: "cascade" }),
    blockId: text("block_id")
      .notNull()
      .references(() => studyBlocks.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    content: text("content").notNull(),
    message: text("message"),
    createdAt: createdAt(),
  },
  (t) => ({
    noteIdx: index("block_note_revisions_note_idx").on(t.noteId, t.revision),
  }),
);

export type BlockNoteRow = typeof blockNotes.$inferSelect;
export type BlockNoteRevisionRow = typeof blockNoteRevisions.$inferSelect;
