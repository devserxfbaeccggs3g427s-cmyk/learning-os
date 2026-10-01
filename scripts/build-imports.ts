/**
 * Build roadmap-import.json + schedule-import.json from the two source
 * markdown documents. Output schema matches lib/ai/schemas.ts
 * (RoadmapImportSchema + ScheduleImportSchema).
 *
 * Run: tsx scripts/build-imports.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ROADMAP_MD = "CV-Driven-Backend-Roadmap-Nguyen-Quang-Ngoc.md";
const SCHEDULE_MD = "Daily-Execution-Plan-05-10-2026.md";
const OUT_DIR = "data";

const roadmap = readFileSync(ROADMAP_MD, "utf8");
const schedule = readFileSync(SCHEDULE_MD, "utf8");

mkdirSync(OUT_DIR, { recursive: true });

// ============================================================================
// ROADMAP PARSING
// ============================================================================

type Task = {
  code: string;
  title: string;
  description?: string;
  relatedProject?: string;
  relatedCvClaim?: string;
  whyThisMatters?: string;
  prerequisites: string[];
  concepts: string[];
  deepDiveSubtopics: string[];
  internalsToUnderstand: string[];
  failureScenarios: Array<{ id?: string; title: string; body: string }>;
  productionQuestions: string[];
  interviewQuestions: string[];
  handsOnLab?: string;
  expectedOutput?: string;
  definitionOfDone?: string;
  status: string;
  priority: "P0" | "P1" | "P2" | "P3";
  difficulty: "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SENIOR";
  estimatedMinutes: number;
  dependencies: string[];
  tags: string[];
  hierarchy: string;
  /** Section kind: TASK (149), LAB (24), INC (24) — determines defaults */
  kind: "TASK" | "LAB" | "INC";
};

const tasks: Task[] = [];

// ---- Task cards (### TASK-ID — Title) ----
// Match: line that starts with "### " and has "ID — Title"
const TASK_CARD_RE = /^###\s+([A-Z]{2,5}-\d+)\s+—\s+(.+?)\s*$/;
for (const line of roadmap.split("\n")) {
  const m = TASK_CARD_RE.exec(line);
  if (!m) continue;
  tasks.push({
    code: m[1]!,
    title: m[2]!.trim(),
    prerequisites: [],
    concepts: [],
    deepDiveSubtopics: [],
    internalsToUnderstand: [],
    failureScenarios: [],
    productionQuestions: [],
    interviewQuestions: [],
    status: "BACKLOG",
    priority: "P2",
    difficulty: "INTERMEDIATE",
    estimatedMinutes: 60,
    dependencies: [],
    tags: [],
    hierarchy: "",
    kind: "TASK",
  });
}

// Helper: extract field value from the lines AFTER a task header.
// The actual source format is bullet-list:
//   - **FIELD:** value
//   - **NEXT FIELD:** value
// (no blank lines between fields), so we stop at the next `- **UPPER_FIELD**`
// pattern OR ### / ## / end-of-string.
function extractField(cardBody: string, field: string): string | undefined {
  const safeField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Lookahead: `\n` then optional whitespace then `**` then uppercase letter.
  const re = new RegExp(
    `\\*\\*${safeField}:\\*\\*\\s*(.+?)(?=\\n\\s*-?\\s*\\*\\*[A-Z]|\n###|\n##|$)`,
    "s",
  );
  const m = cardBody.match(re);
  return m?.[1]?.trim();
}

function extractList(cardBody: string, field: string): string[] {
  // For fields like INTERVIEW QUESTIONS that contain a list of L1..L7 lines.
  const v = extractField(cardBody, field);
  if (!v) return [];
  return v
    .split("\n")
    .map((l) => l.replace(/^[\s\-•*]+\d*\.?\s*/, "").trim())
    .filter((l) => l && !l.startsWith("**"));
}

