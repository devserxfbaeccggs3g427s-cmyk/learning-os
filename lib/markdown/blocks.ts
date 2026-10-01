/**
 * Markdown custom block parser.
 *
 * Beyond GitHub-Flavored Markdown, the Learning OS supports semantic
 * "directive" blocks that look like:
 *
 *   :::concept[Title?]
 *   body
 *   :::
 *
 *   :::important
 *   body
 *   :::
 *
 * Parsing is done in a single pass so the renderer can stream-edit the
 * Markdown string into a sequence of nodes (block, plain text) and the
 * UI consumes them.
 */
export type SemanticBlockKind =
  | "concept"
  | "important"
  | "example"
  | "failure"
  | "interview"
  | "lab"
  | "question"
  | "answer"
  | "flashcard"
  | "quiz"
  | "warning"
  | "section";

const KNOWN_KINDS: ReadonlySet<SemanticBlockKind> = new Set([
  "concept",
  "important",
  "example",
  "failure",
  "interview",
  "lab",
  "question",
  "answer",
  "flashcard",
  "quiz",
  "warning",
  "section",
]);

export interface SemanticBlock {
  kind: SemanticBlockKind;
  title?: string;
  body: string;
  /** Source range in the input string (for diagnostics). */
  start: number;
  end: number;
}

export type MarkdownNode =
  | { type: "semantic"; block: SemanticBlock }
  | { type: "markdown"; content: string };

const FENCE_RE = /^:::(concept|important|example|failure|interview|lab|question|answer|flashcard|quiz|warning|section)(?:\[([^\]]*)\])?\s*$/;

export function parseBlocks(markdown: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  const lines = markdown.split(/\r?\n/);
  let cursor = 0;
  let plainStart = 0;
  let plainBuffer: string[] = [];

  const flushPlain = () => {
    if (plainBuffer.length === 0) return;
    const content = plainBuffer.join("\n");
    nodes.push({ type: "markdown", content });
    plainBuffer = [];
  };

  while (cursor < lines.length) {
    const line = lines[cursor]!;
    if (line.startsWith(":::")) {
      const m = FENCE_RE.exec(line.trim());
      if (m && KNOWN_KINDS.has(m[1] as SemanticBlockKind)) {
        flushPlain();
        const start = cursor;
        const kind = m[1] as SemanticBlockKind;
        const title = m[2];
        cursor++;
        const body: string[] = [];
        while (cursor < lines.length && lines[cursor]?.trim() !== ":::") {
          body.push(lines[cursor]!);
          cursor++;
        }
        // skip closing :::
        nodes.push({
          type: "semantic",
          block: {
            kind,
            title,
            body: body.join("\n"),
            start: start,
            end: cursor,
          },
        });
        cursor++;
        plainStart = cursor;
        continue;
      }
    }
    plainBuffer.push(line);
    cursor++;
  }
  flushPlain();
  return nodes;
}

/** Helper for tests / debug: pretty-print the parse tree. */
export function dumpBlocks(markdown: string): string {
  return parseBlocks(markdown)
    .map((n, i) =>
      n.type === "semantic"
        ? `[${i}] ${n.block.kind}${n.block.title ? `(${n.block.title})` : ""} (lines ${n.block.start}-${n.block.end})`
        : `[${i}] markdown (${n.content.length} chars)`,
    )
    .join("\n");
}