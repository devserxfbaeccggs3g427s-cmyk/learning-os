/**
 * Client-safe mirror of `lib/ai/frame/scope.ts`.
 *
 * The scope module lives server-side because it imports the DB schema
 * (for the `FrameKnowledgeMode` type). This file re-declares the same
 * union and labels with no server imports, so the dialog can render
 * the scope picker without dragging `@/lib/db` into the client
 * bundle.
 *
 * These are labels and a type — no validation authority. Every scope
 * the client sends is re-parsed by the server with
 * `parseKnowledgeMode()`, which fails closed to `NONE`.
 */

export type FrameKnowledgeMode =
  | "NONE"
  | "TASK_INDEX"
  | "ROADMAP"
  | "INDEX_PLUS_ROADMAP"
  | "NOTES";

export const KNOWLEDGE_MODES: readonly FrameKnowledgeMode[] = [
  "NONE",
  "TASK_INDEX",
  "ROADMAP",
  "INDEX_PLUS_ROADMAP",
  "NOTES",
] as const;

export const KNOWLEDGE_MODE_LABELS: Record<FrameKnowledgeMode, string> = {
  NONE: "Off",
  TASK_INDEX: "Tasks",
  ROADMAP: "Roadmap",
  INDEX_PLUS_ROADMAP: "Tasks + roadmap",
  NOTES: "My notes",
};

export function grantsKnowledge(mode: FrameKnowledgeMode): boolean {
  return mode !== "NONE";
}