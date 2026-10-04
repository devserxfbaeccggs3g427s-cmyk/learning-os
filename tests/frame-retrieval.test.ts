/**
 * Retrieval behaviour for AI chat frames.
 *
 * The point of these tests is not "BM25 is correct" — it's that a frame
 * can only ever ground an answer in documents the corpus builder handed
 * it, and that Vietnamese diacritic folding and task-code lookups work
 * in the shapes the app actually stores.
 */
import { describe, it, expect } from "vitest";
import {
  tokenize,
  escapeLike,
  scoreKnowledge,
  retrieveKnowledge,
  MIN_GROUNDING_SCORE,
  CODE_MATCH_BOOST,
  type KnowledgeDoc,
} from "@/lib/ai/frame/retrieval";

function doc(partial: Partial<KnowledgeDoc> & { id: string; body: string }): KnowledgeDoc {
  return {
    label: partial.label ?? partial.id,
    kind: partial.kind ?? "NOTE",
    ...partial,
  } as KnowledgeDoc;
}

describe("tokenize", () => {
  it("folds Vietnamese diacritics so unaccented queries still match", () => {
    // A note written with diacritics, a query typed without them.
    expect(tokenize("Truy vấn chậm trên PostgreSQL")).toEqual(
      expect.arrayContaining(["truy", "van", "cham", "postgresql"]),
    );
    expect(tokenize("truy van cham tren postgresql")).toEqual(
      expect.arrayContaining(["truy", "van", "cham", "postgresql"]),
    );
  });

  it("keeps technical identifiers intact", () => {
    expect(tokenize("Redis Sentinel c++")).toEqual(
      expect.arrayContaining(["redis", "sentinel", "c++"]),
    );
    // Leading/trailing dots are stripped so ".NET" indexes as "net"
    // and matches a bare "net" in a query.
    expect(tokenize(".NET")).toEqual(["net"]);
  });

  it("drops single characters and stopwords", () => {
    const tokens = tokenize("a I x is the of là của một người");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("the");
    // "của" is a stopword written with diacritics; tokenization folds
    // diacritics, so the folded stopword set must catch it too.
    expect(tokens).not.toContain("cua");
    expect(tokens).not.toContain("mot");
    expect(tokens.every((t) => t.length >= 2)).toBe(true);
  });

  it("returns nothing for empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("escapeLike", () => {
  it("escapes the LIKE metacharacters so a query can't widen the match", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c\\d")).toBe("c\\\\d");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeLike("postgres")).toBe("postgres");
  });
});

