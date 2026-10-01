/**
 * Domain-level configuration tables.
 *
 * Anything that is part of the product's domain but should NOT be hard-coded
 * (status enums, type enums, scheduling parameters, SRS defaults, etc.) is
 * declared here and re-exported as typed constants.
 *
 * To add a new status / type / threshold:
 *   1. Add it to the right tuple below.
 *   2. The exported type is automatically derived.
 *   3. The Zod schemas (used in API + import validation) auto-include it.
 */
import { z } from "zod";

// -----------------------------------------------------------------------------
// Task
// -----------------------------------------------------------------------------
export const TASK_STATUSES = [
  "BACKLOG",
  "SCHEDULED",
  "IN_PROGRESS",
  "LEARNED",
  "NEEDS_REVIEW",
  "MASTERED",
  "BLOCKED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const DIFFICULTIES = ["BASIC", "INTERMEDIATE", "ADVANCED", "SENIOR"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// -----------------------------------------------------------------------------
// Study Block
// -----------------------------------------------------------------------------
export const STUDY_BLOCK_TYPES = [
  "LEARN",
  "DEEP_DIVE",
  "LAB",
  "FAILURE_DRILL",
  "INTERVIEW",
  "REVIEW",
  "SYSTEM_DESIGN",
  "DEBUG_DRILL",
  "RECALL",
] as const;
export type StudyBlockType = (typeof STUDY_BLOCK_TYPES)[number];

// -----------------------------------------------------------------------------
// Mastery
// -----------------------------------------------------------------------------
/** Weights summing to 1.0 used to compute a configurable mastery score. */
export const MASTERY_WEIGHTS = {
  taskCompletion: 0.25,
  quizPerformance: 0.3,
  flashcardRetention: 0.25,
  reviewCompletion: 0.1,
  confidence: 0.1,
} as const;

export const MASTERY_THRESHOLDS = {
  /** Score above this is considered "Mastered". */
  mastered: 0.85,
  /** Score above this is considered "Solid" (Learnable but needs reinforcement). */
  solid: 0.65,
  /** Score above this is considered "Developing". */
  developing: 0.4,
} as const;

// -----------------------------------------------------------------------------
// Spaced repetition
// -----------------------------------------------------------------------------
/**
 * Default SM-2 inspired schedule. New cards progress through these intervals
 * (in days) on successive correct answers; the scheduler adjusts based on
 * user feedback (Again/Hard/Good/Easy).
 */
export const SRS_DEFAULTS = {
  initialIntervalDays: 1,
  secondIntervalDays: 3,
  easyBonus: 1.3,
  hardMultiplier: 0.85,
  lapseResetDays: 1,
  graduatingIntervalDays: 14,
  easyIntervalDays: 30,
  maxIntervalDays: 365,
  newCardsPerDay: 20,
  reviewsPerDay: 200,
} as const;

export const REVIEW_RATINGS = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

// -----------------------------------------------------------------------------
// Flashcards
// -----------------------------------------------------------------------------
export const FLASHCARD_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type FlashcardDifficulty = (typeof FLASHCARD_DIFFICULTIES)[number];

export const FLASHCARD_FOCUS = [
  "FUNDAMENTALS",
  "INTERNALS",
  "FAILURE_SCENARIOS",
  "PRODUCTION",
  "INTERVIEW",
  "MIXED",
] as const;
export type FlashcardFocus = (typeof FLASHCARD_FOCUS)[number];

export const FLASHCARD_SOURCES = [
  "NOTES_ONLY",
  "TaskContext",
  "NOTES_AND_AI",
  "INCORRECT_QUIZ",
  "SELECTED_CONTENT",
] as const;
export type FlashcardSource = (typeof FLASHCARD_SOURCES)[number];

// -----------------------------------------------------------------------------
// Quiz
// -----------------------------------------------------------------------------
export const QUIZ_DIFFICULTIES = [...DIFFICULTIES, "MIXED"] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];

export const QUIZ_FOCUS = [
  "FUNDAMENTAL",
  "INTERNAL",
  "FAILURE",
  "PRODUCTION",
  "CODE",
  "INTERVIEW",
  "MIXED",
] as const;
export type QuizFocus = (typeof QUIZ_FOCUS)[number];

export const QUIZ_SOURCES = [
  "NOTE_ONLY",
  "TaskContext",
  "NOTES_AND_AI",
  "FLASHCARDS",
  "WRONG_ANSWERS",
  "SELECTED_CONTENT",
] as const;
export type QuizSource = (typeof QUIZ_SOURCES)[number];

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// -----------------------------------------------------------------------------
// AI generation defaults
// -----------------------------------------------------------------------------
export const AI_GENERATION = {
  flashcard: {
    minCards: 5,
    maxCards: 30,
    defaultCards: 10,
  },
  quiz: {
    minQuestions: 3,
    maxQuestions: 25,
    defaultQuestions: 10,
  },
  retryOnSchemaError: 1,
  contextBudget: {
    /** Soft cap on characters of notes to feed into AI per request. */
    notesChars: 12_000,
    flashcardsChars: 4_000,
    quizHistoryItems: 10,
  },
} as const;

// -----------------------------------------------------------------------------
// Zod helpers (reused by API + import routes)
// -----------------------------------------------------------------------------
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const PrioritySchema = z.enum(PRIORITIES);
export const DifficultySchema = z.enum(DIFFICULTIES);
export const StudyBlockTypeSchema = z.enum(STUDY_BLOCK_TYPES);
export const ReviewRatingSchema = z.enum(REVIEW_RATINGS);
export const FlashcardDifficultySchema = z.enum(FLASHCARD_DIFFICULTIES);
export const FlashcardFocusSchema = z.enum(FLASHCARD_FOCUS);
export const FlashcardSourceSchema = z.enum(FLASHCARD_SOURCES);
export const QuizDifficultySchema = z.enum(QUIZ_DIFFICULTIES);
export const QuizFocusSchema = z.enum(QUIZ_FOCUS);
export const QuizSourceSchema = z.enum(QUIZ_SOURCES);
export const QuestionTypeSchema = z.enum(QUESTION_TYPES);