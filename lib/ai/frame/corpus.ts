/**
 * Frame knowledge corpus — assembles the retrievable documents a
 * frame is ALLOWED to search.
 *
 * Two rules decide what is in scope:
 *
 *  1. **The bound task is always in scope.** A frame opened from a
 *     task-aware screen (Start Task, task Notes) stores that task
 *     on the frame row. That one task becomes a single retrievable
 *     document even when `knowledgeMode` is `NONE` — it is what the
 *     frame was opened for. It competes on score like every other
 *     document, so `grounded` telemetry stays honest.
 *
 *  2. **Everything else needs an explicit opt-in.** The
 *     `knowledgeMode` gates the whole-user documents — task index,
 *     roadmap, notes. The default (`NONE`) yields an empty corpus
 *     apart from the bound task, so a frame with no bound task
 *     answers from its own history only.
 *
 * The bound task comes from the FRAME ROW, never from the request
 * body. `buildTaskContext` is the one context builder a frame may
 * import; `assembleGlobalContext` and friends are still forbidden —
 * see tests/frame-isolation.test.ts.
 *
 * The document RENDERING lives in `./doc-render.ts`, which is pure and
 * testable without a database. This module only decides WHICH
 * documents are in scope and fetches the rows for them.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks, roadmaps, taskNotes, aiChatFrameSnippets } from "@/lib/db/schema";
import { listTaskContentIndex } from "@/lib/db/queries/tasks";
import { getRoadmapTree } from "@/lib/db/queries/roadmap";
import { buildTaskContext } from "@/lib/ai/context";
import { clamp } from "@/lib/ai/text-budget";
import type { FrameKnowledgeMode } from "@/lib/db/schema/aiFrames";
import { includesNotes, includesRoadmap, includesTaskIndex } from "./scope";
import { escapeLike, type KnowledgeDoc } from "./retrieval";
import {
  renderTaskDoc,
  renderRoadmapModuleDoc,
  renderRoadmapOverviewDoc,
  MAX_TASK_DOC_CHARS,
  MAX_ROADMAP_DOC_CHARS,
} from "./doc-render";

/** Cap on notes pulled into the corpus — keeps one turn's retrieval bounded. */
const MAX_NOTE_DOCS = 300;
/** Cap on characters per note document. Notes can be very long. */
const MAX_NOTE_CHARS = 4_000;
/** Cap on tasks pulled into the corpus. */
const MAX_TASK_DOCS = 400;
/** Cap on roadmaps considered. */
const MAX_ROADMAPS = 5;

/**
 * The task index WITH study content, as retrievable documents.
 *
 * The original implementation projected only code / title / status /
 * priority. That was enough for BM25 to fire — a code token matches
 * and scores high, so `grounded` was true — while handing the model
 * no text to ground an answer on. That is what made the frame report
 * "no information" even with a task in scope.
 */
async function buildTaskIndexDocs(userId: string): Promise<KnowledgeDoc[]> {
  const rows = await listTaskContentIndex(userId, MAX_TASK_DOCS);
  return rows.map((r, i) => ({
    id: `task-index:${r.code ?? `row-${i}`}`,
    label: `TASK INDEX · ${r.code ?? "—"}`,
    kind: "TASK" as const,
    code: r.code,
    title: r.title,
    body: clamp(renderTaskDoc(r), MAX_TASK_DOC_CHARS),
  }));
}

/**
 * The user's roadmap tree as ONE overview document plus one document
 * per module.
 *
 * Module granularity is deliberate: a whole roadmap as a single ~40KB
 * document makes BM25 term frequency meaningless, and the original
 * doc-per-roadmap builder emitted bare titles while dropping the track
 * and module summaries — the only prose describing a phase.
 *
 * The overview is a SEPARATE document rather than a header repeated on
 * every module: repeating the roadmap description across all 23 module
 * docs gave shared terms ("payment", "roadmap") an IDF of ~0, so a
 * correct match scored ~0.08 and fell under the grounding floor.
 * Keeping roadmap-wide prose in one place is what keeps those terms
 * discriminative.
 */
