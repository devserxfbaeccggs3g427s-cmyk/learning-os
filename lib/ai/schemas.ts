/**
 * Schemas for structured AI output. Validated with Zod; reused by services
 * to ensure AI responses can never bypass application data integrity.
 */
import { z } from "zod";
import {
  FLASHCARD_DIFFICULTIES,
  FLASHCARD_FOCUS,
  QUESTION_TYPES,
  QUIZ_DIFFICULTIES,
  QUIZ_FOCUS,
} from "@/config/domain";

// ----------------------------------------------------------------------------
// Flashcard generation
// ----------------------------------------------------------------------------

export const FlashcardFrontSchema = z.object({
  text: z.string().min(1),
  hint: z.string().optional(),
});

export const FlashcardBackSchema = z.object({
  text: z.string().min(1),
  code: z.string().optional(),
});

const FLASHCARD_CARD_TYPE_ALIASES: Record<string, "BASIC" | "QA" | "SCENARIO" | "CLOZE"> = {
  BASIC: "BASIC",
  QA: "QA",
  Q_A: "QA",
  QUESTION_ANSWER: "QA",
  Q: "QA",
  SCENARIO: "SCENARIO",
  CASE: "SCENARIO",
  SITUATION: "SCENARIO",
  CLOZE: "CLOZE",
  FILL: "CLOZE",
  FILL_IN_THE_BLANK: "CLOZE",
  FILL_BLANK: "CLOZE",
};

const FLASHCARD_DIFFICULTY_ALIASES: Record<string, (typeof FLASHCARD_DIFFICULTIES)[number]> = {
  EASY: "EASY",
  SIMPLE: "EASY",
  BEGINNER: "EASY",
  BASIC: "EASY",
  MEDIUM: "MEDIUM",
  INTERMEDIATE: "MEDIUM",
  NORMAL: "MEDIUM",
  MODERATE: "MEDIUM",
  HARD: "HARD",
  DIFFICULT: "HARD",
  ADVANCED: "HARD",
  SENIOR: "HARD",
};

/**
 * Normalize a single card from the model's output. Many models wrap or
 * rename them; coerce everything into the canonical shape so callers never
 * see a `parse failure` for what is essentially a successful generation.
 */
function normalizeFlashcard(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const c = { ...(raw as Record<string, unknown>) };

  // cardType aliases
  if (typeof c.cardType === "string") {
    const upper = c.cardType.toUpperCase().replace(/[\s-]+/g, "_");
    c.cardType = FLASHCARD_CARD_TYPE_ALIASES[upper] ?? c.cardType;
  }

  // front: accept {text} | string | {value} | {front}
  if (c.front && typeof c.front === "object") {
    const f = { ...(c.front as Record<string, unknown>) };
    if (typeof f.text !== "string" || !f.text.trim()) {
      f.text =
        (typeof f.value === "string" && f.value) ||
        (typeof f.question === "string" && f.question) ||
        (typeof f.prompt === "string" && f.prompt) ||
        (typeof f.q === "string" && f.q) ||
        "";
    }
    c.front = f;
  } else if (typeof c.front === "string") {
    c.front = { text: c.front };
  } else if (typeof c.question === "string") {
    c.front = { text: c.question };
  } else if (typeof c.q === "string") {
    c.front = { text: c.q };
  }

  // back: accept {text} | string | {value} | {answer}
  if (c.back && typeof c.back === "object") {
    const b = { ...(c.back as Record<string, unknown>) };
    if (typeof b.text !== "string" || !b.text.trim()) {
      b.text =
        (typeof b.value === "string" && b.value) ||
        (typeof b.answer === "string" && b.answer) ||
        (typeof b.a === "string" && b.a) ||
        (typeof b.explanation === "string" && b.explanation) ||
        "";
    }
    c.back = b;
  } else if (typeof c.back === "string") {
    c.back = { text: c.back };
  } else if (typeof c.answer === "string") {
    c.back = { text: c.answer };
  } else if (typeof c.a === "string") {
    c.back = { text: c.a };
  }

  // difficulty aliases
  if (typeof c.difficulty === "string") {
    const upper = c.difficulty.toUpperCase().replace(/[\s-]+/g, "_");
    c.difficulty = FLASHCARD_DIFFICULTY_ALIASES[upper] ?? c.difficulty;
  }

  if (typeof c.explanation !== "string" || !c.explanation.trim()) {
    const e =
      (typeof c.note === "string" && c.note) ||
      (typeof c.notes === "string" && c.notes) ||
      (typeof c.rationale === "string" && c.rationale) ||
      "";
    if (e) c.explanation = e;
  }

  if (!Array.isArray(c.tags)) c.tags = [];
  return c;
}

