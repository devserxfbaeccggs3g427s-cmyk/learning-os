/**
 * Frame knowledge-scope validation and the no-answer protocol.
 *
 * These two together are the "no automatic task/roadmap context"
 * requirement made testable: the scope parser must fail closed
 * (unknown scope ⇒ no knowledge), and the no-answer detector
 * must recognise the marker the model was instructed to emit.
 */
import { describe, it, expect } from "vitest";
import {
  parseKnowledgeMode,
  DEFAULT_KNOWLEDGE_MODE,
  KNOWLEDGE_MODES,
  grantsKnowledge,
  includesTaskIndex,
  includesRoadmap,
  includesNotes,
} from "@/lib/ai/frame/scope";
import {
  detectNoAnswer,
  stripNoAnswerMarker,
  NO_ANSWER_MARKERS,
  NO_ANSWER_FALLBACK,
} from "@/lib/ai/frame/no-answer";
import { trimHistoryWindow } from "@/lib/ai/text-budget";

describe("parseKnowledgeMode", () => {
  it("defaults to NONE — the most restrictive scope", () => {
    expect(DEFAULT_KNOWLEDGE_MODE).toBe("NONE");
    expect(parseKnowledgeMode(undefined)).toBe("NONE");
    expect(parseKnowledgeMode(null)).toBe("NONE");
    expect(parseKnowledgeMode("")).toBe("NONE");
  });

  it("fails closed on an unknown or hostile value", () => {
    expect(parseKnowledgeMode("FULL")).toBe("NONE");
    expect(parseKnowledgeMode("ALL")).toBe("NONE");
    expect(parseKnowledgeMode("__proto__")).toBe("NONE");
    expect(parseKnowledgeMode({})).toBe("NONE");
    expect(parseKnowledgeMode(42)).toBe("NONE");
  });

  it("accepts exactly the advertised modes", () => {
    for (const mode of KNOWLEDGE_MODES) {
      expect(parseKnowledgeMode(mode)).toBe(mode);
    }
  });

  it("NONE grants nothing; every other mode grants something", () => {
    expect(grantsKnowledge("NONE")).toBe(false);
    for (const mode of KNOWLEDGE_MODES) {
      if (mode === "NONE") continue;
      expect(grantsKnowledge(mode)).toBe(true);
    }
  });

  it("each mode enables exactly its advertised slice", () => {
    expect(includesTaskIndex("TASK_INDEX")).toBe(true);
    expect(includesTaskIndex("INDEX_PLUS_ROADMAP")).toBe(true);
    expect(includesTaskIndex("ROADMAP")).toBe(false);
    expect(includesTaskIndex("NOTES")).toBe(false);

    expect(includesRoadmap("ROADMAP")).toBe(true);
    expect(includesRoadmap("INDEX_PLUS_ROADMAP")).toBe(true);
    expect(includesRoadmap("TASK_INDEX")).toBe(false);

    expect(includesNotes("NOTES")).toBe(true);
    expect(includesNotes("TASK_INDEX")).toBe(false);
  });
});

describe("detectNoAnswer", () => {
  it("recognises the English marker when it leads the reply", () => {
    expect(detectNoAnswer("NO ANSWER FOUND — I have nothing on this.")).toBe(true);
    expect(detectNoAnswer("NO ANSWER FOUND")).toBe(true);
  });

  it("recognises the Vietnamese markers, with and without diacritics", () => {
    expect(detectNoAnswer("KHÔNG TÌM THẤY nội dung phù hợp")).toBe(true);
    expect(detectNoAnswer("KHONG TIM THAY gi ca")).toBe(true);
  });

  it("ignores markup and case around the marker", () => {
    expect(detectNoAnswer("**no answer found**")).toBe(true);
    expect(detectNoAnswer("# No Answer Found: nothing in scope")).toBe(true);
  });

  it("is positional — a marker buried in a real answer is not a no-answer", () => {
    const longAnswer = `${"The connection pool is exhausted. ".repeat(20)} In production you may see a "NO ANSWER FOUND" error message.`;
    expect(detectNoAnswer(longAnswer)).toBe(false);
  });

  it("an empty reply is not a no-answer (that is an error, not a protocol hit)", () => {
    expect(detectNoAnswer("")).toBe(false);
  });

  it("a normal answer is not a no-answer", () => {
    expect(detectNoAnswer("Connection pooling reuses DB connections per request.")).toBe(false);
  });
});

describe("stripNoAnswerMarker", () => {
  it("removes the leading marker and leaves the explanation", () => {
    expect(stripNoAnswerMarker("NO ANSWER FOUND — nothing in your notes mentions this.")).toBe(
      "nothing in your notes mentions this.",
    );
  });

  it("removes the Vietnamese marker too", () => {
    expect(stripNoAnswerMarker("KHÔNG TÌM THẤY: không có gì trong ghi chú của bạn")).toBe(
      "không có gì trong ghi chú của bạn",
    );
  });

  it("leaves a reply without a marker untouched", () => {
    expect(stripNoAnswerMarker("A plain answer.")).toBe("A plain answer.");
  });
});

describe("no-answer constants", () => {
  it("exposes at least one marker and a human fallback sentence", () => {
    expect(NO_ANSWER_MARKERS.length).toBeGreaterThan(0);
    expect(NO_ANSWER_FALLBACK.length).toBeGreaterThan(0);
  });
});

describe("trimHistoryWindow", () => {
  const hist = Array.from({ length: 40 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  }));

  it("returns a copy, unchanged, when the window already fits", () => {
    const out = trimHistoryWindow(hist, 50);
    expect(out).toEqual(hist);
    expect(out).not.toBe(hist);
  });

  it("never exceeds the window even when it prepends the anchor", () => {
    const out = trimHistoryWindow(hist, 10);
    expect(out).toHaveLength(10);
    expect(out.map((m) => m.content)).toEqual([
      "m0",
      "m31", "m32", "m33", "m34", "m35", "m36", "m37", "m38", "m39",
    ]);
  });

  it("always keeps the first user message — the turn that set the frame's subject", () => {
    const out = trimHistoryWindow(hist, 10);
    // Tail is the last 10 (m30..m39); the anchor m0 displaces m30 so
    // the result stays within the budget.
    expect(out.map((m) => m.content)).toEqual([
      "m0",
      "m31", "m32", "m33", "m34", "m35", "m36", "m37", "m38", "m39",
    ]);
  });

  it("does not duplicate the anchor when it is already in the tail", () => {
    const small = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
    ];
    const out = trimHistoryWindow(small, 2);
    expect(out).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "d" },
    ]);
  });

  it("returns nothing for a non-positive window", () => {
    expect(trimHistoryWindow(hist, 0)).toEqual([]);
  });

  it("handles a history with no user message", () => {
    const onlyAssistant = [
      { role: "assistant", content: "x" },
      { role: "assistant", content: "y" },
    ];
    expect(trimHistoryWindow(onlyAssistant, 1)).toEqual([{ role: "assistant", content: "y" }]);
  });
});
