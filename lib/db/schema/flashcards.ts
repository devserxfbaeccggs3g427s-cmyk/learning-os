import { pgTable, text, integer, doublePrecision, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_helpers";
import { tasks } from "./tasks";
import { users } from "./users";

export const flashcardDecks = pgTable(
  "flashcard_decks",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    source: text("source").notNull().default("NOTES_ONLY"), // FLASHCARD_SOURCES
    focus: text("focus").notNull().default("MIXED"), // FLASHCARD_FOCUS
    difficulty: text("difficulty").notNull().default("MEDIUM"), // FLASHCARD_DIFFICULTY
    cardCount: integer("card_count").notNull().default(0),
    generatedBy: text("generated_by"), // AI provider/model string
    promptName: text("prompt_name"),
    promptVersion: text("prompt_version"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    taskIdx: index("flashcard_decks_task_idx").on(t.taskId),
  }),
);

export const flashcards = pgTable(
  "flashcards",
  {
    id: text("id").primaryKey(),
    deckId: text("deck_id")
      .notNull()
      .references(() => flashcardDecks.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    cardType: text("card_type").notNull().default("BASIC"), // BASIC | QA | SCENARIO | CLOZE

    front: text("front").notNull(),
    back: text("back").notNull(),
    explanation: text("explanation"),

    difficulty: text("difficulty").notNull().default("MEDIUM"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    sourceType: text("source_type"), // NOTES | AI | MANUAL

    // SRS scheduling fields
    intervalDays: doublePrecision("interval_days").notNull().default(0),
    easeFactor: doublePrecision("ease_factor").notNull().default(2.5),
    repetitions: integer("repetitions").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    dueAt: text("due_at"), // null => new (never reviewed)
    lastReviewedAt: text("last_reviewed_at"),
    suspended: boolean("suspended").notNull().default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    deckIdx: index("flashcards_deck_idx").on(t.deckId, t.orderIndex),
    dueIdx: index("flashcards_due_idx").on(t.dueAt),
  }),
);

export type FlashcardDeckRow = typeof flashcardDecks.$inferSelect;
export type FlashcardRow = typeof flashcards.$inferSelect;
