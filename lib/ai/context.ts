/**
 * AI Context Builder.
 *
 * Context is assembled from many sources, each producing a labeled section.
 * The output is a structured Markdown block the model can read, with each
 * section clearly tagged so the model can keep TASK NOTE vs AI GENERAL
 * KNOWLEDGE separate.
 */
import type { TaskRow } from "@/lib/db/schema/tasks";
import type { TaskNoteRow } from "@/lib/db/schema/notes";

export interface ContextSection {
  label: "TASK NOTE" | "ROADMAP CONTEXT" | "AI GENERAL KNOWLEDGE" | "USER" | "INSTRUCTIONS";
  content: string;
}

export interface ContextOptions {
  includeTask: boolean;
  includeNotes: boolean;
  includeRoadmap: boolean;
  includeFlashcards: boolean;
  includeQuizHistory: boolean;
  includeRelatedTasks: boolean;
  /** Max characters per section (0 = no cap). */
  budgetChars: number;
}

export const defaultContextOptions: ContextOptions = {
  includeTask: true,
  includeNotes: true,
  includeRoadmap: true,
  includeFlashcards: false,
  includeQuizHistory: false,
  includeRelatedTasks: false,
  budgetChars: 12_000,
};

export function clamp(s: string, max: number): string {
  if (!max || s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[... truncated at ${max} characters ...]`;
}

/** Render context sections into a single source-aware Markdown block. */
export function renderContext(sections: ContextSection[]): string {
  return sections
    .map((s) => `:::section[${s.label}]\n${s.content.trim()}\n:::`)
    .join("\n\n");
}

export interface AssembleContextArgs {
  task?: Pick<TaskRow, "code" | "title" | "description" | "status" | "priority" | "difficulty" | "estimatedMinutes"> | null;
  note?: Pick<TaskNoteRow, "content"> | null;
  flashcards?: Array<{ front: string; back: string }>;
  quizHistory?: string;
  relatedTasks?: Array<{ code?: string; title: string; status: string }>;
  userInstructions?: string;
  options?: Partial<ContextOptions>;
}

export function assembleContext(args: AssembleContextArgs): ContextSection[] {
  const opt: ContextOptions = { ...defaultContextOptions, ...(args.options ?? {}) };
  const sections: ContextSection[] = [];
  if (opt.includeTask && args.task) {
    sections.push({
      label: "ROADMAP CONTEXT",
      content: clamp(
        [
          args.task.code ? `Code: ${args.task.code}` : null,
          `Title: ${args.task.title}`,
          args.task.description ?? null,
          `Status: ${args.task.status}  Priority: ${args.task.priority}  Difficulty: ${args.task.difficulty}`,
          `Estimated: ${args.task.estimatedMinutes} min`,
        ]
          .filter(Boolean)
          .join("\n"),
        opt.budgetChars,
      ),
    });
  }
  if (opt.includeNotes && args.note?.content) {
    sections.push({
      label: "TASK NOTE",
      content: clamp(args.note.content, opt.budgetChars),
    });
  }
  if (opt.includeFlashcards && args.flashcards?.length) {
    sections.push({
      label: "ROADMAP CONTEXT",
      content: clamp(
        args.flashcards
          .map((c, i) => `${i + 1}. Q: ${c.front}\n   A: ${c.back}`)
          .join("\n"),
        opt.budgetChars,
      ),
    });
  }
  if (opt.includeQuizHistory && args.quizHistory) {
    sections.push({ label: "ROADMAP CONTEXT", content: clamp(args.quizHistory, opt.budgetChars) });
  }
  if (opt.includeRelatedTasks && args.relatedTasks?.length) {
    sections.push({
      label: "ROADMAP CONTEXT",
      content: clamp(
        args.relatedTasks.map((t) => `- [${t.status}] ${t.code ?? "?"} — ${t.title}`).join("\n"),
        opt.budgetChars,
      ),
    });
  }
  if (args.userInstructions) {
    sections.push({ label: "USER", content: args.userInstructions });
  }
  return sections;
}