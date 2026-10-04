import { pgTable, text, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_helpers";
import { users } from "./users";
import { tasks } from "./tasks";

/**
 * AI Chat Frames — conversation frames that are independent of the
 * screen the user opened them from, but CAN be bound to one task.
 *
 * Why a separate table instead of reusing `ai_conversations`:
 *   - `ai_conversations.task_id` FK-cascades on task delete and the
 *     existing `/api/ai/chat` route auto-injects task/roadmap/schedule
 *     context whenever `taskId` is present (and even when it is null —
 *     the `else` branch injects today's schedule + task index). A frame
 *     must have none of those paths, so it lives in its own table.
 *   - Frames live in their own tables, so the legacy conversation list
 *     (which reads `ai_conversations`) can never surface them. The two
 *     chat systems cannot mix in the UI without an explicit join.
 *
 * `knowledge_mode` is the explicit opt-in gate for project knowledge
 * (requirement: the chatbot must NOT automatically sweep in the whole
 * task index / roadmap / notes):
 *   NONE              — frame history only (default)
 *   TASK_INDEX        — the user's task code/title index is retrievable
 *   ROADMAP           — the user's roadmap tree is retrievable
 *   INDEX_PLUS_ROADMAP — both
 *   NOTES             — the user's notes join the retrieval pool
 *
 * `task_id` is the ONE task a frame belongs to, set at creation by the
 * task-aware screens (Start Task, task Notes). It is deliberately
 * separate from `knowledge_mode`: the bound task joins the retrieval
 * pool even when the mode is NONE, because it is what the frame was
 * opened for, whereas the mode gates everything the user did NOT
 * explicitly pick.
 *
 * `onDelete: "set null"` (not cascade, unlike `ai_conversations`):
 * deleting a task must not silently destroy the conversation that was
 * opened about it. The frame survives with `task_id = NULL` and simply
 * loses that one retrieval candidate.
 *
 * Retrieval is a per-turn BM25 query (lib/ai/frame/retrieve.ts), never
 * an unconditional injection, and it is keyed on `userId` — the request
 * body carries no task id, no screen id, no route context. The bound
 * task is read off the FRAME ROW, which is why the chat route still
 * rejects a body-supplied `taskId` with `.strict()`.
 */
export const aiChatFrames = pgTable(
  "ai_chat_frames",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Chat"),
    /** Where the user opened the frame from. Display-only label —
     *  NEVER used to build context. */
    entryPoint: text("entry_point").notNull().default("UNKNOWN"), // NOTE_SCREEN | START_TASK | UNKNOWN
    knowledgeMode: text("knowledge_mode").notNull().default("NONE"),
    /** The task this frame belongs to, set only at creation by a
     *  task-aware screen. NULL for a frame opened anywhere else.
     *  Read off the frame row by the chat route — never trusted
     *  from the request body. */
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    userIdx: index("ai_chat_frames_user_idx").on(t.userId, t.updatedAt),
  }),
);

/**
 * Messages belonging to exactly one frame. The only context a frame
 * ever uses is its own rows, fetched with
 * `WHERE frame_id = frameId AND user_id = ...` — which is what
 * makes closing a frame and opening a new one a hard context reset
 * rather than a UI-level one.
 */
export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    id: text("id").primaryKey(),
    frameId: text("frame_id")
      .notNull()
      .references(() => aiChatFrames.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // USER | ASSISTANT
    content: text("content").notNull(),
    /**
     * JSON: provider, model, promptName, promptVersion, usage, and
     * grounding telemetry — `{ grounded, noAnswer, retrieval:
     * { candidates, hits, topScore } }`. Reuses the shape of
     * `AIMessageMetadata` so nothing new is needed on the read path.
     */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => ({
    frameIdx: index("ai_chat_messages_frame_idx").on(t.frameId, t.createdAt),
  }),
);

/**
 * Per-frame pinned data — the literal implementation of "its own
 * separately-stored data". Users can pin a piece of project knowledge
 * to a specific frame; those snippets join that frame's retrieval
 * pool and no other frame's.
 */
export const aiChatFrameSnippets = pgTable(
  "ai_chat_frame_snippets",
  {
    id: text("id").primaryKey(),
    frameId: text("frame_id")
      .notNull()
      .references(() => aiChatFrames.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Snippet"),
    body: text("body").notNull(),
    source: text("source").notNull().default("MANUAL"), // MANUAL | NOTE | TASK | ROADMAP
    createdAt: createdAt(),
  },
  (t) => ({
    frameIdx: index("ai_chat_frame_snippets_frame_idx").on(t.frameId),
    userIdx: index("ai_chat_frame_snippets_user_idx").on(t.userId),
  }),
);

export type AIChatFrameRow = typeof aiChatFrames.$inferSelect;
export type AIChatMessageRow = typeof aiChatMessages.$inferSelect;
export type AIChatFrameSnippetRow = typeof aiChatFrameSnippets.$inferSelect;

/** Valid `entryPoint` values (display labels only — never context). */
export const FRAME_ENTRY_POINTS = [
  "NOTE_SCREEN",
  "START_TASK",
  "UNKNOWN",
] as const;
export type FrameEntryPoint = (typeof FRAME_ENTRY_POINTS)[number];

/** Valid `knowledgeMode` values — the opt-in gate for project knowledge. */
export const FRAME_KNOWLEDGE_MODES = [
  "NONE",
  "TASK_INDEX",
  "ROADMAP",
  "INDEX_PLUS_ROADMAP",
  "NOTES",
] as const;
export type FrameKnowledgeMode = (typeof FRAME_KNOWLEDGE_MODES)[number];

export type FrameListScope = "all" | "frames" | "legacy";
