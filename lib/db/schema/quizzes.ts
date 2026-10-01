import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_helpers";
import { tasks } from "./tasks";
import { users } from "./users";
import { flashcards } from "./flashcards";

export const quizzes = sqliteTable(
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

export const quizQuestions = sqliteTable(
  "quiz_questions",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    questionType: text("question_type").notNull().default("SINGLE_CHOICE"),
    prompt: text("prompt").notNull(),
    options: text("options").notNull(), // JSON array of {id,text}
    correctAnswer: text("correct_answer").notNull(), // JSON (id list or bool)
    explanation: text("explanation"),
    difficulty: text("difficulty").notNull().default("INTERMEDIATE"),
    tags: text("tags"), // JSON array
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

export const quizAttempts = sqliteTable(
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
    score: real("score"), // 0..1
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    status: text("status").notNull().default("IN_PROGRESS"),
    createdAt: createdAt(),
  },
  (t) => ({
    userQuizIdx: index("quiz_attempts_user_quiz_idx").on(t.userId, t.quizId),
  }),
);

export const quizAnswers = sqliteTable(
  "quiz_answers",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    answer: text("answer").notNull(), // JSON
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull().default(false),
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