async function buildRoadmapDocs(userId: string): Promise<KnowledgeDoc[]> {
  const roadmapRows = await db
    .select({ id: roadmaps.id, title: roadmaps.title })
    .from(roadmaps)
    .where(eq(roadmaps.userId, userId))
    .limit(MAX_ROADMAPS);

  const docs: KnowledgeDoc[] = [];
  for (const rm of roadmapRows) {
    const tree = await getRoadmapTree(userId, rm.id);
    if (!tree) continue;

    docs.push({
      id: `roadmap:${rm.id}`,
      label: `ROADMAP · ${rm.title}`,
      kind: "ROADMAP" as const,
      title: rm.title,
      body: clamp(
        renderRoadmapOverviewDoc({
          roadmapTitle: tree.roadmap.title,
          roadmapDescription: tree.roadmap.description,
          tracks: tree.tracks.map((t) => ({ title: t.title, summary: t.summary })),
        }),
        MAX_ROADMAP_DOC_CHARS,
      ),
    });

    for (const tr of tree.tracks) {
      for (const m of tr.modules) {
        docs.push({
          id: `roadmap:${rm.id}:${m.id}`,
          label: `ROADMAP · ${tr.title} › ${m.title}`,
          kind: "ROADMAP" as const,
          title: `${tr.title} › ${m.title}`,
          body: clamp(
            renderRoadmapModuleDoc({
              trackTitle: tr.title,
              trackSummary: tr.summary,
              moduleTitle: m.title,
              moduleSummary: m.summary,
              tasks: m.tasks,
            }),
            MAX_ROADMAP_DOC_CHARS,
          ),
        });
      }
    }
  }
  return docs;
}

/**
 * The user's notes as one document per note. Scoped by `userId`, NOT
 * by the task the frame was opened from — so opening a frame on task
 * A's note screen and asking "what did I write about B?" works, and
 * asking about A does not silently privilege A's note.
 *
 * A cheap SQL prefilter (`ILIKE` over the first query token) keeps
 * this from loading every note on every turn; the BM25 rerank in
 * `retrieval.ts` does the precise work in-process.
 */
async function buildNoteDocs(userId: string, query: string): Promise<KnowledgeDoc[]> {
  const terms = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .slice(0, 4);

  const base = and(
    eq(taskNotes.userId, userId),
    // Skip empty notes — they can never be useful and dilute BM25.
    sql`length(${taskNotes.content}) > 0`,
  );

  const projection = {
    id: taskNotes.id,
    taskId: taskNotes.taskId,
    content: taskNotes.content,
    code: tasks.code,
    title: tasks.title,
  } as const;

  // Prefilter uses BOUND parameters only — query text is never
  // interpolated into raw SQL. Terms are also restricted to
  // [a-z0-9] before escaping, so escapeLike is belt-and-braces.
  // With no usable term the query is unfiltered (cheap, bounded by
  // MAX_NOTE_DOCS) and BM25 does the ranking.
  const where =
    terms.length > 0
      ? and(base, sql`${taskNotes.content} ILIKE ${"%".concat(escapeLike(terms[0]!), "%")}`)
      : base;

  const rows = await db
    .select(projection)
    .from(taskNotes)
    .leftJoin(tasks, eq(tasks.id, taskNotes.taskId))
    .where(where)
    .limit(MAX_NOTE_DOCS);

  return rows.map((r) => ({
    id: `note:${r.id}`,
    label: `NOTE · ${r.code ?? r.title ?? "untitled"}`,
    kind: "NOTE" as const,
    code: r.code,
    title: r.title ?? undefined,
    body: clamp(r.content, MAX_NOTE_CHARS),
  }));
}