export const FlashcardGenerationCardSchema = z.preprocess(
  normalizeFlashcard,
  z.object({
    cardType: z.enum(["BASIC", "QA", "SCENARIO", "CLOZE"]).default("BASIC"),
    front: FlashcardFrontSchema,
    back: FlashcardBackSchema,
    explanation: z.string().optional(),
    difficulty: z.enum(FLASHCARD_DIFFICULTIES).default("MEDIUM"),
    tags: z.array(z.string()).default([]),
  }),
);

export const FlashcardGenerationSchema = z.preprocess(
  (raw) => {
    // Accept a bare array as the deck.
    if (Array.isArray(raw)) return { cards: raw };
    if (!raw || typeof raw !== "object") return raw;
    const obj = { ...(raw as Record<string, unknown>) };
    if (!Array.isArray(obj.cards)) {
      const alt =
        (Array.isArray(obj.flashcards) && obj.flashcards) ||
        (Array.isArray(obj.deck) && obj.deck) ||
        (Array.isArray(obj.decks) && obj.decks) ||
        (Array.isArray(obj.items) && obj.items) ||
        (Array.isArray(obj.data) && obj.data) ||
        null;
      if (alt) obj.cards = alt;
    }
    return obj;
  },
  z.object({
    cards: z.array(FlashcardGenerationCardSchema).min(1).max(50),
  }),
);

export type FlashcardGeneration = z.infer<typeof FlashcardGenerationSchema>;
export type FlashcardGenerationCard = z.infer<typeof FlashcardGenerationCardSchema>;

// ----------------------------------------------------------------------------
// Quiz generation
// ----------------------------------------------------------------------------

export const QuizOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

const QUESTION_TYPE_ALIASES: Record<string, (typeof QUESTION_TYPES)[number]> = {
  MULTIPLE_ANSWER: "MULTIPLE_CHOICE",
  MULTIPLE_SELECT: "MULTIPLE_CHOICE",
  MULTI_SELECT: "MULTIPLE_CHOICE",
  MULTI: "MULTIPLE_CHOICE",
  FILL_IN_THE_BLANK: "SHORT_ANSWER",
  FILL_BLANK: "SHORT_ANSWER",
  FILL: "SHORT_ANSWER",
  ESSAY: "SHORT_ANSWER",
  OPEN_ENDED: "SHORT_ANSWER",
  TEXT: "SHORT_ANSWER",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  SINGLE_CHOICE: "SINGLE_CHOICE",
  TRUE_FALSE: "TRUE_FALSE",
  SHORT_ANSWER: "SHORT_ANSWER",
};

function normalizeOptions(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    if (typeof item === "string") {
      const trimmed = item.trim();
      const lower = trimmed.toLowerCase();
      const id =
        lower === "true" || lower === "false"
          ? lower
          : typeof item === "string" && item.trim().length <= 3 && /^[a-zA-Z0-9]+$/.test(item.trim())
            ? item.trim()
            : `opt_${i + 1}`;
      return { id, text: trimmed };
    }
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const text =
        (typeof obj.text === "string" && obj.text) ||
        (typeof obj.label === "string" && obj.label) ||
        (typeof obj.value === "string" && obj.value) ||
        (typeof obj.option === "string" && obj.option) ||
        "";
      const id =
        (typeof obj.id === "string" && obj.id) ||
        (typeof obj.key === "string" && obj.key) ||
        `opt_${i + 1}`;
      return { id, text };
    }
    return { id: `opt_${i + 1}`, text: String(item ?? "") };
  });
}

