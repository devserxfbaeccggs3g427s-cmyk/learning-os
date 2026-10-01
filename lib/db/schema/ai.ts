import { pgTable, text, integer, doublePrecision, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_helpers";
import { tasks } from "./tasks";
import { users } from "./users";

export interface AIMessageMetadata {
  provider?: string;
  model?: string;
  promptName?: string;
  promptVersion?: string;
  tokensIn?: number;
  tokensOut?: number;
  usage?: unknown;
  [k: string]: unknown;
}

/**
 * AI Conversations live per task. One "global" conversation per user has
 * taskId = NULL.
 */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Conversation"),
    mode: text("mode").notNull().default("TUTOR"), // TUTOR | INTERVIEW | FAILURE_DRILL | DEBUG_DRILL | KNOWLEDGE_GAP | GLOBAL
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    userTaskIdx: index("ai_conv_user_task_idx").on(t.userId, t.taskId, t.updatedAt),
  }),
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // SYSTEM | USER | ASSISTANT | TOOL
    content: text("content").notNull(),
    /** JSON: model, provider, promptName, promptVersion, tokensIn, tokensOut, cost, etc. */
    metadata: jsonb("metadata").$type<AIMessageMetadata>(),
    createdAt: createdAt(),
  },
  (t) => ({
    convIdx: index("ai_messages_conv_idx").on(t.conversationId, t.createdAt),
  }),
);

/**
 * Every AI-generated artifact records how it was generated so we can:
 *   - explain to the user which model produced it
 *   - preserve history even if prompt templates change later
 */
export const aiArtifactRecords = pgTable(
  "ai_artifact_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artifactType: text("artifact_type").notNull(), // FLASHCARD_DECK | QUIZ | NOTE_SUMMARY | KNOWLEDGE_GAP
    artifactId: text("artifact_id").notNull(), // foreign id into the relevant table
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptName: text("prompt_name"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: doublePrecision("cost_usd"),
    durationMs: integer("duration_ms"),
    success: boolean("success").notNull().default(true),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => ({
    artifactIdx: index("ai_artifact_idx").on(t.artifactType, t.artifactId),
  }),
);

export type AIConversationRow = typeof aiConversations.$inferSelect;
export type AIMessageRow = typeof aiMessages.$inferSelect;
export type AIArtifactRecordRow = typeof aiArtifactRecords.$inferSelect;