function extractBullets(cardBody: string, field: string): string[] {
  const v = extractField(cardBody, field);
  if (!v) return [];
  return v
    .split("\n")
    .map((l) => l.replace(/^[\s\-•*]+/, "").trim())
    .filter((l) => l && !l.startsWith("**"));
}

function extractNumberedList(cardBody: string, field: string): string[] {
  const v = extractField(cardBody, field);
  if (!v) return [];
  return v
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((l) => l && !l.startsWith("**"));
}

// Now enrich each task with body parsing
function enrichTask(t: Task) {
  // Card body = text from "### TASK-ID —" up to next ### / ## / end
  const idx = roadmap.indexOf(`### ${t.code} — `);
  if (idx < 0) return;
  const after = roadmap.slice(idx);
  const endMatch = after.slice(20).search(/\n###\s+[A-Z]{2,5}-\d+\s+—|\n##\s/);
  const body = endMatch < 0 ? after : after.slice(0, endMatch + 20);

  const hierarchy = extractField(body, "HIERARCHY") ?? "";
  t.hierarchy = hierarchy;

  t.description = extractField(body, "WHY THIS MATTERS")?.slice(0, 400) ?? "";
  t.relatedProject = extractField(body, "RELATED PROJECT") ?? "";
  t.relatedCvClaim = extractField(body, "RELATED CV CLAIM") ?? "";
  t.whyThisMatters = extractField(body, "WHY THIS MATTERS") ?? "";
  t.prerequisites = extractBullets(body, "PREREQUISITES");
  t.concepts = extractBullets(body, "CONCEPTS");
  t.deepDiveSubtopics = extractNumberedList(body, "DEEP-DIVE SUBTOPICS / SUBTASKS");
  t.internalsToUnderstand = extractBullets(body, "INTERNALS TO UNDERSTAND");
  t.failureScenarios = (() => {
    const v = extractField(body, "FAILURE SCENARIOS") ?? "";
    if (!v) return [];
    // Source format is usually one long paragraph (no blank lines). Take the
    // first sentence as the scenario title, the full text as body.
    const sentenceSplit = v.split(/(?<=[.!?])\s+(?=[A-ZÀ-ỹ])/);
    const first = sentenceSplit[0] ?? v;
    return [
      {
        id: `${t.code}-F01`,
        title: first.slice(0, 100),
        body: v,
      },
    ];
  })();
  t.productionQuestions = extractBullets(body, "PRODUCTION QUESTIONS");
  t.interviewQuestions = extractList(body, "INTERVIEW QUESTIONS");
  t.handsOnLab = extractField(body, "HANDS-ON LAB");
  t.expectedOutput = extractField(body, "EXPECTED OUTPUT");
  t.definitionOfDone = extractField(body, "DEFINITION OF DONE");

  // Estimated time: extract "Total Xh"
  const total = (body.match(/Total\s+(\d+(?:\.\d+)?)h/i)?.[1]) ?? "1";
  t.estimatedMinutes = Math.round(parseFloat(total) * 60);

  const diff = (extractField(body, "DIFFICULTY") ?? "").toLowerCase();
  t.difficulty =
    diff.includes("deep dive") || diff.includes("senior")
      ? "SENIOR"
      : diff.includes("advanced")
        ? "ADVANCED"
        : diff.includes("basic")
          ? "BASIC"
          : "INTERMEDIATE";

  const pri = (extractField(body, "PRIORITY") ?? "").toUpperCase();
  t.priority = (["P0", "P1", "P2", "P3"] as const).find((p) => pri.includes(p)) ?? "P2";

  const deps = extractField(body, "DEPENDENCIES") ?? "";
  // Extract tokens like "TASK-01", "DB-02"
  t.dependencies = Array.from(deps.matchAll(/\b([A-Z]{2,5}-\d{2})\b/g))
    .map((m) => m[1]!)
    .filter((d, i, a) => a.indexOf(d) === i && d !== t.code);

  // Tags from hierarchy Track letters
  const trackMatch = hierarchy.match(/Track\s+([A-Z](?:\/[A-Z])*)/);
  const tags: string[] = [];
  if (trackMatch) {
    for (const letter of trackMatch[1]!.split("/")) {
      tags.push(`track-${letter.toLowerCase()}`);
    }
  }
  const phMatch = hierarchy.match(/PH(\d)/);
  if (phMatch) tags.push(`phase-${phMatch[1]}`);
  t.tags = tags;

  t.kind = t.code.startsWith("LAB-") ? "LAB" : t.code.startsWith("INC-") ? "INC" : "TASK";
  if (t.kind !== "TASK") {
    t.status = "BACKLOG";
    t.priority = t.code.startsWith("INC-") ? "P1" : "P2";
  }
}

for (const t of tasks) enrichTask(t);

// ---- System design (from §15 table) ----
// Each SD row has: | SD-NN | requirement | Dependencies | Acceptance |
// Add as tasks with kind=SD so they show up in the roadmap.
type SD = { id: string; title: string; dependencies: string[]; acceptance: string };
const sds: SD[] = [];
const sdTableRE = /^\|\s*(SD-\d{2})\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*$/;
const sdSectionStart = roadmap.indexOf("## 15. SYSTEM DESIGN BACKLOG");
const sdSectionEnd = sdSectionStart > 0 ? roadmap.indexOf("\n## ", sdSectionStart + 10) : -1;
if (sdSectionStart > 0) {
  const section = sdSectionEnd > 0 ? roadmap.slice(sdSectionStart, sdSectionEnd) : roadmap.slice(sdSectionStart);
  for (const line of section.split("\n")) {
    const m = sdTableRE.exec(line);
    if (!m) continue;
    const deps = Array.from(m[3]!.matchAll(/\b([A-Z]{2,5}-\d{2})\b/g)).map((x) => x[1]!);
    sds.push({ id: m[1]!, title: m[2]!.trim(), dependencies: Array.from(new Set(deps)), acceptance: m[4]!.trim() });
  }
}

// ---- Failure scenarios (#### GOV-Fxx) ----
// Already captured under PAY/GOV tasks via t.failureScenarios — but the doc
// also has standalone GOV-Fxx cards. We synthesize one task per family that
// covers the matrix.
const govFs: Array<{ id: string; title: string; taskCode: string }> = [];
for (const line of roadmap.split("\n")) {
  const m = /^####\s+(GOV-F\d{2})\b/.exec(line);
  if (m) govFs.push({ id: m[1]!, title: line.replace(/^####\s+/, "").trim(), taskCode: "PAY-01" });
}

// ---- Build hierarchy: PH → Track (letter) → Module (narrative) → Task ----

type Module = { title: string; tasks: Task[] };
type Track = { title: string; letter: string; phase: string; modules: Module[] };
type Phase = { code: string; title: string; tracks: Track[] };

const phaseTitleMap: Record<string, string> = {
  PH0: "PH0 — Project reconstruction",
  PH1: "PH1 — Identity, locking, crash, bank unknown",
  PH2: "PH2 — SAHA session/OTP/transfer",
  PH3: "PH3 — Kafka/Outbox/CMV",
  PH4: "PH4 — Debit gateway & workflow",
  PH5: "PH5 — Java/Spring/ORM/JVM/observability",
  PH6: "PH6 — Incidents, K8s/CI",
  PH7: "PH7 — System design defense",
};
const trackTitleMap: Record<string, string> = {
  A: "Idempotency & Duplicate Prevention",
  B: "SQL Lock & Transaction",
  C: "Crash & Restart",
  D: "Kafka & Outbox",
  F: "Bank Unknown Result",
  G: "OTP & Session Security",
  H: "EBANK Core Banking / Stored Procedures",
  I: "DEBIT Gateway & Asset",
  J: "GOV Service Layer & Retry",
  K: "GOV Payment & Idempotency",
  L: "JVM Concurrency & Tuning",
  M: "Kafka EDA Pipeline (CMV)",
  N: "Production Incidents",
  O: "Java Language",
  P: "Spring Framework",
};

// group by phase / track letter / module-narrative
const moduleByKey: Record<string, Module> = {};
const trackOrder = new Map<string, number>();
const phaseOrder = new Map<string, number>();
const phaseMap: Record<string, Phase> = {};

function getOrCreatePhase(code: string): Phase {
  if (!phaseMap[code]) {
    phaseMap[code] = { code, title: phaseTitleMap[code] ?? code, tracks: [] };
    phaseOrder.set(code, phaseOrder.size);
  }
  return phaseMap[code]!;
}

function getOrCreateTrack(phase: Phase, letter: string): Track {
  let t = phase.tracks.find((t) => t.letter === letter);
  if (!t) {
    t = {
      title: trackTitleMap[letter] ?? `Track ${letter}`,
      letter,
      phase: phase.code,
      modules: [],
    };
    phase.tracks.push(t);
    trackOrder.set(`${phase.code}-${letter}`, trackOrder.size);
  }
  return t;
}

function moduleKey(track: string, moduleTitle: string): string {
  return `${track}::${moduleTitle}`;
}

function deriveModuleTitle(hierarchy: string): string {
  // "ROADMAP → PH0 → Track K/J → Module Project reconstruction → ..."
  const m = hierarchy.match(/Module\s+(.+?)\s*→/);
  return m?.[1]?.trim() ?? "General";
}

for (const t of tasks) {
  let phMatch = t.hierarchy.match(/PH(\d)/);
  let trMatch = t.hierarchy.match(/Track\s+([A-Z](?:\/[A-Z])*)/);

  // LAB and INC tasks have no HIERARCHY field — synthesize placement.
  if (!phMatch) {
    if (t.kind === "LAB") {
      t.hierarchy = `ROADMAP → PH5 → Track M → Module Hands-on labs tổng hợp → ${t.code}`;
    } else if (t.kind === "INC") {
      t.hierarchy = `ROADMAP → PH6 → Track N → Module Production incident drills → ${t.code}`;
    } else {
      // generic fallback — dump into PH5 Track M so nothing is lost
      t.hierarchy = `ROADMAP → PH5 → Track M → Module General → ${t.code}`;
    }
    phMatch = t.hierarchy.match(/PH(\d)/);
    trMatch = t.hierarchy.match(/Track\s+([A-Z](?:\/[A-Z])*)/);
  }
  if (!phMatch) continue;
  const phase = getOrCreatePhase(`PH${phMatch[1]}`);
  const letter = trMatch?.[1]?.split("/")[0] ?? "X";
  const track = getOrCreateTrack(phase, letter);
  const moduleTitle = deriveModuleTitle(t.hierarchy);
  const key = moduleKey(track.letter, moduleTitle);
  if (!moduleByKey[key]) {
    moduleByKey[key] = { title: moduleTitle, tasks: [] };
    track.modules.push(moduleByKey[key]!);
  }
  moduleByKey[key]!.tasks.push(t);
}

// Append SD entries as a synthetic "PH7 / Track A" capstone track.
const ph7 = getOrCreatePhase("PH7");
const sdTrack = getOrCreateTrack(ph7, "A");
const sdModule: Module = { title: "System design defense", tasks: [] };
sdTrack.modules.push(sdModule);
for (const sd of sds) {
  const t: Task = {
    code: sd.id,
    title: sd.title,
    description: sd.acceptance,
    relatedProject: "System Design",
    whyThisMatters: "Capstone defense — full system design under stress scenarios.",
    prerequisites: [],
    concepts: ["system design", "scale", "trade-offs"],
    deepDiveSubtopics: [],
    internalsToUnderstand: [],
    failureScenarios: [],
    productionQuestions: [],
    interviewQuestions: [],
    handsOnLab: undefined,
    expectedOutput: sd.acceptance,
    definitionOfDone: "Draw 7 component diagrams; predict vs observe table; ADR per stress dimension.",
    status: "BACKLOG",
    priority: "P0",
    difficulty: "SENIOR",
    estimatedMinutes: 240,
    dependencies: sd.dependencies,
    tags: ["phase-7", "system-design", `track-${sdTrack.letter.toLowerCase()}`],
    hierarchy: `ROADMAP → PH7 → Track ${sdTrack.letter} → Module System design defense → ${sd.id}`,
    kind: "TASK",
  };
  sdModule.tasks.push(t);
}

// Order phases/tracks/modules/tasks deterministically
const phases = Object.values(phaseMap).sort(
  (a, b) => (phaseOrder.get(a.code) ?? 0) - (phaseOrder.get(b.code) ?? 0),
);
for (const ph of phases) {
  ph.tracks.sort((a, b) => (trackOrder.get(`${ph.code}-${a.letter}`) ?? 0) - (trackOrder.get(`${ph.code}-${b.letter}`) ?? 0));
}

// Convert to RoadmapImportSchema
function toImportTask(t: Task) {
  return {
    code: t.code,
    title: t.title,
    description: t.description || undefined,
    relatedProject: t.relatedProject || undefined,
    relatedCvClaim: t.relatedCvClaim || undefined,
    whyThisMatters: t.whyThisMatters || undefined,
    prerequisites: t.prerequisites,
    concepts: t.concepts,
    deepDiveSubtopics: t.deepDiveSubtopics,
    internalsToUnderstand: t.internalsToUnderstand,
    failureScenarios: t.failureScenarios,
    productionQuestions: t.productionQuestions,
    interviewQuestions: t.interviewQuestions,
    handsOnLab: t.handsOnLab,
    expectedOutput: t.expectedOutput,
    definitionOfDone: t.definitionOfDone,
    status: t.status,
    priority: t.priority,
    difficulty: t.difficulty,
    estimatedMinutes: t.estimatedMinutes,
    dependencies: t.dependencies,
    tags: t.tags,
  };
}

const roadmapImport = {
  schemaVersion: 1,
  title: "Backend Engineering — CV-Driven",
  description:
    "Imported từ CV-Driven-Backend-Roadmap-Nguyen-Quang-Ngoc.md (149 task cards + 24 LAB + 24 INC + 8 SD). Hệ thống giữ nguyên task IDs, nội dung, giờ học. Mọi state/scenario hypothetical vẫn là hypothetical.",
  startDate: "2026-10-05",
  targetEndDate: "2027-12-22",
  tracks: phases.map((ph) => ({
    title: ph.title,
    summary: `Phase ${ph.code.replace("PH", "")} track group`,
    color: ph.code === "PH7" ? "#8b5cf6" : undefined,
    modules: ph.tracks.map((tr) => ({
      title: `${tr.title} [${tr.letter}]`,
      summary: `Track ${tr.letter} trong ${ph.title}`,
      tasks: tr.modules.flatMap((mo) => mo.tasks.map(toImportTask)),
    })),
  })),
};

writeFileSync(`${OUT_DIR}/roadmap-import.json`, JSON.stringify(roadmapImport, null, 2));
console.log(
  `[roadmap] wrote ${OUT_DIR}/roadmap-import.json: ${phases.length} phases, ${phases.reduce((a, p) => a + p.tracks.length, 0)} tracks, ${tasks.length + sds.length} tasks`,
);

// ============================================================================
// SCHEDULE PARSING
// ============================================================================

type Block = {
  type: "LEARN" | "DEEP_DIVE" | "LAB" | "FAILURE_DRILL" | "INTERVIEW" | "REVIEW" | "SYSTEM_DESIGN" | "DEBUG_DRILL" | "RECALL";
  taskCode: string | null;
  blockId: string;
  title: string;
  objective: string;
  startMinute: number;
  durationMinutes: number;
  deliverable: string;
};

type Day = {
  date: string; // DD/MM/YYYY
  isoDate: string; // YYYY-MM-DD
  objective: string;
  blocks: Block[];
};

const TYPE_MAP: Record<string, Block["type"]> = {
  "📖 LEARN": "LEARN",
  "🔬 DEEP DIVE": "DEEP_DIVE",
  "💻 LAB": "LAB",
  "💥 FAILURE DRILL": "FAILURE_DRILL",
  "🎤 INTERVIEW": "INTERVIEW",
  "🔁 REVIEW": "REVIEW",
  "🧠 SYSTEM DESIGN": "SYSTEM_DESIGN",
  "🐞 DEBUG DRILL": "DEBUG_DRILL",
  "🔁 RECALL": "RECALL",
};

function parseTime(time: string): number {
  // "20:05" → 20*60+5
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return 0;
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

function parseDuration(s: string): number {
  // "60m" or "1h"
  const m = /^(\d+)([hm])$/.exec(s.trim());
  if (!m) return 15;
  const n = parseInt(m[1]!, 10);
  return m[2] === "h" ? n * 60 : n;
}

function toIsoDate(ddmmyyyy: string): string {
  const [dd2, mn, y] = ddmmyyyy.split("/");
  return `${y}-${mn}-${dd2}`;
}

const DAY_HEADER_RE = /^##\s+DAY\s+(\d+)\s+—\s+[^-]+—\s+(\d{1,2}\/\d{1,2}\/\d{4})/;
const BLOCK_ROW_RE = /^\|\s*(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})\s*\|\s*(\d+[hm])\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/;

const days: Day[] = [];

let iLine = 0;
const lines = schedule.split("\n");
while (iLine < lines.length) {
  const line = lines[iLine]!;
  const m = DAY_HEADER_RE.exec(line);
  if (!m) {
    iLine++;
    continue;
  }
  const dayDate = m[2]!;
  const isoDate = toIsoDate(dayDate);

  // scan until next ## DAY or ## ... or end
  const blocks: Block[] = [];
  let objective = "";
  let inObjective = false;
  let objectiveStarted = false;
  for (let j = iLine + 1; j < lines.length; j++) {
    const l = lines[j] ?? "";
    if (/^##\s+DAY\s+\d+/.test(l) || /^##\s+/.test(l)) break;

    if (/^###\s+Daily Objective/.test(l)) {
      inObjective = true;
      objectiveStarted = true;
      continue;
    }
    // End of "objective" section: next heading OR the markdown table OR a bold-only line.
    if (
      inObjective &&
      (/^###\s+/.test(l) ||
        l.trim().startsWith("|") ||
        l.trim().startsWith("**Giờ nghỉ") ||
        l.trim().startsWith("**Buổi ngừng") ||
        /^---+$/.test(l.trim()))
    ) {
      inObjective = false;
    }
    if (inObjective && l.trim() && !l.startsWith("#")) {
      objective += (objective ? " " : "") + l.trim();
    }
    // Once we encounter the table or buffer note, we've definitively left the
    // objective section — stop accumulating even if a stray sub-heading
    // is missing. (The first sub-heading after Daily Objective in the source
    // is always one of: ### End-of-Day Checkpoint / ### Block-by-block plan
    //  / the table itself.)
    if (objectiveStarted && (l.trim().startsWith("|") || l.trim().startsWith("**Giờ"))) {
      objectiveStarted = false;
      inObjective = false;
    }

    const blockMatch = BLOCK_ROW_RE.exec(l);
    if (!blockMatch) continue;
    const [, startStr, endStr, durStr, typeRaw, taskIdCell, work, scope, deliverable] = blockMatch;
    const startMin = parseTime(startStr ?? "");
    const dur = parseDuration(durStr ?? "");
    // task ID cell format: "TASK-CODE / Bxxxx"
    const taskCodeMatch = /^([A-Z]{2,5}-\d{2})\s*\/\s*(B\d{4})/.exec((taskIdCell ?? "").trim());
    if (!taskCodeMatch) continue; // skip rows without a task code
    const taskCode = taskCodeMatch[1] ?? "";
    const blockId = taskCodeMatch[2]!;

    // Type cell is emoji + label
    let typeNorm: Block["type"] | null = null;
    for (const [k, v] of Object.entries(TYPE_MAP)) {
      if (typeRaw!.includes(k)) {
        typeNorm = v;
        break;
      }
    }
    if (!typeNorm) continue;

    blocks.push({
      type: typeNorm,
      taskCode,
      blockId,
      title: work!.trim(),
      objective: scope!.trim(),
      startMinute: startMin,
      durationMinutes: dur,
      deliverable: deliverable!.trim(),
    });
  }
  if (blocks.length > 0) {
    days.push({ date: dayDate, isoDate, objective, blocks });
  }
  iLine++;
}

// Output one JSON per day (otherwise the file would be massive — ~2700 blocks in one doc).
// The ScheduleImportSchema accepts one day at a time so the user can paste in chunks.
mkdirSync(`${OUT_DIR}/schedule`, { recursive: true });

// Also write a combined "index" file with all days for bulk-import reference.
const indexPath = `${OUT_DIR}/schedule-index.json`;
writeFileSync(
  indexPath,
  JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sourceFile: SCHEDULE_MD,
      dayCount: days.length,
      blockCount: days.reduce((a, d) => a + d.blocks.length, 0),
      dateRange: { start: days[0]?.isoDate, end: days[days.length - 1]?.isoDate },
      days: days.map((d) => ({
        date: d.isoDate,
        blockCount: d.blocks.length,
        objective: d.objective.slice(0, 200),
      })),
    },
    null,
    2,
  ),
);

// Emit one schedule import file per day. Naming: schedule-YYYY-MM-DD.json
let emittedCount = 0;
for (const day of days) {
  const file = `${OUT_DIR}/schedule/${day.isoDate}.json`;
  const payload = {
    schemaVersion: 1,
    date: day.isoDate,
    objective: day.objective,
    blocks: day.blocks.map((b) => ({
      taskCode: b.taskCode,
      type: b.type,
      title: b.title,
      objective: b.objective,
      startMinute: b.startMinute,
      durationMinutes: b.durationMinutes,
      deliverable: b.deliverable,
    })),
  };
  writeFileSync(file, JSON.stringify(payload, null, 2));
  emittedCount++;
}

// Also emit one big "bulk" file with all days wrapped in `{days: [...]}`.
// Post to /api/schedule/import-batch to import everything at once.
const bulkPayload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceFile: SCHEDULE_MD,
  days: days.map((d) => ({
    schemaVersion: 1,
    date: d.isoDate,
    objective: d.objective,
    blocks: d.blocks.map((b) => ({
      taskCode: b.taskCode,
      type: b.type,
      title: b.title,
      objective: b.objective,
      startMinute: b.startMinute,
      durationMinutes: b.durationMinutes,
      deliverable: b.deliverable,
    })),
  })),
};
const bulkPath = `${OUT_DIR}/schedule-bulk.json`;
writeFileSync(bulkPath, JSON.stringify(bulkPayload, null, 2));

console.log(
  `[schedule] wrote ${OUT_DIR}/schedule-index.json (${days.length} days, ${days.reduce((a, d) => a + d.blocks.length, 0)} blocks)`,
);
console.log(`[schedule] wrote ${OUT_DIR}/schedule-bulk.json — single bulk file for /api/schedule/import-batch`);
console.log(
  `[schedule] wrote ${emittedCount} per-day files in ${OUT_DIR}/schedule/`,
);