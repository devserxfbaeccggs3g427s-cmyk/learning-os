/**
 * Frame knowledge-scope validation.
 *
 * A frame declares which slices of the user's own project knowledge it
 * may retrieve from. The DEFAULT is `NONE` — the frame is then a pure
 * conversation with its own history and nothing else. This is the
 * requirement "must not automatically use task/roadmap context" encoded
 * as data rather than as a UI convention.
 *
 * Pure logic: no DB, no network.
 */
import type { FrameKnowledgeMode } from "@/lib/db/schema/aiFrames";

/** Scope used when the client omits one. Deliberately the most restrictive. */
export const DEFAULT_KNOWLEDGE_MODE: FrameKnowledgeMode = "NONE";

/** Every accepted value. Kept in sync with the schema via the import type. */
export const KNOWLEDGE_MODES: readonly FrameKnowledgeMode[] = [
  "NONE",
  "TASK_INDEX",
  "ROADMAP",
  "INDEX_PLUS_ROADMAP",
  "NOTES",
] as const;

/** True when the mode allows any project content at all. */
export function grantsKnowledge(mode: FrameKnowledgeMode): boolean {
  return mode !== "NONE";
}

/** True when the mode includes the task code/title index. */
export function includesTaskIndex(mode: FrameKnowledgeMode): boolean {
  return mode === "TASK_INDEX" || mode === "INDEX_PLUS_ROADMAP";
}

/** True when the mode includes the roadmap tree. */
export function includesRoadmap(mode: FrameKnowledgeMode): boolean {
  return mode === "ROADMAP" || mode === "INDEX_PLUS_ROADMAP";
}

/** True when the mode includes the user's own notes. */
export function includesNotes(mode: FrameKnowledgeMode): boolean {
  return mode === "NOTES";
}

/**
 * Parse a client-supplied scope string. Returns the default rather than
 * throwing, so a malformed value fails closed (no knowledge) instead of
 * open (full roadmap).
 */
export function parseKnowledgeMode(value: unknown): FrameKnowledgeMode {
  if (typeof value === "string" && (KNOWLEDGE_MODES as readonly string[]).includes(value)) {
    return value as FrameKnowledgeMode;
  }
  return DEFAULT_KNOWLEDGE_MODE;
}

/** Client-facing description of each scope, for the UI legend. */
export const KNOWLEDGE_MODE_LABELS: Record<FrameKnowledgeMode, string> = {
  NONE: "Off — chat only",
  TASK_INDEX: "Task index",
  ROADMAP: "Roadmap",
  INDEX_PLUS_ROADMAP: "Task index + roadmap",
  NOTES: "My notes",
};