function normalizeQuestion(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const q = { ...(raw as Record<string, unknown>) };

  if (typeof q.questionType === "string") {
    const upper = q.questionType.toUpperCase().replace(/[\s-]+/g, "_");
    q.questionType = QUESTION_TYPE_ALIASES[upper] ?? q.questionType;
  }

  if (typeof q.prompt !== "string" || !q.prompt.trim()) {
    const fallback =
      (typeof q.question === "string" && q.question) ||
      (typeof q.text === "string" && q.text) ||
      (typeof q.stem === "string" && q.stem) ||
      "";
    if (fallback) q.prompt = fallback;
  }

  if (!Array.isArray(q.correctOptionIds)) {
    const alt =
      q.correctOptionIds ??
      q.correctAnswers ??
      q.correctAnswer ??
      q.correct ??
      q.answers ??
      q.answer;
    if (Array.isArray(alt)) q.correctOptionIds = alt;
    else if (typeof alt === "string") q.correctOptionIds = [alt];
    else q.correctOptionIds = [];
  }

  if (!Array.isArray(q.options) && Array.isArray(q.choices)) {
    q.options = q.choices;
  }

  if (typeof q.explanation !== "string" || !q.explanation.trim()) {
    const alt =
      (typeof q.reason === "string" && q.reason) ||
      (typeof q.rationale === "string" && q.rationale) ||
      (typeof q.why === "string" && q.why) ||
      (typeof q.justification === "string" && q.justification) ||
      "";
    if (alt) q.explanation = alt;
  }

  for (const key of ["prompt", "explanation"] as const) {
    if (q[key] === null) q[key] = "";
  }

  if (!Array.isArray(q.tags)) {
    q.tags = [];
  }

  if (q.questionType === "SHORT_ANSWER") {
    delete q.options;
  } else {
    q.options = normalizeOptions(q.options);

    const correctIds: unknown[] = Array.isArray(q.correctOptionIds) ? q.correctOptionIds : [];
    const optIdByText = new Map<string, string>();
    for (const o of q.options as Array<{ id: string; text: string }>) {
      optIdByText.set(o.text.trim().toLowerCase(), o.id);
    }
    const seen = new Set<string>();
    q.correctOptionIds = correctIds
      .map((c) => {
        if (typeof c !== "string") return null;
        const trimmed = c.trim();
        if (!trimmed) return null;
        const byText = optIdByText.get(trimmed.toLowerCase());
        if (byText) return byText;
        if (
          Array.isArray(q.options) &&
          (q.options as unknown[]).some((o) => (o as { id: string }).id === trimmed)
        ) {
          return trimmed;
        }
        return trimmed;
      })
      .filter((v): v is string => {
        if (typeof v !== "string") return false;
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      });
  }

  return q;
}

