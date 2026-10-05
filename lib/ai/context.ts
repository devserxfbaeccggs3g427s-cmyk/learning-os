/**
 * AI Context Builder.
 *
 * Context is assembled from many sources, each producing a labeled section.
 * The output is a structured Markdown block the model can read, with each
 * section clearly tagged so the model can keep TASK NOTE vs AI GENERAL
 * KNOWLEDGE separate.
 */
import { eq, and, inArray, asc } from "drizzle-orm";
import type { TaskRow } from "@/lib/db/schema/tasks";
import type { TaskNoteRow } from "@/lib/db/schema/notes";
import { db } from "@/lib/db/client";
import { tasks, taskNotes, taskDependencies, modules, tracks, schedules, studyBlocks, blockNotes } from "@/lib/db/schema";
import { getTodayView } from "@/lib/db/queries/schedule";
import { listTaskCodeIndex } from "@/lib/db/queries/tasks";
import { listRoadmaps, getRoadmapTree } from "@/lib/db/queries/roadmap";
import { clamp } from "@/lib/ai/text-budget";

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

/**
 * Text clamp lives in `lib/ai/text-budget` (a leaf module) so the
 * AI chat frame feature can reuse it without importing this file's
 * task/roadmap query builders. Re-exported here so every existing
 * call site keeps working.
 */
