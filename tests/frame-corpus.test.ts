/**
 * Corpus rendering — the content the frame actually hands the model.
 *
 * These tests exist because of a real bug: the corpus used to carry
 * only task metadata (code / title / status / priority), which was
 * enough for BM25 to fire — a code token matches and scores high, so
 * `grounded` was true — while giving the model no text to ground an
 * answer on. The frame then honestly reported "no information" even
 * with a task in scope. Retrieval could not be observed to be wrong
 * from the outside: the hits looked right, the excerpts were empty
 * of substance.
 *
 * So the assertions here are about SUBSTANCE, not just "retrieval
 * produced a hit": sections present, empty sections absent, and a
 * phrase that lives only in a description retrieving that doc.
 */
import { describe, it, expect } from "vitest";
import {
  renderTaskDoc,
  renderRoadmapModuleDoc,
  renderRoadmapOverviewDoc,
  buildCodeLookup,
} from "@/lib/ai/frame/doc-render";
import { retrieveKnowledge } from "@/lib/ai/frame/retrieval";
import type { TaskContentRow } from "@/lib/db/queries/tasks";
import type { KnowledgeDoc } from "@/lib/ai/frame/retrieval";

function taskRow(overrides: Partial<TaskContentRow> = {}): TaskContentRow {
  return {
    code: "AUTH-01",
    title: "Reconstruct login→logout/session/device",
    status: "BACKLOG",
    priority: "P0",
    difficulty: "INTERMEDIATE",
    estimatedMinutes: 45,
    moduleTitle: "Authentication lifecycle",
    trackTitle: "PH2 — Authentication lifecycle",
    description: "Dựng lại toàn bộ vòng đời xác thực của SAHA.",
    whyThisMatters: "Cần bảo vệ claim C13/C14/C16.",
    concepts: ["Identity", "Account", "token"],
    deepDiveSubtopics: ["Identity — xác định vai trò trong flow."],
    internalsToUnderstand: ["Identity authority và authorization decision points."],
    failureScenarios: [{ id: "AUTH-01-F01", title: "JWT hợp lệ nhưng session revoked" }],
    interviewQuestions: ["Identity nghĩa gì?"],
    prerequisites: ["PAY-01"],
    handsOnLab: "MINI-AUTH-01. Objective: kiểm chứng identity authority.",
    expectedOutput: "Lifecycle/trust diagram.",
    definitionOfDone: "Explain concepts; Draw normal/failure boundary.",
    ...overrides,
  };
}

describe("renderTaskDoc", () => {
  it("includes the study content, not just metadata", () => {
    const doc = renderTaskDoc(taskRow());
    // The regression: this used to stop after four metadata lines.
    expect(doc).toContain("Dựng lại toàn bộ vòng đời xác thực");
    expect(doc).toContain("Concepts: Identity, Account, token");
    expect(doc).toContain("Internals to understand:");
    expect(doc).toContain("Interview questions:");
    expect(doc).toContain("Deep-dive subtopics:");
    expect(doc).toContain("Hands-on lab:");
    expect(doc).toContain("Definition of done:");
  });

  it("keeps the header metadata the code boost and citation rely on", () => {
    const doc = renderTaskDoc(taskRow());
    expect(doc).toContain("Code: AUTH-01");
    expect(doc).toContain("Title: Reconstruct login→logout/session/device");
    expect(doc).toContain("Status: BACKLOG");
    expect(doc).toContain("Track: PH2 — Authentication lifecycle");
  });

  it("omits sections that have no content", () => {
    const doc = renderTaskDoc(
      taskRow({
        description: null,
        whyThisMatters: null,
        concepts: [],
        deepDiveSubtopics: [],
        internalsToUnderstand: [],
        interviewQuestions: [],
        prerequisites: [],
        failureScenarios: [],
        handsOnLab: null,
        expectedOutput: null,
        definitionOfDone: null,
      }),
    );
    // An empty heading would let BM25 score a match on a heading the
    // document never substantiates.
    expect(doc).not.toContain("Description:");
    expect(doc).not.toContain("Concepts:");
    expect(doc).not.toContain("Interview questions:");
    expect(doc).not.toContain("Hands-on lab:");
    // Header metadata is always present — it is the doc's identity.
    expect(doc).toContain("Code: AUTH-01");
  });

  it("renders a JSON failure scenario without throwing on its shape", () => {
    const doc = renderTaskDoc(
      taskRow({ failureScenarios: ["a plain string scenario", 42] }),
    );
    expect(doc).toContain("Failure scenarios:");
    expect(doc).toContain("a plain string scenario");
    expect(doc).toContain("42");
  });
});