/**
 * The ONE task this frame was opened for, as a single retrievable
 * document.
 *
 * Read from the frame row, never from the request body — the chat
 * route rejects a body-supplied `taskId` with `.strict()`. Included
 * even at `knowledgeMode: NONE` because it is what the frame exists
 * to discuss; the mode gates everything the user did NOT pick.
 *
 * `buildTaskContext` is reused rather than re-queried: it already
 * assembles the task row, its note, the track/module breadcrumb and
 * the prerequisite edges into one clamped markdown block.
 *
 * A failure here degrades to no document — the mode-gated slices
 * still work, and the frame just loses its bound task.
 */
async function buildBoundTaskDocs(userId: string, taskId: string): Promise<KnowledgeDoc[]> {
  const { taskRow, contextMd } = await buildTaskContext({ userId, taskId });
  if (!taskRow) return [];
  return [
    {
      id: `bound-task:${taskId}`,
      label: `CURRENT TASK · ${taskRow.code ?? taskRow.title}`,
      kind: "TASK" as const,
      code: taskRow.code,
      title: taskRow.title,
      body: clamp(contextMd, MAX_TASK_DOC_CHARS),
    },
  ];
}

/** Snippets the user pinned to THIS frame. Never any other frame's. */
async function buildSnippetDocs(userId: string, frameId: string): Promise<KnowledgeDoc[]> {
  const rows = await db
    .select({
      id: aiChatFrameSnippets.id,
      title: aiChatFrameSnippets.title,
      body: aiChatFrameSnippets.body,
    })
    .from(aiChatFrameSnippets)
    .where(and(eq(aiChatFrameSnippets.userId, userId), eq(aiChatFrameSnippets.frameId, frameId)))
    .limit(50);

  return rows.map((r) => ({
    id: `snippet:${r.id}`,
    label: `PINNED · ${r.title}`,
    kind: "SNIPPET" as const,
    title: r.title,
    body: r.body,
  }));
}

/**
 * Build the full corpus a frame may retrieve from.
 *
 * `taskId` is the frame's OWN bound task, read by the caller off the
 * frame row. It is in scope at every `knowledgeMode` including `NONE`
 * — that is the one document the frame exists to discuss. Everything
 * else is decided entirely by `knowledgeMode`.
 *
 * `query` is used only as a cheap SQL prefilter for notes — it never
 * selects WHICH slice of knowledge is in scope.
 *
 * Each slice is individually guarded: a failure in one (a dead
 * connection, a query the cache rejects) must not take down the whole
 * turn. It degrades to "this slice contributes nothing", which the UI
 * surfaces honestly as `candidates: 0` in the grounding strip.
 */
export async function buildFrameCorpus(args: {
  userId: string;
  frameId: string;
  taskId?: string | null;
  knowledgeMode: FrameKnowledgeMode;
  query: string;
}): Promise<KnowledgeDoc[]> {
  const { userId, frameId, taskId, knowledgeMode } = args;

  const parts: Array<Promise<KnowledgeDoc[]>> = [];

  // The bound task outranks the mode gate: it is in scope by
  // construction, not by user opt-in, so it must not be skipped when
  // `knowledgeMode === "NONE"`.
  if (taskId) {
    parts.push(buildBoundTaskDocs(userId, taskId).catch(() => []));
  }

  if (knowledgeMode !== "NONE") {
    if (includesTaskIndex(knowledgeMode)) {
      parts.push(
        buildTaskIndexDocs(userId).catch(() => []),
      );
    }
    if (includesRoadmap(knowledgeMode)) {
      parts.push(
        buildRoadmapDocs(userId).catch(() => []),
      );
    }
    if (includesNotes(knowledgeMode)) {
      parts.push(
        buildNoteDocs(userId, args.query).catch(() => []),
      );
    }
  }
  // Pinned snippets always join: they are the frame's own data.
  parts.push(
    buildSnippetDocs(userId, frameId).catch(() => []),
  );

  const settled = await Promise.all(parts);
  return settled.flat();
}

export { buildCodeLookup } from "./doc-render";