export { clamp } from "@/lib/ai/text-budget";

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
  /**
   * Every block note written for this task, newest study date last.
   *
   * Block notes are the primary note store now — a task can be split into
   * six blocks in one day, and one note per task means the sixth session
   * overwrites the first five. Merging them into one TASK NOTE section
   * keeps the AI grounded in what the user actually wrote today.
   */
  blockNotes?: Array<{ date: string; type: string; title: string; startMinute: number; status: string; content: string }>;
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
  if (opt.includeNotes) {
    const noteMd = renderTaskNotes(args.note?.content ?? null, args.blockNotes ?? []);
    if (noteMd) {
      sections.push({
        label: "TASK NOTE",
        content: clamp(noteMd, opt.budgetChars),
      });
    }
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
 * Render the task's notes into one Markdown block.
 *
 * Block notes lead, each under its own `##` heading carrying the date, time,
 * type and title — so the model can tell "what I wrote during the 20:05
 * DEEP_DIVE" apart from "what I wrote during the 21:15 REVIEW" instead of
 * reading two anonymous walls of text. The legacy task-level note (written by
 * sessions started straight from the task page, or by the pre-block editor)
 * is appended last under its own heading rather than dropped.
 */
function renderTaskNotes(
  legacyContent: string | null,
  blockNoteList: NonNullable<AssembleContextArgs["blockNotes"]>,
): string {
  const parts: string[] = [];

  for (const b of blockNoteList) {
    const content = b.content?.trim();
    if (!content) continue; // a block that was started but never written in
    const hhmm = `${String(Math.floor(b.startMinute / 60)).padStart(2, "0")}:${String(b.startMinute % 60).padStart(2, "0")}`;
    parts.push(
      `## ${b.date} ${hhmm} ${b.type} — ${b.title}${b.status && b.status !== "PLANNED" ? ` [${b.status}]` : ""}`,
      "",
      content,
      "",
    );
  }

  const legacy = legacyContent?.trim();
  if (legacy) {
    if (parts.length > 0) parts.push("## Task-level note (earlier)", "");
    parts.push(legacy, "");
  }

  return parts.join("\n").trim();
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
 * Build a complete task-scoped context block (ROADMAP CONTEXT + ROADMAP
 * TREE + PREREQUISITES + DEPENDENTS + TASK NOTE) for a single task in one
 * parallelized pass. Used by tutor chat, interview, quiz generation, and
 * flashcard generation so all features see the same roadmap-aware picture.
 *
 * Returns both the raw task+note rows (so callers can branch on whether
 * notes are empty) and the rendered Markdown block (ready to prefix to the
 * user message or use as the source for generation prompts).
 */
export async function buildTaskContext(args: {
  userId: string;
  taskId: string;
  budgetChars?: number;
}): Promise<{
  taskRow: TaskRow | undefined;
  noteRow: Pick<TaskNoteRow, "content"> | undefined;
  /** All note content merged (block notes + legacy task note) —
   *  what callers want when they need "the notes" as one string. */
  noteSource: string;
  sections: ContextSection[];
  contextMd: string;
}> {
  const { userId, taskId } = args;
  const budgetChars = args.budgetChars ?? 8_000;

  // Parallel: task row + note row + breadcrumb + dependency edges + roadmaps.
  const [task, noteRow, blockNoteRows] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).then((r) => r[0]),
    db.select().from(taskNotes).where(eq(taskNotes.taskId, taskId)).limit(1).then((r) => r[0]),
    // Block notes via the task's blocks, ordered by when they ran.
    db
      .select({
        date: schedules.date,
        type: studyBlocks.type,
        title: studyBlocks.title,
        startMinute: studyBlocks.startMinute,
        status: studyBlocks.status,
        content: blockNotes.content,
      })
      .from(blockNotes)
      .innerJoin(studyBlocks, eq(studyBlocks.id, blockNotes.blockId))
      .innerJoin(schedules, eq(schedules.id, studyBlocks.scheduleId))
      .where(and(eq(studyBlocks.taskId, taskId), eq(blockNotes.userId, userId)))
      .orderBy(asc(schedules.date), asc(studyBlocks.startMinute)),
  ]);

  let breadcrumb: { trackTitle?: string; moduleTitle?: string } | undefined;
  let roadmapTree: import("@/lib/db/queries/roadmap").RoadmapTree | null = null;
  let prereqTasks: Array<{ code: string | null; title: string; status: string }> = [];
  let dependentTasks: Array<{ code: string | null; title: string; status: string }> = [];

  if (task) {
    const [depsFrom, depsTo, rms] = await Promise.all([
      db
        .select({ depId: taskDependencies.dependsOnTaskId, kind: taskDependencies.kind })
        .from(taskDependencies)
        .where(eq(taskDependencies.taskId, task.id)),
      db
        .select({ taskId: taskDependencies.taskId, kind: taskDependencies.kind })
        .from(taskDependencies)
        .where(eq(taskDependencies.dependsOnTaskId, task.id)),
      listRoadmaps(userId),
    ]);

    // Breadcrumb: track title (joined with module) + module title (second tiny query).
    const trackJoin = await db
      .select({ title: tracks.title })
      .from(modules)
      .innerJoin(tracks, eq(tracks.id, modules.trackId))
      .where(eq(modules.id, task.moduleId))
      .limit(1)
      .then((r) => r[0]);
    const modTitle = await db
      .select({ title: modules.title })
      .from(modules)
      .where(eq(modules.id, task.moduleId))
      .limit(1)
      .then((r) => r[0]?.title);
    breadcrumb = { trackTitle: trackJoin?.title, moduleTitle: modTitle };

    const depIds = Array.from(new Set([...depsFrom.map((d) => d.depId), ...depsTo.map((d) => d.taskId)]));
    if (depIds.length > 0) {
      const depRows = await db
        .select({ id: tasks.id, code: tasks.code, title: tasks.title, status: tasks.status })
        .from(tasks)
        .where(inArray(tasks.id, depIds));
      const depMap = new Map(depRows.map((r) => [r.id, r]));
      prereqTasks = depsFrom
        .map((d) => depMap.get(d.depId))
        .filter((r): r is NonNullable<typeof r> => !!r);
      dependentTasks = depsTo
        .map((d) => depMap.get(d.taskId))
        .filter((r): r is NonNullable<typeof r> => !!r);
    }

    const first = rms[0];
    if (first) {
      roadmapTree = await getRoadmapTree(userId, first.id);
    }
  }

  const legacyNote = noteRow ? { content: noteRow.content } : null;
  const sections = assembleContext({
    taskFull: task ?? null,
    breadcrumb,
    roadmapTree,
    prereqTasks,
    dependentTasks,
    note: legacyNote,
    blockNotes: blockNoteRows,
    options: { budgetChars },
  });
  const contextMd = renderContext(sections);
  return {
    taskRow: task,
    noteRow: legacyNote ?? undefined,
    // Same merged text, without the section wrapper — generation routes use
    // this as the source when a task HAS notes, because it's cheaper than
    // feeding the model the whole roadmap context.
    noteSource: renderTaskNotes(legacyNote?.content ?? null, blockNoteRows),
    sections,
    contextMd,
  };
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

  // Fire the three independent sections in parallel. The roadmap tree is the
  // most expensive fetch and is often skipped for lightweight callers (e.g.
  // starter-prompt suggestions) via `options.includeRoadmap = false`.
  const tasks: Promise<void>[] = [];

  if (opt.includeRelatedTasks) {
    tasks.push(
      (async () => {
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
      })(),
    );
  }

  if (opt.includeRoadmap) {
    tasks.push(
      (async () => {
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
      })(),
    );
  }

  tasks.push(
    (async () => {
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
    })(),
  );

  await Promise.all(tasks);
  return sections;
}