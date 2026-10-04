/**
 * Frame knowledge retrieval — pure, dependency-free BM25 over the
 * user's OWN stored content.
 *
 * This module deliberately knows nothing about tasks, roadmaps, routes,
 * or screens. It scores documents that were handed to it; a separate
 * (DB-touching) module decides which documents are in scope, keyed on
 * `userId` and the frame's explicit `knowledgeMode`. That split is what
 * makes "no automatic task/roadmap context" enforceable rather than
 * aspirational — see `tests/frame-isolation.test.ts`, which fails the
 * build if anything under `lib/ai/frame/` imports the task context
 * builders.
 *
 * BM25 (Robertson/Sparck-Jones) with the standard k1/b parameters:
 *   score(D, Q) = Σ  idf(q) · (f(q,D)·(k1+1)) / (f(q,D) + k1·(1−b+b·|D|/avgdl))
 *
 * Vietnamese-friendly tokenisation: NFD diacritic folding so "cong nghe"
 * matches "công nghệ", plus a small EN/VI stopword set.
 */

/** BM25 term-frequency saturation. 1.2–2.0 is the conventional range. */
export const BM25_K1 = 1.5;
/** BM25 length normalisation. 0.75 is the standard default. */
export const BM25_B = 0.75;
/**
 * Score bonus for an exact task-code match (e.g. the query "PAY-01"
 * matching a document whose code is "PAY-01"). Without this, short codes
 * are swamped by long natural-language tokens; with it, "what is PAY-01?"
 * resolves even when the user never mentions the task by name.
 */
export const CODE_MATCH_BOOST = 3.0;

/** Max characters of retrieved material injected into one turn. */
export const DEFAULT_RETRIEVAL_BUDGET_CHARS = 4_000;
/** Max documents considered in one turn. */
export const DEFAULT_TOP_K = 6;
/**
 * Minimum score for a hit to count as grounded. Below this we report
 * "no matching material" rather than feeding near-noise to the model.
 *
 * This is absolute on purpose. It works only while the corpus keeps
 * terms discriminative: a term present in EVERY document has an IDF of
 * ~0 and can never clear any floor, however correct the match. That is
 * a property of the corpus, not of the threshold — so the fix is to
 * stop repeating shared text across documents (see
 * `doc-render.ts`), never to loosen the floor to compensate. A
 * relative floor would let any token that appears anywhere look
 * grounded, which is precisely the failure this gate exists to stop.
 */
export const MIN_GROUNDING_SCORE = 0.35;

/** One retrievable document. */
export interface KnowledgeDoc {
  /** Stable id, surfaced to the model for citation. */
  id: string;
  /** Human label shown in grounding chips, e.g. "NOTE · c8". */
  label: string;
  /** Where it came from. Display-only; never used to build context. */
  kind: "NOTE" | "TASK" | "ROADMAP" | "SNIPPET" | "SCHEDULE";
  /** Task code if this doc belongs to a task — used for the code boost. */
  code?: string | null;
  title?: string;
  /** Full searchable text. */
  body: string;
}

/** A scored, returned document. */
export interface KnowledgeHit {
  doc: KnowledgeDoc;
  score: number;
  /** Terms that actually matched — used to render an explanation. */
  matchedTerms: string[];
}

/**
 * Vietnamese/English stopwords. Deliberately small: aggressive stopword
 * lists hurt short technical queries, and this one only removes words
 * that carry no discriminative signal in this app's domain.
 *
 * Written with diacritics for readability, then folded below — tokens
 * are diacritic-folded by {@link tokenize}, so an unfolded set would
 * never match a single Vietnamese word.
 */
const RAW_STOPWORDS = [
  // English
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "was", "were",
  "be", "been", "it", "its", "this", "that", "these", "those", "for", "on",
  "with", "as", "at", "by", "from", "what", "how", "why", "when", "where",
  "which", "who", "do", "does", "did", "can", "should", "would", "will",
  // Vietnamese
  "của", "là", "và", "các", "những", "một", "cho", "với", "trong", "ngoài",
  "như", "này", "đó", "khi", "để", "được", "về", "của", "từ", "ra", "vào",
  "có", "không", "gì", "nào", "tại", "sau", "trước", "thì", "mà", "nếu",
  "tôi", "bạn", "chúng", "anh", "em",
];

const STOPWORDS = new Set(RAW_STOPWORDS.map((w) => fold(w)));

