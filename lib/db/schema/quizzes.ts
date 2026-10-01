import { pgTable, text, integer, doublePrecision, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_helpers";
import { tasks } from "./tasks";
import { users } from "./users";
import { flashcards } from "./flashcards";

export const quizzes = pgTable(
  "quizzes",
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
    source: text("source").notNull().default("NOTE_ONLY"),
    focus: text("focus").notNull().default("MIXED"),
    difficulty: text("difficulty").notNull().default("INTERMEDIATE"),
    questionCount: integer("question_count").notNull().default(0),
    generatedBy: text("generated_by"),
    promptName: text("prompt_name"),
    promptVersion: text("prompt_version"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    taskIdx: index("quizzes_task_idx").on(t.taskId),
  }),
);

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    questionType: text("question_type").notNull().default("SINGLE_CHOICE"),
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<unknown[]>().notNull(),
    correctAnswer: jsonb("correct_answer").$type<unknown>().notNull(),
    explanation: text("explanation"),
    difficulty: text("difficulty").notNull().default("INTERMEDIATE"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    sourceRef: text("source_ref"), // optional pointer to flashcard/note
    relatedFlashcardId: text("related_flashcard_id").references(() => flashcards.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => ({
    quizIdx: index("quiz_questions_quiz_idx").on(t.quizId, t.orderIndex),
  }),
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: text("started_at").notNull(),
    submittedAt: text("submitted_at"),
    score: doublePrecision("score"), // 0..1
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    status: text("status").notNull().default("IN_PROGRESS"),
    createdAt: createdAt(),
  },
  (t) => ({
    userQuizIdx: index("quiz_attempts_user_quiz_idx").on(t.userId, t.quizId),
  }),
);

export const quizAnswers = pgTable(
  "quiz_answers",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    answer: jsonb("answer").$type<unknown>().notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    confidence: integer("confidence"),
    timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({
    attemptIdx: index("quiz_answers_attempt_idx").on(t.attemptId),
  }),
);

export type QuizRow = typeof quizzes.$inferSelect;
export type QuizQuestionRow = typeof quizQuestions.$inferSelect;
export type QuizAttemptRow = typeof quizAttempts.$inferSelect;
export type QuizAnswerRow = typeof quizAnswers.$inferSelect;