describe("renderRoadmapModuleDoc", () => {
  const base = {
    trackTitle: "PH2 — Authentication lifecycle",
    trackSummary: "Reconstruct payment backend vào mental model.",
    moduleTitle: "Authentication lifecycle — Track H/G",
    moduleSummary: "Trust boundary, session, token rotation.",
    tasks: [
      {
        code: "AUTH-01",
        title: "Reconstruct login→logout/session/device",
        status: "BACKLOG",
        priority: "P0",
        estimatedMinutes: 45,
      },
    ],
  };

  it("includes the track and module summaries", () => {
    const doc = renderRoadmapModuleDoc(base);
    // The regression: these were dropped entirely.
    expect(doc).toContain("Reconstruct payment backend vào mental model.");
    expect(doc).toContain("Trust boundary, session, token rotation.");
  });

  it("does not repeat the roadmap title or description", () => {
    const doc = renderRoadmapModuleDoc(base);
    // Repeating shared text across every module doc gave common terms
    // an IDF of ~0 — a correct match then scored ~0.08 and fell under
    // the grounding floor. That text belongs to the overview doc alone.
    expect(doc).not.toContain("Roadmap tổng thể");
    expect(doc).not.toContain("# CV-Driven Backend Roadmap");
  });

  it("does not duplicate the track title as both ## and ###", () => {
    const doc = renderRoadmapModuleDoc(base);
    // The previous builder emitted `## title` and `### title` with the
    // same value, inflating its term frequency for the track name.
    expect(doc.match(/PH2 — Authentication lifecycle/g) ?? []).toHaveLength(1);
  });

  it("omits summaries when null but keeps the structure", () => {
    const doc = renderRoadmapModuleDoc({
      ...base,
      trackSummary: null,
      moduleSummary: null,
    });
    expect(doc).toContain("## Track: PH2 — Authentication lifecycle");
    expect(doc).toContain("### Module: Authentication lifecycle — Track H/G");
    expect(doc).toContain("AUTH-01");
  });
});

describe("renderRoadmapOverviewDoc", () => {
  it("carries the roadmap prose and the phase list", () => {
    const doc = renderRoadmapOverviewDoc({
      roadmapTitle: "CV-Driven Backend Roadmap",
      roadmapDescription: "Roadmap backend bám sát CV thật",
      tracks: [
        { title: "PH0 — Project reconstruction", summary: null },
        { title: "PH1 — Payment reliability", summary: null },
      ],
    });
    expect(doc).toContain("# CV-Driven Backend Roadmap");
    expect(doc).toContain("Roadmap backend bám sát CV thật");
    expect(doc).toContain("- PH0 — Project reconstruction");
    expect(doc).toContain("- PH1 — Payment reliability");
  });

  it("keeps roadmap-level text in ONE document, so its terms stay discriminative", () => {
    const moduleDoc = renderRoadmapModuleDoc({
      trackTitle: "PH1 — Payment reliability",
      trackSummary: "Payment reliability và các nền tảng database.",
      moduleTitle: "Payment reliability — Track B/K/A",
      moduleSummary: null,
      tasks: [],
    });
    const overview = renderRoadmapOverviewDoc({
      roadmapTitle: "CV-Driven Backend Roadmap",
      roadmapDescription: "reconstruct payment project → payment reliability → auth lifecycle",
      tracks: [{ title: "PH1 — Payment reliability", summary: null }],
    });
    // Across the pair, the roadmap description appears exactly once.
    const all = `${moduleDoc}\n${overview}`;
    expect(all.match(/reconstruct payment project/g) ?? []).toHaveLength(1);
  });
});

describe("meaningful grounding", () => {
  const docs: KnowledgeDoc[] = [
    {
      id: "task-index:AUTH-01",
      label: "TASK INDEX · AUTH-01",
      kind: "TASK",
      code: "AUTH-01",
      title: "Reconstruct login→logout/session/device",
      body: renderTaskDoc(taskRow()),
    },
    {
      id: "task-index:PAY-01",
      label: "TASK INDEX · PAY-01",
      kind: "TASK",
      code: "PAY-01",
      title: "Idempotency key handling",
      body: renderTaskDoc(
        taskRow({
          code: "PAY-01",
          title: "Idempotency key handling",
          description: "Chống duplicate charge khi client retry.",
          concepts: ["idempotency"],
          deepDiveSubtopics: [],
          internalsToUnderstand: [],
          interviewQuestions: [],
          prerequisites: [],
          failureScenarios: [],
          handsOnLab: null,
          expectedOutput: null,
          definitionOfDone: null,
        }),
      ),
    },
  ];

  it("a phrase that lives only in a description retrieves that doc", () => {
    const r = retrieveKnowledge("duplicate charge khi retry", docs, {
      codeLookup: buildCodeLookup(docs),
    });
    expect(r.grounded).toBe(true);
    expect(r.hits[0]?.doc.code).toBe("PAY-01");
    // The content word — not merely the task code — is what matched.
    expect(r.hits[0]?.matchedTerms).toContain("duplicate");
  });

  it("a question about a concept still finds the right task", () => {
    const r = retrieveKnowledge("authorization decision points", docs, {
      codeLookup: buildCodeLookup(docs),
    });
    expect(r.grounded).toBe(true);
    expect(r.hits[0]?.doc.code).toBe("AUTH-01");
  });

  it("gibberish still fails closed — enrichment did not make grounding promiscuous", () => {
    const r = retrieveKnowledge("xqzj wkvqt zzrr", docs, {
      codeLookup: buildCodeLookup(docs),
    });
    expect(r.grounded).toBe(false);
    expect(r.telemetry.hits).toBe(0);
  });

  it("a metadata-only doc would NOT have grounded this query", () => {
    // The exact regression, asserted directly: strip the body back to
    // the old four metadata lines and the same query finds nothing.
    const thin: KnowledgeDoc[] = docs.map((d) => ({
      ...d,
      body: [
        `Code: ${d.code}`,
        `Title: ${d.title}`,
        "Status: BACKLOG  Priority: P0",
        "Track: PH2 — Authentication lifecycle",
      ].join("\n"),
    }));
    const r = retrieveKnowledge("duplicate charge khi retry", thin, {
      codeLookup: buildCodeLookup(thin),
    });
    expect(r.grounded).toBe(false);
  });
});