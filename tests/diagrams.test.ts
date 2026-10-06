import { describe, expect, it } from "vitest";
import { parseDiagrams } from "@/lib/markdown/diagrams";

describe("parseDiagrams", () => {
  it("extracts fenced mermaid block", () => {
    const segments = parseDiagrams(
      "text before\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\ntext after",
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ kind: "text", content: "text before\n" });
    expect(segments[1]).toEqual({
      kind: "diagram",
      diagram: { type: "mermaid", source: "graph TD;\n  A-->B;" },
      start: 2,
      end: 6,
    });
    expect(segments[2]).toEqual({ kind: "text", content: "\ntext after" });
  });

  it("extracts fenced plantuml block and strips @startuml/@enduml", () => {
    const segments = parseDiagrams(
      "```plantuml\n@startuml\nA -> B\n@enduml\n```",
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      kind: "diagram",
      diagram: { type: "plantuml", source: "A -> B" },
      start: 0,
      end: 5,
    });
  });

  it("extracts :::mermaid directive block", () => {
    const segments = parseDiagrams(":::mermaid\ngraph TD;\nA-->B;\n:::");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      kind: "diagram",
      diagram: { type: "mermaid", source: "graph TD;\nA-->B;" },
      start: 0,
      end: 4,
    });
  });

  it("keeps :::semantic blocks as text (handled by parseBlocks)", () => {
    const segments = parseDiagrams(":::important\nnote\n:::");
    expect(segments).toHaveLength(1);
    expect(segments[0]!.kind).toBe("text");
  });

  it("does not treat other fenced languages as diagrams", () => {
    const segments = parseDiagrams("```ts\nconst x = 1;\n```");
    expect(segments).toHaveLength(1);
    expect(segments[0]!.kind).toBe("text");
  });

  it("handles unclosed fence (rest of input becomes diagram)", () => {
    const segments = parseDiagrams("```mermaid\ngraph TD;");
    expect(segments).toHaveLength(1);
    expect(segments[0]!.kind).toBe("diagram");
  });
});