const RawQuizQuestionSchema = z
  .object({
    questionType: z.enum(QUESTION_TYPES).default("SINGLE_CHOICE"),
    prompt: z.string().min(1).optional(),
    options: z.array(QuizOptionSchema).min(2).max(8).optional(),
    correctOptionIds: z.array(z.string().min(1)).optional(),
    explanation: z.string().optional(),
    difficulty: z.enum(QUIZ_DIFFICULTIES).default("INTERMEDIATE"),
    tags: z.array(z.string()).default([]),
    source: z.string().optional(),
  })
  .transform((q) => ({
    ...q,
    options: q.options ?? [],
    correctOptionIds: q.correctOptionIds ?? [],
    explanation: q.explanation ?? "",
  }))
  .superRefine((q, ctx) => {
    if (!q.prompt || q.prompt.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompt is required",
        path: ["prompt"],
      });
      return;
    }
    if (q.questionType !== "SHORT_ANSWER") {
      if (!q.options || q.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${q.questionType} must have at least 2 options`,
          path: ["options"],
        });
        return;
      }
    }
    const ids = new Set((q.options ?? []).map((o) => o.id));
    for (const id of q.correctOptionIds) {
      if (!ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `correctOptionIds references unknown option "${id}"`,
        });
      }
    }
    if (q.questionType === "SINGLE_CHOICE" && q.correctOptionIds.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SINGLE_CHOICE must have exactly one correctOptionId",
      });
    }
    if (q.questionType === "MULTIPLE_CHOICE" && q.correctOptionIds.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MULTIPLE_CHOICE must have at least one correctOptionId",
      });
    }
    if (q.questionType === "TRUE_FALSE") {
      const ok =
        q.options.length === 2 &&
        q.correctOptionIds.length === 1 &&
        ["true", "false"].includes(q.correctOptionIds[0]!.toLowerCase());
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "TRUE_FALSE must have two options with one of {true,false} as correct",
        });
      }
    }
  });

export const QuizQuestionGenerationSchema = z.preprocess(
  normalizeQuestion,
  RawQuizQuestionSchema,
);

export const QuizGenerationSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const obj = { ...(raw as Record<string, unknown>) };
    if (!Array.isArray(obj.questions)) {
      const alt =
        (Array.isArray(obj.items) && obj.items) ||
        (Array.isArray(obj.quizQuestions) && obj.quizQuestions) ||
        (Array.isArray(obj.data) && obj.data) ||
        null;
      if (alt) obj.questions = alt;
    }
    return obj;
  },
  z.object({
    questions: z.array(QuizQuestionGenerationSchema).min(1).max(50),
  }),
);

export type QuizGeneration = z.infer<typeof QuizGenerationSchema>;
export type QuizQuestionGeneration = z.infer<typeof QuizQuestionGenerationSchema>;

// ----------------------------------------------------------------------------
// Knowledge gap analysis
// ----------------------------------------------------------------------------

export const KnowledgeGapItemSchema = z.object({
  topic: z.string().min(1),
  status: z.enum(["STRONG", "DEVELOPING", "WEAK", "MISSING"]),
  evidence: z.string().optional(),
});

export const KnowledgeGapSchema = z.object({
  strong: z.array(KnowledgeGapItemSchema).default([]),
  developing: z.array(KnowledgeGapItemSchema).default([]),
  weak: z.array(KnowledgeGapItemSchema).default([]),
  missing: z.array(KnowledgeGapItemSchema).default([]),
  suggestedActions: z.array(z.string()).default([]),
});

export type KnowledgeGap = z.infer<typeof KnowledgeGapSchema>;

// ----------------------------------------------------------------------------
// Study plan
// ----------------------------------------------------------------------------

export const StudyPlanBlockSchema = z.object({
  type: z.enum([
    "LEARN",
    "DEEP_DIVE",
    "LAB",
    "FAILURE_DRILL",
    "INTERVIEW",
    "REVIEW",
    "SYSTEM_DESIGN",
    "DEBUG_DRILL",
  ]),
  title: z.string().min(1),
  objective: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(240),
  deliverable: z.string().optional(),
});

export const StudyPlanSchema = z.object({
  blocks: z.array(StudyPlanBlockSchema).min(1).max(20),
});

export type StudyPlan = z.infer<typeof StudyPlanSchema>;

// ----------------------------------------------------------------------------
// Roadmap import
// ----------------------------------------------------------------------------

export const RoadmapImportTaskSchema = z.object({
  code: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  relatedProject: z.string().optional(),
  relatedCvClaim: z.string().optional(),
  whyThisMatters: z.string().optional(),
  prerequisites: z.array(z.string()).default([]),
  concepts: z.array(z.string()).default([]),
  deepDiveSubtopics: z.array(z.string()).default([]),
  internalsToUnderstand: z.array(z.string()).default([]),
  failureScenarios: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        body: z.string(),
      }),
    )
    .default([]),
  productionQuestions: z.array(z.string()).default([]),
  interviewQuestions: z.array(z.string()).default([]),
  handsOnLab: z.string().optional(),
  expectedOutput: z.string().optional(),
  definitionOfDone: z.string().optional(),
  status: z.string().default("BACKLOG"),
  priority: z.enum(["P0", "P1", "P2", "P3"]).default("P2"),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED", "SENIOR"]).default("INTERMEDIATE"),
  estimatedMinutes: z.number().int().min(5).default(45),
  dependencies: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export const RoadmapImportModuleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  tasks: z.array(RoadmapImportTaskSchema).default([]),
});

export const RoadmapImportTrackSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  color: z.string().optional(),
  modules: z.array(RoadmapImportModuleSchema).default([]),
});

export const RoadmapImportSchema = z.object({
  schemaVersion: z.number().int().default(1),
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  tracks: z.array(RoadmapImportTrackSchema).default([]),
});

export type RoadmapImport = z.infer<typeof RoadmapImportSchema>;
export type RoadmapImportTrack = z.infer<typeof RoadmapImportTrackSchema>;
export type RoadmapImportModule = z.infer<typeof RoadmapImportModuleSchema>;
export type RoadmapImportTask = z.infer<typeof RoadmapImportTaskSchema>;

// ----------------------------------------------------------------------------
// Schedule import
// ----------------------------------------------------------------------------

export const ScheduleImportBlockSchema = z.object({
  taskCode: z.string().optional(),
  taskId: z.string().optional(),
  type: z.enum([
    "LEARN",
    "DEEP_DIVE",
    "LAB",
    "FAILURE_DRILL",
    "INTERVIEW",
    "REVIEW",
    "SYSTEM_DESIGN",
    "DEBUG_DRILL",
    "RECALL",
  ]),
  title: z.string().min(1),
  objective: z.string().optional(),
  startMinute: z.number().int().min(0).max(24 * 60),
  durationMinutes: z.number().int().min(5).max(240),
  deliverable: z.string().optional(),
});

export const ScheduleImportSchema = z.object({
  schemaVersion: z.number().int().default(1),
  date: z.string().min(1),
  objective: z.string().optional(),
  blocks: z.array(ScheduleImportBlockSchema).min(1),
});

export type ScheduleImport = z.infer<typeof ScheduleImportSchema>;