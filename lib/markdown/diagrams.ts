/**
 * Diagram extraction from markdown text.
 *
 * Recognizes fenced ```mermaid / ```plantuml blocks and our
 * :::mermaid / :::plantuml directive blocks, and strips them
 * from the plain markdown stream.
 */

export type DiagramDefinition =
  | { type: "mermaid"; source: string }
  | { type: "plantuml"; source: string };

export interface DiagramSegment {
  kind: "diagram";
  diagram: DiagramDefinition;
  /** 0-based line range in the source. */
  start: number;
  end: number;
}

export interface TextSegment {
  kind: "text";
  content: string;
}

export type MarkdownSegment = DiagramSegment | TextSegment;

const FENCED_RE = /^```(mermaid|plantuml)\s*$/;
const DIRECTIVE_RE = /^:::(mermaid|plantuml)(?:\[([^\]]*)\])?\s*$/;

/** Split markdown into diagram + text segments, keeping order. */
export function parseDiagrams(markdown: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const lines = markdown.split(/\r?\n/);
  let cursor = 0;
  let textBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length === 0) return;
    segments.push({ kind: "text", content: textBuffer.join("\n") });
    textBuffer = [];
  };

  while (cursor < lines.length) {
    const line = lines[cursor]!;
    const trimmed = line.trim();

    const fenced = FENCED_RE.exec(trimmed);
    const directive = DIRECTIVE_RE.exec(trimmed);
    const match = fenced ?? directive;

    if (match) {
      const type = match[1] as "mermaid" | "plantuml";
      const start = cursor;
      cursor++;
      const body: string[] = [];
      // Fenced blocks end at ```; directive blocks end at :::
      const closer = fenced ? /^```\s*$/ : /^:::\s*$/;
      while (cursor < lines.length && !closer.test(lines[cursor]!.trim())) {
        body.push(lines[cursor]!);
        cursor++;
      }
      cursor++; // skip closer
      flushText();

      let source = body.join("\n").trim();
      if (type === "plantuml") {
        // Tolerate embedded @startuml/@enduml wrappers.
        source = source
          .replace(/^@startuml\s*/, "")
          .replace(/\s*@enduml\s*$/, "")
          .trim();
      }
      segments.push({
        kind: "diagram",
        diagram: { type, source },
        start,
        end: cursor,
      });
      continue;
    }

    textBuffer.push(line);
    cursor++;
  }
  flushText();
  return segments;
}
