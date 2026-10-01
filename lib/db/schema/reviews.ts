import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { createdAt } from "./_helpers";
import { flashcards } from "./flashcards";
import { users } from "./users";

/**
 * One row per individual flashcard review. We keep this append-only so we
 * can compute retention analytics later.
 */
export const reviewHistory = sqliteTable(
  "review_history",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flashcardId: text("flashcard_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(), // AGAIN | HARD | GOOD | EASY
    previousIntervalDays: real("previous_interval_days"),
    newIntervalDays: real("new_interval_days"),
    previousEase: real("previous_ease"),
    newEase: real("new_ease"),
    durationSeconds: integer("duration_seconds"),
    reviewedAt: text("reviewed_at").notNull(),
  },
  (t) => ({
    cardIdx: index("review_history_card_idx").on(t.flashcardId, t.reviewedAt),
    userIdx: index("review_history_user_idx").on(t.userId, t.reviewedAt),
  }),
);

/**
 * ReviewSession groups a contiguous burst of flashcard reviews (e.g. a
 * 15-minute recall block). Used for analytics.
 */
export const reviewSessions = sqliteTable("review_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  cardsReviewed: integer("cards_reviewed").notNull().default(0),
  againCount: integer("again_count").notNull().default(0),
  goodCount: integer("good_count").notNull().default(0),
  createdAt: createdAt(),
});

export type ReviewHistoryRow = typeof reviewHistory.$inferSelect;
export type ReviewSessionRow = typeof reviewSessions.$inferSelect;