/**
 * Lowercase and strip diacritics. Shared by {@link tokenize} and the
 * stopword set so both sides of the comparison use the same alphabet.
 */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Split text into normalised search tokens.
 *
 * NFD + combining-mark strip is what makes this work for Vietnamese:
 * "Tối ưu" → "toi uu", so a query typed without diacritics still hits
 * notes written with them. Keeping `.`, `#`, `+` inside tokens preserves
 * technical identifiers like "c++", ".net" and "redis.sentinel".
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const folded = fold(text);
  return folded
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^[.#]+|[.#]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Term-frequency map for one document. */
function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/**
 * Pull code-like spans out of the RAW query: runs of alphanumerics joined
 * by single `-`, `+` or `.` separators, so `pay-01` and `c8` survive whole.
 *
 * This exists because `tokenize` splits on those very separators —
 * `PAY-01` tokenizes to `pay`,`01`. Testing the code boost against the
 * token stream therefore never matched a hyphenated code, leaving
 * `CODE_MATCH_BOOST` dead for every real code in the app. The bare
 * fragments (`pay`,`01`) match dozens of unrelated tasks and BM25 then
 * ranks by raw term frequency: querying `PAY-01` returned SD-01 above
 * PAY-01 itself.
 */
function codeCandidates(query: string): string[] {
  return fold(query).match(/[a-z0-9]+(?:[-+.][a-z0-9]+)*/g) ?? [];
}

/**
 * Escape LIKE wildcards so a user's `%` or `_` in a query can't widen
 * the match. Used by the SQL prefilter in the corpus builder; exported
 * because it is a pure function worth testing on its own.
 */
export function escapeLike(term: string): string {
  return term.replace(/([%_\\])/g, "\\$1");
}

/** Precomputed corpus statistics. */
interface CorpusStats {
  /** Document frequency per term across the corpus. */
  docFreq: Map<string, number>;
  /** Number of documents. */
  docCount: number;
  /** Mean document length in tokens — the `avgdl` of the BM25 formula. */
  avgDocLength: number;
}

function buildStats(docs: KnowledgeDoc[], tokenized: Map<string, string[]>): CorpusStats {
  const docFreq = new Map<string, number>();
  let totalLength = 0;

  for (const tokens of tokenized.values()) {
    totalLength += tokens.length;
    // Count each term once per document for document frequency.
    for (const term of new Set(tokens)) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  return {
    docFreq,
    docCount: docs.length,
    avgDocLength: docs.length > 0 ? totalLength / docs.length : 0,
  };
}

/**
 * Inverse document frequency with the standard BM25 `+1` smoothing:
 *   idf(q) = ln(1 + (N − df + 0.5) / (df + 0.5))
 * The `+1` keeps idf positive even for a term present in every document,
 * which prevents negative scores from appearing on common terms.
 */
function idf(term: string, stats: CorpusStats): number {
  const df = stats.docFreq.get(term) ?? 0;
  return Math.log(1 + (stats.docCount - df + 0.5) / (df + 0.5));
}

/**
 * Score `query` against `docs` and return the top `topK` hits above
 * `minScore`.
 *
 * `options.codeLookup` maps a lowercased task code to itself when the
 * corpus actually contains that code. The boost only fires on a real
 * code, so a query word that merely looks like a code isn't inflated.
 * Codes are matched against the RAW query via {@link codeCandidates},
 * not the token stream — see the note there on why that matters.
 */
export function scoreKnowledge(
  query: string,
  docs: KnowledgeDoc[],
  options: {
    topK?: number;
    minScore?: number;
    codeLookup?: Map<string, string>;
  } = {},
): KnowledgeHit[] {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const minScore = options.minScore ?? MIN_GROUNDING_SCORE;

  if (docs.length === 0) return [];
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const tokenized = new Map<string, string[]>();
  for (const doc of docs) tokenized.set(doc.id, tokenize(`${doc.title ?? ""} ${doc.body}`));
  const stats = buildStats(docs, tokenized);

  // Codes that actually exist in this corpus. Built from the docs
  // themselves so we never boost toward a code we have no content for.
  const corpusCodes = new Set(
    docs
      .map((d) => d.code)
      .filter((c): c is string => typeof c === "string" && c.length > 0)
      .map((c) => c.toLowerCase()),
  );

  const hits: KnowledgeHit[] = [];

  // Codes spelled out in the query, folded and separator-aware.
  // The BM25 pass above still runs on the split tokens; this
  // check restores what the split took away.
  const queryCodes = codeCandidates(query);

  for (const doc of docs) {
    const tokens = tokenized.get(doc.id)!;
    if (tokens.length === 0) continue;
    const tf = termFrequencies(tokens);
    const lengthNorm = BM25_K1 * (1 - BM25_B + (BM25_B * tokens.length) / (stats.avgDocLength || 1));

    let score = 0;
    const matched: string[] = [];

    for (const term of queryTokens) {
      const freq = tf.get(term);
      if (!freq) continue;
      score += idf(term, stats) * ((freq * (BM25_K1 + 1)) / (freq + lengthNorm));
      matched.push(term);
    }

    // Exact task-code hit. Guarded by `corpusCodes` so the boost tracks
    // real content rather than the shape of the query. `doc.code` is
    // absent on roadmap/snippet docs, so check it before dereferencing.
    const docCode = typeof doc.code === "string" && doc.code.length > 0 ? doc.code.toLowerCase() : null;
    if (
      docCode &&
      options.codeLookup &&
      corpusCodes.has(docCode) &&
      queryCodes.includes(docCode)
    ) {
      score += CODE_MATCH_BOOST;
      if (!matched.includes(docCode)) matched.push(docCode);
    }

    if (score >= minScore && matched.length > 0) {
      hits.push({ doc, score, matchedTerms: matched });
    }
  }

  return hits
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    .slice(0, topK);
}

/** Summary of what retrieval found — persisted in message metadata. */
export interface RetrievalTelemetry {
  candidates: number;
  hits: number;
  topScore: number;
}

/**
 * Run retrieval and return both the hits and the telemetry that explains
 * them. `grounded` is false when nothing cleared the score threshold —
 * that is the signal the chat route uses to run the no-answer protocol
 * instead of letting the model free-associate.
 */
export function retrieveKnowledge(
  query: string,
  docs: KnowledgeDoc[],
  options: { topK?: number; minScore?: number; codeLookup?: Map<string, string> } = {},
): { hits: KnowledgeHit[]; telemetry: RetrievalTelemetry; grounded: boolean } {
  const hits = scoreKnowledge(query, docs, options);
  const telemetry: RetrievalTelemetry = {
    candidates: docs.length,
    hits: hits.length,
    topScore: hits.length > 0 ? Number(hits[0]!.score.toFixed(2)) : 0,
  };
  return { hits, telemetry, grounded: hits.length > 0 };
}