/**
 * Bound-task behaviour — what a frame actually knows about "this task".
 *
 * A frame opened from Start Task or task Notes carries that one task.
 * The tests below pin the properties that make that safe:
 *
 *  - the bound task is retrievable even at `knowledgeMode: NONE`
 *    (it is what the frame exists to discuss, not an opt-in slice);
 *  - a frame with no bound task gets nothing at `NONE`;
 *  - two frames bound to two tasks never see each other's task;
 *  - the bound task does NOT override the mode gate — a task still
 *    outside the pool stays unreachable;
 *  - and a generic question ("task này yêu cầu gì") resolves to the
 *    bound task instead of whichever corpus doc happens to repeat
 *    the word "task" most often.
 *
 * These exercise `buildFrameCorpus` + `retrieveKnowledge` with a fake
 * task-context, so no database and no `unstable_cache` request context
 * is needed — see the module double at the bottom.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// `buildBoundTaskDocs` calls `buildTaskContext`, which hits the DB.
// Stub the whole context module before corpus.ts imports it.
// `vi.mock` factories are hoisted above every other statement, so the
// stub has to be created with `vi.hoisted` — a plain `const` above it
// would still be in its temporal dead zone when the factory runs.
const { fakeTaskContext } = vi.hoisted(() => ({ fakeTaskContext: vi.fn() }));
vi.mock("@/lib/ai/context", () => ({
  buildTaskContext: (...args: unknown[]) => fakeTaskContext(...args),
}));

// The task index and roadmap builders are gated behind knowledgeMode
// and are covered by frame-corpus.test.ts. Here we only care about the
// bound task, so blank them out.
vi.mock("@/lib/db/queries/tasks", () => ({
  listTaskContentIndex: async () => [],
}));
vi.mock("@/lib/db/queries/roadmap", () => ({
  getRoadmapTree: async () => null,
  // buildTaskContext awaits this too; it is wrapped in unstable_cache
  // upstream, which throws outside a Next request context.
  listRoadmaps: async () => [],
}));
// Snippets: no pinned snippets in these tests.
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
  },
}));

import { buildFrameCorpus, buildCodeLookup } from "@/lib/ai/frame/corpus";
import { retrieveKnowledge } from "@/lib/ai/frame/retrieval";

/** Register a task the stubbed buildTaskContext should return. */
function givenTask(id: string, code: string, title: string, body: string) {
  fakeTaskContext.mockImplementation(async () => ({
    taskRow: { id, code, title },
    noteRow: undefined,
    sections: [],
    contextMd: [`# ${code} — ${title}`, body].join("\n"),
  }));
}

async function corpusFor(taskId: string | null, knowledgeMode: "NONE" | "TASK_INDEX") {
  return buildFrameCorpus({ userId: "u1", frameId: "f1", taskId, knowledgeMode, query: "" });
}

describe("bound task is in scope even with Knowledge off", () => {
  beforeEach(() => fakeTaskContext.mockReset());

  it("a generic question resolves to the bound task", async () => {
    // The live bug: "task này yêu cầu gì?" retrieved whatever corpus
    // document happened to repeat "task", because the frame had no
    // idea which task "task này" referred to.
    givenTask("t-pay", "PAY-01", "Idempotency key handling", "Yêu cầu: chống duplicate charge.");

    const corpus = await corpusFor("t-pay", "NONE");
    const r = retrieveKnowledge("task này yêu cầu gì", corpus, {
      codeLookup: buildCodeLookup(corpus),
      minScore: 0,
    });

    expect(corpus).toHaveLength(1);
    expect(corpus[0]!.code).toBe("PAY-01");
    expect(r.hits[0]!.doc.code).toBe("PAY-01");
  });

  it("a frame with no bound task still gets an empty corpus at NONE", async () => {
    const corpus = await corpusFor(null, "NONE");
    expect(corpus).toEqual([]);
    expect(retrieveKnowledge("task này yêu cầu gì", corpus).grounded).toBe(false);
  });

  it("the bound task is labelled so the model can cite it", async () => {
    givenTask("t-pay", "PAY-01", "Idempotency key handling", "x");
    const corpus = await corpusFor("t-pay", "NONE");
    expect(corpus[0]!.label).toBe("CURRENT TASK · PAY-01");
    expect(corpus[0]!.kind).toBe("TASK");
  });
});

describe("two frames never share a task", () => {
  beforeEach(() => fakeTaskContext.mockReset());

  it("frame bound to A cannot retrieve B", async () => {
    givenTask("t-a", "PAY-01", "Idempotency key handling", "Idempotency key contract.");

    // Ask specifically about a DIFFERENT task's code. The bound task
    // is the only document in the pool, so B must not answer.
    const corpus = await corpusFor("t-a", "NONE");
    const r = retrieveKnowledge("FLOW-02 concurrent approval", corpus, {
      codeLookup: buildCodeLookup(corpus),
      minScore: 0,
    });
    expect(r.hits.every((h) => h.doc.code === "PAY-01")).toBe(true);
  });

  it("the same task bound to two frames yields identical corpora", async () => {
    // Binding is a property of the FRAME ROW, not of the caller, so
    // re-reading it is idempotent — a reload cannot change scope.
    givenTask("t-pay", "PAY-01", "Idempotency key handling", "Yêu cầu: chống duplicate charge.");
    const a = await buildFrameCorpus({ userId: "u1", frameId: "f1", taskId: "t-pay", knowledgeMode: "NONE", query: "" });
    const b = await buildFrameCorpus({ userId: "u1", frameId: "f2", taskId: "t-pay", knowledgeMode: "NONE", query: "" });
    expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id));
    expect(a.map((d) => d.body)).toEqual(b.map((d) => d.body));
  });
});

describe("the mode gate still applies to everything else", () => {
  beforeEach(() => fakeTaskContext.mockReset());

  it("TASK_INDEX mode still returns only the task index, not the bound task twice", async () => {
    // The task index is stubbed empty here; what matters is that the
    // bound task is added exactly ONCE — a duplicate would double its
    // term frequencies and skew BM25 length normalisation.
    givenTask("t-pay", "PAY-01", "Idempotency key handling", "x");
    const corpus = await corpusFor("t-pay", "TASK_INDEX");
    const ids = corpus.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((i) => i.startsWith("bound-task:"))).toHaveLength(1);
  });

  it("a failing bound-task lookup degrades instead of failing the turn", async () => {
    // buildTaskContext throws (dead connection, cache miss outside a
    // request context). The corpus must come back empty-but-valid, not
    // reject — buildFrameCorpus wraps every slice in .catch(() => []).
    //
    // The implementation is restored immediately after the call. Left
    // in place it would outlive the test: vitest's mock cleanup hook
    // invokes the spy one last time, and a spy that throws makes the
    // NEXT test fail with a stack pointing at the line below.
    fakeTaskContext.mockImplementationOnce(async () => {
      throw new Error("Invariant: incrementalCache missing");
    });
    const corpus = await corpusFor("t-pay", "NONE");
    expect(corpus).toEqual([]);
  });

  it("a missing task row yields no document", async () => {
    fakeTaskContext.mockResolvedValue({
      taskRow: undefined,
      noteRow: undefined,
      sections: [],
      contextMd: "",
    });
    const corpus = await corpusFor("t-deleted", "NONE");
    expect(corpus).toEqual([]);
  });
});