describe("scoreKnowledge", () => {
  const docs: KnowledgeDoc[] = [
    doc({
      id: "note:1",
      label: "NOTE · c8",
      kind: "NOTE",
      code: "c8",
      title: "Connection pooling",
      body: "Connection pooling reuses database connections instead of opening a new one per request.",
    }),
    doc({
      id: "note:2",
      label: "NOTE · c9",
      kind: "NOTE",
      code: "c9",
      title: "Retry with backoff",
      body: "Exponential backoff retries a failed request with an increasing delay between attempts.",
    }),
    doc({
      id: "roadmap:1",
      label: "ROADMAP · Backend",
      kind: "ROADMAP",
      title: "Backend track",
      body: "Modules: databases, networking, caching, queues.",
    }),
  ];

  it("ranks the on-topic note above the others", () => {
    const hits = scoreKnowledge("connection pooling", docs);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.doc.id).toBe("note:1");
    expect(hits[0]!.matchedTerms).toEqual(expect.arrayContaining(["connection", "pooling"]));
  });

  it("returns nothing when the query shares no terms with the corpus", () => {
    expect(scoreKnowledge("quantum chromodynamics", docs)).toEqual([]);
  });

  it("returns nothing for an empty corpus or an empty query", () => {
    expect(scoreKnowledge("anything", [])).toEqual([]);
    expect(scoreKnowledge("", docs)).toEqual([]);
    expect(scoreKnowledge("is the of", docs)).toEqual([]);
  });

  it("boosts an exact task-code hit above plain term overlap", () => {
    // "c8" alone is a weak BM25 match; the boost is what makes
    // "what is c8?" resolve.
    const hits = scoreKnowledge("c8", docs, { codeLookup: new Map([["c8", "c8"]]) });
    expect(hits[0]!.doc.id).toBe("note:1");
    expect(hits[0]!.score).toBeGreaterThanOrEqual(CODE_MATCH_BOOST);
  });

  it("does not boost a code that the corpus does not contain", () => {
    // "zz9" matches nothing textually, and the lookup claiming it
    // exists must not conjure a hit.
    const hits = scoreKnowledge("zz9", docs, { codeLookup: new Map([["zz9", "zz9"]]) });
    expect(hits).toEqual([]);
  });

  it("boosts a hyphenated code the tokenizer would have split", () => {
    // The regression: tokenize("PAY-01") is ["pay","01"], so testing
    // the boost against the token stream never matched the code
    // "pay-01" and CODE_MATCH_BOOST was dead for every real task.
    // Here "pay" appears nowhere but PAY-01's own body, so without the
    // boost the exact-code query cannot resolve at all.
    const hyphenated: KnowledgeDoc[] = [
      doc({
        id: "task-index:PAY-01",
        kind: "TASK",
        code: "PAY-01",
        title: "Idempotency key handling",
        body: "Chống duplicate charge khi client retry. Idempotency key contract.",
      }),
    ];
    const hits = scoreKnowledge("PAY-01", hyphenated, {
      codeLookup: new Map([["pay-01", "PAY-01"]]),
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBeGreaterThanOrEqual(CODE_MATCH_BOOST);
    expect(hits[0]!.matchedTerms).toContain("pay-01");
  });

  it("an exact hyphenated code outranks tasks that merely share its fragments", () => {
    // The live symptom: querying PAY-01 returned SD-01 above PAY-01,
    // because "pay" and "01" match dozens of unrelated tasks and BM25
    // ranks on raw term frequency.
    const corpus: KnowledgeDoc[] = [
      doc({
        id: "task-index:SD-01",
        kind: "TASK",
        code: "SD-01",
        title: "Payment provider integration",
        // Mentions "pay" repeatedly — the decoy that won before.
        body: "pay pay pay provider contract. payment pay settlement.",
      }),
      doc({
        id: "task-index:FLOW-02",
        kind: "TASK",
        code: "FLOW-02",
        title: "Order flow",
        body: "Unrelated ordering flow. No payment content here.",
      }),
      doc({
        id: "task-index:PAY-01",
        kind: "TASK",
        code: "PAY-01",
        title: "Idempotency key handling",
        body: "Chống duplicate charge khi client retry.",
      }),
    ];
    const hits = scoreKnowledge("PAY-01", corpus, {
      codeLookup: new Map([
        ["pay-01", "PAY-01"],
        ["sd-01", "SD-01"],
        ["flow-02", "FLOW-02"],
      ]),
    });
    expect(hits[0]!.doc.code).toBe("PAY-01");
  });

  it("honours topK", () => {
    const hits = scoreKnowledge("database connection retry delay caching queues", docs, {
      topK: 1,
      minScore: 0,
    });
    expect(hits).toHaveLength(1);
  });

  it("drops hits below the grounding threshold", () => {
    // A single rare-ish term in one long document scores under the
    // default threshold, so it must not become "grounded".
    const longDoc = doc({ id: "long", body: "lorem ".repeat(400) + "pilosa" });
    expect(scoreKnowledge("pilosa", [longDoc], { minScore: MIN_GROUNDING_SCORE })).toEqual([]);
  });
});

describe("retrieveKnowledge", () => {
  it("reports grounded=false and zero telemetry for an empty corpus", () => {
    const r = retrieveKnowledge("anything", []);
    expect(r.grounded).toBe(false);
    expect(r.telemetry).toEqual({ candidates: 0, hits: 0, topScore: 0 });
  });

  it("reports the candidate count and top score when it hits", () => {
    const docs = [
      doc({ id: "a", body: "ghi chu ve index va query plan" }),
      doc({ id: "b", body: "ve chi muc bitmapped" }),
    ];
    const r = retrieveKnowledge("index query plan", docs, { minScore: 0 });
    expect(r.grounded).toBe(true);
    expect(r.telemetry.candidates).toBe(2);
    expect(r.telemetry.hits).toBe(r.hits.length);
    expect(r.telemetry.topScore).toBe(Number(r.hits[0]!.score.toFixed(2)));
  });

  it("reports candidates even when nothing clears the threshold", () => {
    const docs = [doc({ id: "a", body: "một chủ đề hoàn toàn khác" })];
    const r = retrieveKnowledge("connection pooling backoff", docs, { minScore: MIN_GROUNDING_SCORE });
    expect(r.grounded).toBe(false);
    expect(r.telemetry.candidates).toBe(1);
    expect(r.telemetry.hits).toBe(0);
  });
});

/**
 * Regression coverage for the roadmap corpus.
 *
 * The original roadmap builder repeated the roadmap title and
 * description inside every module document. With 23 modules,
 * that put "payment" into all 23 docs, its IDF collapsed to ~0,
 * and a correct match scored ~0.08 — under MIN_GROUNDING_SCORE —
 * so retrieval returned nothing and the frame reported "no
 * information".
 *
 * The fix lives in doc-render.ts: roadmap-wide prose now exists
 * in exactly ONE document. These tests pin the scoring
 * consequence of that shape.
 */
describe("roadmap corpus shape", () => {
  /** One overview doc + 23 module docs; "payment" only in the overview. */
  function roadmapCorpus(): KnowledgeDoc[] {
    const docs: KnowledgeDoc[] = [
      // The single doc that carries roadmap-level prose.
      doc({
        id: "overview",
        kind: "ROADMAP",
        body:
          "# CV-Driven Backend Roadmap\nReconstruct the payment project into a mental model.\nPhases:\n- PH0 — Project reconstruction\n- PH1 — Payment reliability",
      }),
    ];
    for (let i = 0; i < 23; i++) {
      docs.push(
        doc({
          id: `m${i}`,
          kind: "ROADMAP",
          // No roadmap description here — that is the fix.
          body: `## Track: PH${i}\nTrack summary for phase ${i}.\n### Module: Module ${i}`,
        }),
      );
    }
    // The one module that actually answers "what is payment reliability".
    // Overwrite by id, not by index: the overview shifted every position.
    const at = docs.findIndex((d) => d.id === "m4");
    docs[at] = doc({
      id: "m4",
      kind: "ROADMAP",
      body:
        "## Track: PH1 — Payment reliability\nPayment reliability: duplicate charge, idempotency key, transaction boundary.\n### Module: Core\n- PAY-01 | Idempotency | BACKLOG",
    });
    return docs;
  }

  it("a module doc whose summary carries the phase ranks above the overview", () => {
    const r = retrieveKnowledge("payment reliability", roadmapCorpus());
    expect(r.grounded).toBe(true);
    // m4 states "payment reliability" twice in its own summary;
    // the overview carries each term once (phase list) or twice
    // (description + phase list). The topical home must win.
    expect(r.hits[0]?.doc.id).toBe("m4");
  });

  it("a roadmap-wide question still finds the overview", () => {
    const r = retrieveKnowledge("reconstruct payment project", roadmapCorpus());
    expect(r.grounded).toBe(true);
    expect(r.hits[0]?.doc.id).toBe("overview");
  });

  it("terms absent from every document still fail closed", () => {
    const r = retrieveKnowledge("banana xylophone", roadmapCorpus());
    expect(r.grounded).toBe(false);
    expect(r.hits).toEqual([]);
  });
});
