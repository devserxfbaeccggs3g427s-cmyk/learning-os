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
import { getTodayView } from "@/lib/db/queries/schedule";
import { listTaskCodeIndex } from "@/lib/db/queries/tasks";

export interface ContextSection {
  label:
    | "TASK NOTE"
    | "ROADMAP CONTEXT"
    | "ROADMAP TREE"
    | "PREREQUISITES"
    | "DEPENDENTS"
    | "TASK INDEX"
    | "USER SCHEDULE"
    | "AI GENERAL KNOWLEDGE"
    | "USER"
    | "INSTRUCTIONS";
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
  /** Minimal task projection (legacy path). Kept for callers that already
   *  have a Pick'd task. Prefer `taskFull` for tutor chat so the AI gets
   *  concepts / prerequisites / interview questions / etc. */
  task?: Pick<TaskRow, "code" | "title" | "description" | "status" | "priority" | "difficulty" | "estimatedMinutes"> | null;
  /** Full task row. When supplied, the ROADMAP CONTEXT section includes the
   *  rich worksheet fields (whyThisMatters, concepts, prerequisites, etc.). */
  taskFull?: TaskRow | null;
  /** Breadcrumb + parent module/track info. */
  breadcrumb?: { trackTitle?: string; moduleTitle?: string } | null;
  /** Compact roadmap tree (tracks → modules → tasks) — emitted as
   *  ROADMAP TREE section so the tutor can answer "what's around this task?"
   *  without the user re-pasting. */
  roadmapTree?: import("@/lib/db/queries/roadmap").RoadmapTree | null;
  /** Tasks this task depends on (prerequisites). */
  prereqTasks?: Array<{ code?: string | null; title: string; status: string }>;
  /** Tasks that depend on this task (downstream). */
  dependentTasks?: Array<{ code?: string | null; title: string; status: string }>;
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
  const task = args.taskFull ?? args.task;
  if (opt.includeTask && task) {
    sections.push({
      label: "ROADMAP CONTEXT",
      content: clamp(renderTaskMetadata(task, args.breadcrumb), opt.budgetChars),
    });
  }
  if (opt.includeRoadmap && args.roadmapTree) {
    const focusId = (args.taskFull as { id?: string } | null | undefined)?.id ?? null;
    sections.push({
      label: "ROADMAP TREE",
      content: clamp(renderRoadmapTree(args.roadmapTree, focusId), opt.budgetChars),
    });
  }
  if (args.prereqTasks && args.prereqTasks.length > 0) {
    sections.push({
      label: "PREREQUISITES",
      content: clamp(
        args.prereqTasks.map((t) => `- [${t.status}] ${t.code ?? "?"} — ${t.title}`).join("\n"),
        opt.budgetChars,
      ),
    });
  }
  if (args.dependentTasks && args.dependentTasks.length > 0) {
    sections.push({
      label: "DEPENDENTS",
      content: clamp(
        args.dependentTasks.map((t) => `- [${t.status}] ${t.code ?? "?"} — ${t.title}`).join("\n"),
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

/**
 * Render the full task worksheet into a compact Markdown block. Includes
 * breadcrumb (track › module › task), rich metadata, and learning artifacts.
 */
function renderTaskMetadata(
  task: Partial<TaskRow> & Pick<TaskRow, "code" | "title" | "description" | "status" | "priority" | "difficulty" | "estimatedMinutes">,
  breadcrumb?: { trackTitle?: string; moduleTitle?: string } | null,
): string {
  const t = task as TaskRow;
  const parts: string[] = [];
  if (breadcrumb?.trackTitle && breadcrumb?.moduleTitle) {
    parts.push(`Path: ${breadcrumb.trackTitle} › ${breadcrumb.moduleTitle} › ${task.title}`);
  } else if (task.code) {
    parts.push(`Code: ${task.code}`);
  }
  parts.push(`Title: ${task.title}`);
  if (task.description) parts.push("", task.description);
  parts.push(
    "",
    `Status: ${task.status}  Priority: ${task.priority}  Difficulty: ${task.difficulty}`,
    `Estimated: ${task.estimatedMinutes} min`,
  );
  if (t.whyThisMatters) parts.push("", "## Why this matters", t.whyThisMatters);
  if (t.relatedProject) parts.push("", `Related project: ${t.relatedProject}`);
  if (t.relatedCvClaim) parts.push(`Related CV claim: ${t.relatedCvClaim}`);
  if (t.prerequisites?.length > 0) parts.push("", "## Prerequisites (text)", ...t.prerequisites.map((p) => `- ${p}`));
  if (t.concepts?.length > 0) parts.push("", "## Concepts", ...t.concepts.map((c) => `- ${c}`));
  if (t.deepDiveSubtopics?.length > 0) parts.push("", "## Deep dive subtopics", ...t.deepDiveSubtopics.map((s) => `- ${s}`));
  if (t.internalsToUnderstand?.length > 0) parts.push("", "## Internals to understand", ...t.internalsToUnderstand.map((s) => `- ${s}`));
  if (Array.isArray(t.failureScenarios) && t.failureScenarios.length > 0) {
    parts.push("", "## Failure scenarios");
    for (const fs of t.failureScenarios as Array<{ title?: string; body?: string }>) {
      parts.push(`- **${fs.title ?? "?"}** — ${fs.body ?? ""}`);
    }
  }
  if (t.productionQuestions?.length > 0) parts.push("", "## Production questions", ...t.productionQuestions.map((q) => `- ${q}`));
  if (t.interviewQuestions?.length > 0) parts.push("", "## Interview questions", ...t.interviewQuestions.map((q) => `- ${q}`));
  if (t.handsOnLab) parts.push("", "## Hands-on lab", t.handsOnLab);
  if (t.expectedOutput) parts.push("", "## Expected output", t.expectedOutput);
  if (t.definitionOfDone) parts.push("", "## Definition of done", t.definitionOfDone);
  return parts.join("\n");
}

/**
 * Render the full roadmap tree (tracks › modules › tasks) into compact
 * Markdown. Marks the currently-focused task with a `▶` so the model can
 * orient the user in the roadmap without extra prompting.
 */
function renderRoadmapTree(
  tree: import("@/lib/db/queries/roadmap").RoadmapTree,
  focusTaskId: string | null,
): string {
  const lines: string[] = [];
  lines.push(`# ${tree.roadmap.title}`);
  if (tree.roadmap.description) lines.push(tree.roadmap.description);
  lines.push(`Progress: ${tree.totals.doneCount}/${tree.totals.taskCount} tasks done`, "");
  for (const tr of tree.tracks) {
    lines.push(`## ${tr.title}`);
    if (tr.summary) lines.push(tr.summary);
    for (const m of tr.modules) {
      lines.push(`### ${m.title}`);
      if (m.summary) lines.push(m.summary);
      for (const t of m.tasks) {
        const marker = t.id === focusTaskId ? "▶ " : "  ";
        lines.push(`${marker}- [${t.status}] ${t.code ?? "—"} — ${t.title}`);
      }
    }
  }
  return lines.join("\n");
}

/**
 * Global context for chat sessions that are NOT scoped to a single task
 * (e.g. the global sidebar chat). The AI needs to know:
 *  - what the user has planned for today (so "what should I do today?" works)
 *  - what every task code in the user's roadmap refers to (so questions
 *    like "what is c8?" or "c12 vs C12?" resolve without the user re-pasting)
 *  - the full roadmap tree (tracks › modules › tasks) for orientation
 *
 * Uses the cached roadmap/schedule queries so this is cheap per request.
 */
export async function assembleGlobalContext(args: {
  userId: string;
  studyDate: string;
  options?: Partial<ContextOptions>;
}): Promise<ContextSection[]> {
  const opt: ContextOptions = { ...defaultContextOptions, ...(args.options ?? {}) };
  const sections: ContextSection[] = [];

  if (opt.includeRelatedTasks) {
    try {
      const idx = await listTaskCodeIndex(args.userId);
      if (idx.length > 0) {
        const lines = idx.map(
          (t) =>
            `- ${t.code ?? "—"} | ${t.status} | ${t.priority} | ${t.trackTitle} › ${t.moduleTitle} › ${t.title}`,
        );
        sections.push({
          label: "TASK INDEX",
          content: clamp(lines.join("\n"), opt.budgetChars),
        });
      }
    } catch {
      // Non-fatal — the chat still works without the index.
    }
  }

  if (opt.includeRoadmap) {
    try {
      const { listRoadmaps, getRoadmapTree } = await import("@/lib/db/queries/roadmap");
      const rms = await listRoadmaps(args.userId);
      const first = rms[0];
      if (first) {
        const tree = await getRoadmapTree(args.userId, first.id);
        if (tree) {
          sections.push({
            label: "ROADMAP TREE",
            content: clamp(renderRoadmapTree(tree, null), opt.budgetChars),
          });
        }
      }
    } catch {
      // Non-fatal.
    }
  }

  try {
    const today = await getTodayView(args.userId, args.studyDate);
    if (today && today.blocks.length > 0) {
      const lines = today.blocks.map((b) => {
        const start = `${Math.floor(b.startMinute / 60)
          .toString()
          .padStart(2, "0")}:${(b.startMinute % 60).toString().padStart(2, "0")}`;
        const endMin = b.startMinute + b.durationMinutes;
        const end = `${Math.floor(endMin / 60)
          .toString()
          .padStart(2, "0")}:${(endMin % 60).toString().padStart(2, "0")}`;
        const ref = b.taskCode ? `${b.taskCode} — ${b.taskTitle ?? ""}` : b.title;
        return `- [${b.status}] ${start}–${end} (${b.durationMinutes}m) ${b.type} — ${ref}`;
      });
      sections.push({
        label: "USER SCHEDULE",
        content: clamp(
          `Date: ${today.schedule.date}${today.schedule.objective ? `\nObjective: ${today.schedule.objective}` : ""}\n\n${lines.join("\n")}`,
          opt.budgetChars,
        ),
      });
    }
  } catch {
    // Non-fatal.
  }

  return sections;
}