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

export const FlashcardGenerationCardSchema = z.object({
  cardType: z.enum(["BASIC", "QA", "SCENARIO", "CLOZE"]).default("BASIC"),
  front: FlashcardFrontSchema,
  back: FlashcardBackSchema,
  explanation: z.string().optional(),
  difficulty: z.enum(FLASHCARD_DIFFICULTIES).default("MEDIUM"),
  tags: z.array(z.string()).default([]),
});

export const FlashcardGenerationSchema = z.object({
  cards: z.array(FlashcardGenerationCardSchema).min(1).max(50),
});

export type FlashcardGeneration = z.infer<typeof FlashcardGenerationSchema>;
export type FlashcardGenerationCard = z.infer<typeof FlashcardGenerationCardSchema>;

// ----------------------------------------------------------------------------
// Quiz generation
// ----------------------------------------------------------------------------

export const QuizOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const QuizQuestionGenerationSchema = z
  .object({
    questionType: z.enum(QUESTION_TYPES).default("SINGLE_CHOICE"),
    prompt: z.string().min(1),
    options: z.array(QuizOptionSchema).min(2).max(8),
    correctOptionIds: z.array(z.string().min(1)),
    explanation: z.string().min(1),
    difficulty: z.enum(QUIZ_DIFFICULTIES).default("INTERMEDIATE"),
    tags: z.array(z.string()).default([]),
    source: z.string().optional(),
  })
  .superRefine((q, ctx) => {
    const ids = new Set(q.options.map((o) => o.id));
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

export const QuizGenerationSchema = z.object({
  questions: z.array(QuizQuestionGenerationSchema).min(1).max(50),
});

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