/**
 * Pure rendering of corpus documents.
 *
 * Split from `corpus.ts` on purpose: `corpus.ts` touches the database,
 * these functions do not. Keeping them here means the text the model
 * actually receives can be unit-tested without a live connection —
 * which is how the "metadata-only corpus" regression got caught.
 *
 * Everything here is a pure string transform. No DB, no network, no
 * knowledge of tasks, roadmaps, routes, or screens beyond the shape of
 * the rows handed in.
 */
import type { TaskContentRow } from "@/lib/db/queries/tasks";
import type { KnowledgeDoc } from "./retrieval";

/**
 * Cap on characters per task document. A task carries a description, a
 * hands-on lab and a definition of done, which easily exceeds this — the
 * clamp keeps BM25's length normalisation meaningful instead of letting
 * one verbose doc dominate `avgdl`. Truncation is safe here because
 * ranking happens over the corpus; only the top hits reach the model,
 * and those are clamped again by `DEFAULT_RETRIEVAL_BUDGET_CHARS`.
 */
export const MAX_TASK_DOC_CHARS = 3_000;

/**
 * Cap on characters per roadmap-module document. One module's task list
 * plus its track/module summaries is the natural unit; a whole roadmap
 * as a single ~40KB doc would make term frequency useless.
 */
export const MAX_ROADMAP_DOC_CHARS = 6_000;

/**
 * Render a task's study content into a single searchable document.
 *
 * Every section is emitted only when it has content — an empty heading
 * would let BM25 score a match on a heading the document never
 * substantiates.
 */
export function renderTaskDoc(row: TaskContentRow): string {
  const sections: string[] = [
    `Code: ${row.code ?? "—"}`,
    `Title: ${row.title}`,
    [
      `Status: ${row.status}`,
      `Priority: ${row.priority}`,
      row.difficulty,
      `${row.estimatedMinutes}m`,
    ]
      .filter(Boolean)
      .join(" · "),
    `Track: ${row.trackTitle} › Module: ${row.moduleTitle}`,
  ];

  if (row.description) sections.push(`Description: ${row.description}`);
  if (row.whyThisMatters) sections.push(`Why this matters: ${row.whyThisMatters}`);
  if (row.concepts.length > 0) sections.push(`Concepts: ${row.concepts.join(", ")}`);
  if (row.deepDiveSubtopics.length > 0) {
    sections.push(
      "Deep-dive subtopics:\n" + row.deepDiveSubtopics.map((s) => `- ${s}`).join("\n"),
    );
  }
  if (row.internalsToUnderstand.length > 0) {
    sections.push(
      "Internals to understand:\n" +
        row.internalsToUnderstand.map((s) => `- ${s}`).join("\n"),
    );
  }
  if (row.interviewQuestions.length > 0) {
    sections.push(
      "Interview questions:\n" +
        row.interviewQuestions.map((s) => `- ${s}`).join("\n"),
    );
  }
  if (row.failureScenarios.length > 0) {
    sections.push(
      "Failure scenarios:\n" +
        row.failureScenarios
          .map((f) => (typeof f === "object" && f !== null ? JSON.stringify(f) : String(f)))
          .map((s) => `- ${s}`)
          .join("\n"),
    );
  }
  if (row.prerequisites.length > 0) {
    sections.push(`Prerequisites: ${row.prerequisites.join("; ")}`);
  }
  if (row.handsOnLab) sections.push(`Hands-on lab: ${row.handsOnLab}`);
  if (row.expectedOutput) sections.push(`Expected output: ${row.expectedOutput}`);
  if (row.definitionOfDone) sections.push(`Definition of done: ${row.definitionOfDone}`);

  return sections.join("\n");
}

/** The slice of a roadmap module this renderer needs. */
export interface RoadmapModuleDocInput {
  trackTitle: string;
  trackSummary: string | null;
  moduleTitle: string;
  moduleSummary: string | null;
  tasks: Array<{
    code: string | null;
    title: string;
    status: string;
    priority: string;
    estimatedMinutes: number;
  }>;
}

/**
 * Render one roadmap module as a document: its track, its summary, and
 * its task list.
 *
 * Shared text is NOT repeated here. An earlier version opened every
 * module doc with the roadmap title AND description, which put words
 * like "payment" into all 23 module documents — BM25 then gave those
 * terms an IDF of ~0, so a correct match scored ~0.08 and fell under
 * the grounding floor. The roadmap-wide prose lives in exactly one
 * document ({@link renderRoadmapOverviewDoc}) for that reason.
 *
 * Track and module summaries are included because they are the only
 * prose describing a phase anywhere in the roadmap.
 */
export function renderRoadmapModuleDoc(args: RoadmapModuleDocInput): string {
  const { trackTitle, trackSummary, moduleTitle, moduleSummary, tasks } = args;
  const lines: string[] = [`## Track: ${trackTitle}`];
  if (trackSummary) lines.push(trackSummary);
  lines.push(`### Module: ${moduleTitle}`);
  if (moduleSummary) lines.push(moduleSummary);
  if (tasks.length > 0) lines.push("Tasks:");
  for (const t of tasks) {
    lines.push(
      `- ${t.code ?? "—"} | ${t.title} | status=${t.status} | priority=${t.priority} | est=${t.estimatedMinutes}m`,
    );
  }
  return lines.join("\n");
}

/**
 * Render the roadmap as a whole: its own prose plus the phase list.
 *
 * This is the single document that carries roadmap-level text, so the
 * terms in it stay discriminative instead of being smeared across every
 * module doc. It is what answers "what is my roadmap about?", which the
 * per-module documents cannot.
 */
export function renderRoadmapOverviewDoc(args: {
  roadmapTitle: string;
  roadmapDescription: string | null;
  tracks: Array<{ title: string; summary: string | null }>;
}): string {
  const { roadmapTitle, roadmapDescription, tracks } = args;
  const lines: string[] = [`# ${roadmapTitle}`];
  if (roadmapDescription) lines.push(roadmapDescription);
  if (tracks.length > 0) {
    lines.push("Phases:");
    for (const t of tracks) lines.push(`- ${t.title}`);
  }
  return lines.join("\n");
}

/**
 * Map a lowercased task code to itself for every code present in the
 * corpus, so `scoreKnowledge` can apply its exact-code boost without
 * inflating toward codes we hold no content for.
 */
export function buildCodeLookup(docs: KnowledgeDoc[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of docs) {
    if (doc.code) map.set(doc.code.toLowerCase(), doc.code);
  }
  return map;
}