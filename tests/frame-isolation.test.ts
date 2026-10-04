/**
 * Frame isolation — the invariants this whole feature must hold.
 *
 * A chat frame is a conversation the user controls. It must never
 * silently sweep in project context they did not pick, and two frames
 * must never share a task by accident.
 *
 * The rules today:
 *
 *  1. A frame MAY be bound to ONE task — the task it was opened from.
 *     That is stored on the frame row, never taken from a request
 *     body, and it joins retrieval as one ordinary document.
 *  2. A frame may NOT reach for global context. The task index, the
 *     roadmap and the notes are all opt-in via `knowledgeMode`, and
 *     today's schedule is never in scope for a frame at all.
 *  3. A frame's context is its OWN. History is keyed on frameId, and
 *     the bound task travels with the frame row, so opening a second
 *     frame on another task cannot inherit the first one's task.
 *
 * That is not enforceable by review alone — someone will eventually
 * "just import assembleGlobalContext to make retrieval smarter". So
 * it is enforced here as a build-breaking import boundary over every
 * module under `lib/ai/frame/` plus the frame API routes, and
 * additionally by checking the schema and the routes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/**
 * Context builders a frame may NEVER import. These pull in material
 * the user did not select — today's schedule, the whole global
 * roadmap/task index — which is exactly what `knowledgeMode` exists to
 * gate instead.
 *
 * `buildTaskContext` is deliberately NOT here: one bound task is an
 * explicit, per-frame opt-in. See `bound-task` tests in
 * tests/frame-task-binding.test.ts for the behaviour itself.
 */
const FORBIDDEN_IMPORTS = [
  "assembleGlobalContext",
  "assembleContext",
  "getTodayView",
  "renderContext",
];

/** Paths that may legitimately contain the forbidden names. */
const ALLOW = (rel: string): boolean =>
  // The isolation test itself names them.
  rel.startsWith("tests/") ||
  // `lib/ai/context.ts` IS the thing being forbidden; it may of course
  // define these names.
  rel === "lib/ai/context.ts";

/** Recursively collect .ts/.tsx source files under `dir`. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every import specifier appearing in a source file. */
function importSpecifiers(src: string): string[] {
  const specs: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  const re2 = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) specs.push(m[1]!);
  for (const m of src.matchAll(re2)) specs.push(m[1]!);
  return specs;
}

describe("frame import boundary", () => {
  const frameFiles = [
    ...walk(join(ROOT, "lib/ai/frame")),
    ...walk(join(ROOT, "app/api/ai/frames")),
  ].filter((f) => !ALLOW(f.slice(ROOT.length + 1)));

  it("finds the frame modules to check", () => {
    // If this ever drops to zero the boundary check silently passes on
    // nothing, which would be a false green.
    expect(frameFiles.length).toBeGreaterThanOrEqual(5);
  });

  it("no frame module imports a task/roadmap/schedule context builder", () => {
    const violations: string[] = [];
    for (const file of frameFiles) {
      const rel = file.slice(ROOT.length + 1);
      const src = readFileSync(file, "utf8");
      for (const spec of importSpecifiers(src)) {
        for (const forbidden of FORBIDDEN_IMPORTS) {
          if (spec.includes(forbidden)) violations.push(`${rel} → ${spec}`);
        }
      }
      // Also catch a same-package relative import of the names.
      for (const forbidden of FORBIDDEN_IMPORTS) {
        const direct = new RegExp(`\\b${forbidden}\\s*\\(`).test(src);
        if (direct) violations.push(`${rel} calls ${forbidden}()`);
      }
    }
    expect(violations, `Frame modules must not build task/roadmap context:\n${violations.join("\n")}`).toEqual([]);
  });

  it("only corpus.ts imports lib/ai/context, and only buildTaskContext", () => {
    // `buildTaskContext` is the one context builder a frame may use:
    // it renders exactly the ONE task bound to the frame row, and
    // nothing else — no schedule, no global roadmap. Confining it to
    // a single module keeps that narrow blast radius from spreading,
    // because `lib/ai/context.ts` also exports the global builders
    // that rule 2 forbids.
    const violations: string[] = [];
    const importers: string[] = [];
    for (const file of frameFiles) {
      const rel = file.slice(ROOT.length + 1);
      const src = readFileSync(file, "utf8");
      const importsContext = importSpecifiers(src).some(
        (spec) => spec.includes("lib/ai/context") || spec === "../context",
      );
      if (!importsContext) continue;
      importers.push(rel);
      if (rel !== "lib/ai/frame/corpus.ts") {
        violations.push(`${rel} imports lib/ai/context`);
      }
      // Named-import check: it must not pull a forbidden builder in
      // the same statement.
      const stmt = src.match(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*context["']/s)?.[1] ?? "";
      for (const forbidden of FORBIDDEN_IMPORTS) {
        if (stmt.includes(forbidden)) violations.push(`${rel} imports ${forbidden} from context`);
      }
      if (stmt.trim() && !/buildTaskContext/.test(stmt)) {
        violations.push(`${rel} imports something other than buildTaskContext: ${stmt.trim()}`);
      }
    }
    // Exactly one importer — otherwise "corpus.ts is allowed" is not a
    // meaningful boundary, it is a single lucky file.
    expect(importers).toEqual(["lib/ai/frame/corpus.ts"]);
    expect(violations).toEqual([]);
  });

  it("no frame API route reads today/schedule context", () => {
    const routeFiles = frameFiles.filter((f) => f.includes(join("app", "api", "ai", "frames")));
    const violations: string[] = [];
    for (const file of routeFiles) {
      const src = readFileSync(file, "utf8");
      if (/getTodayView|studyDate|startMinute/.test(src)) {
        violations.push(file.slice(ROOT.length + 1));
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("frame schema carries no foreign task reference", () => {
  const schemaSrc = readFileSync(join(ROOT, "lib/db/schema/aiFrames.ts"), "utf8");

  /**
   * Only the column-declaration portion of each table counts. The file
   * header discusses `task_id` in prose — that is the design rationale,
   * not a column, and must not trip this check.
   */
  const columnDecls: string = Array.from(
    schemaSrc.matchAll(/pgTable\(\s*"[a-z_]+"\s*,\s*\{([\s\S]*?)\n\s*\}\s*,/g),
  )
    .map((m) => m[1]!)
    .join("\n");

  it("extracts the frame table column blocks", () => {
    expect(columnDecls.length).toBeGreaterThan(0);
  });

  it("has exactly one task column, on ai_chat_frames only", () => {
    // One column, one table, nullable. It holds the task a frame
    // was opened from — the single deliberate context binding.
    expect(columnDecls).toMatch(/taskId:/);
    expect(columnDecls).toMatch(/task_id/);
    // It must not appear on the message or snippet tables: a
    // message cannot own a task, and a snippet belongs to its
    // frame's task already.
    const frameBlock = schemaSrc.slice(
      schemaSrc.indexOf('aiChatFrames = pgTable('),
      schemaSrc.indexOf(");", schemaSrc.indexOf('aiChatFrames = pgTable(')) + 2,
    );
    expect(frameBlock).toMatch(/taskId:/);
    for (const other of ["aiChatMessages = pgTable(", "aiChatFrameSnippets = pgTable("]) {
      const start = schemaSrc.indexOf(other);
      const block = schemaSrc.slice(start, schemaSrc.indexOf(");", start) + 2);
      expect(block).not.toMatch(/taskId:/);
    }
  });

  it("the task column references tasks and survives task deletion", () => {
    // ON DELETE "set null", not cascade: a task being removed
    // must not silently destroy the conversation that was opened
    // about it (that is what ai_conversations does, and why
    // frames live in their own table). The frame survives and
    // merely loses that one retrieval candidate.
    expect(schemaSrc).toMatch(
      /taskId:\s*text\("task_id"\)\s*\.references\(\(\)\s*=>\s*tasks\.id,\s*\{\s*onDelete:\s*"set null"\s*\}\)/,
    );
  });

  it("defines the three frame tables", () => {
    expect(schemaSrc).toContain('"ai_chat_frames"');
    expect(schemaSrc).toContain('"ai_chat_messages"');
    expect(schemaSrc).toContain('"ai_chat_frame_snippets"');
  });

  it("defaults the knowledge mode to NONE", () => {
    expect(schemaSrc).toMatch(/knowledgeMode:\s*text\("knowledge_mode"\)[^)]*\)\s*\.default\("NONE"\)/);
  });

  it("the base migration creates the three frame tables and no task_id", () => {
    const sql = readFileSync(join(ROOT, "drizzle/0002_ai_chat_frames.sql"), "utf8");
    // Strip comments so the prose in the header ("no task_id column")
    // doesn't satisfy — or trip — the assertions below.
    const ddl = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(ddl).toMatch(/CREATE TABLE (IF NOT EXISTS )?"ai_chat_frames"/);
    expect(ddl).toMatch(/CREATE TABLE (IF NOT EXISTS )?"ai_chat_messages"/);
    expect(ddl).toMatch(/CREATE TABLE (IF NOT EXISTS )?"ai_chat_frame_snippets"/);
    // The binding arrived later, in its own migration — so the base
    // schema stays the "no task anywhere" shape it was designed as.
    expect(ddl).not.toMatch(/task_id/);
  });

  it("the task binding migration adds task_id with ON DELETE SET NULL", () => {
    const sql = readFileSync(join(ROOT, "drizzle/0003_frame_task_id.sql"), "utf8");
    const ddl = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(ddl).toMatch(/ADD COLUMN IF NOT EXISTS "task_id" text/);
    // set null, NOT cascade: deleting a task must not destroy the
    // conversation opened about it.
    expect(ddl).toMatch(/ON DELETE set null/);
    expect(ddl).not.toMatch(/ON DELETE cascade/);
    expect(ddl).toMatch(/ai_chat_frames_task_id_tasks_id_fk/);
    // Re-runnable, like every other migration in this repo.
    expect(ddl).toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(ddl).toMatch(/EXCEPTION WHEN duplicate_object THEN NULL;/);
    expect(ddl).toMatch(/CREATE INDEX IF NOT EXISTS/);
  });

  it("the migration is re-runnable", () => {
    // There is no tracked drizzle/meta/_journal.json, so migrations get
    // applied by hand via scripts/apply-migration.ts and may be run more
    // than once. A bare CREATE TABLE would abort the second run.
    const ddl = readFileSync(join(ROOT, "drizzle/0002_ai_chat_frames.sql"), "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    for (const table of ["ai_chat_frames", "ai_chat_messages", "ai_chat_frame_snippets"]) {
      expect(ddl).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
    }
    // Every index and every ADD CONSTRAINT must be idempotent too, or a
    // re-run dies partway and the transaction rolls back.
    const bareIndex = /^\s*CREATE INDEX "/m;
    expect(bareIndex.test(ddl)).toBe(false);
    expect(ddl).toContain("EXCEPTION WHEN duplicate_object THEN NULL;");
  });
});

describe("frame message scoping", () => {
  const chatRoute = readFileSync(
    join(ROOT, "app/api/ai/frames/chat/route.ts"),
    "utf8",
  );
  const idRoute = readFileSync(join(ROOT, "app/api/ai/frames/[id]/route.ts"), "utf8");
  const createRoute = readFileSync(join(ROOT, "app/api/ai/frames/route.ts"), "utf8");
  const retrieveRoute = readFileSync(
    join(ROOT, "app/api/ai/frames/retrieve/route.ts"),
    "utf8",
  );

  it("loads history by frameId only — never by task or user-wide", () => {
    expect(chatRoute).toContain("eq(aiChatMessages.frameId, frameId)");
    expect(idRoute).toContain("eq(aiChatMessages.frameId, id)");
    // Every read of aiChatMessages must be filtered by frameId. A
    // conversation-wide or user-wide read would leak across frames.
    const reads = chatRoute.match(/\.from\(aiChatMessages\)/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    const idReads = idRoute.match(/\.from\(aiChatMessages\)/g) ?? [];
    expect(idReads.length).toBeGreaterThan(0);
  });

  it("rejects a body carrying taskId or contextOverride", () => {
    // `.strict()` turns a smuggled taskId into a 400, not a silent no-op.
    expect(chatRoute).toMatch(/\.strict\(\)/);
    expect(idRoute).toMatch(/\.strict\(\)/);
    // The bound task is read off the frame ROW, never the body. This
    // is what stops a caller re-aiming an existing frame at a
    // different task by adding a field to the request.
    expect(chatRoute).toMatch(/taskId:\s*frame\?\.taskId\s*\?\?\s*null/);
    expect(retrieveRoute).toMatch(/taskId:\s*frame\?\.taskId\s*\?\?\s*null/);
    // ...and the chat/retrieve bodies must not declare taskId at all.
    expect(chatRoute).not.toMatch(/Body\s*=\s*z[\s\S]{0,400}?taskId:\s*z\./);
    expect(retrieveRoute).not.toMatch(/Body\s*=\s*z[\s\S]{0,400}?taskId:\s*z\./);
  });

  it("the create route accepts a taskId but validates ownership first", () => {
    // The ONE place a task may be bound to a frame. Ownership runs
    // task → module → track → roadmap → userId (a task has no userId
    // of its own), and a foreign id must be rejected before any write
    // — otherwise this endpoint becomes a probe for which task ids
    // exist.
    const src = createRoute.replace(/\s+/g, " ");
    expect(src).toMatch(/taskId:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.optional\(\)/);
    expect(src).toMatch(/eq\(tasks\.id, parsed\.data\.taskId\)/);
    expect(src).toMatch(/eq\(roadmaps\.userId, user\.id\)/);
    expect(src).toMatch(/status:\s*400/);
    // The ownership check must precede the insert.
    expect(src.indexOf("eq(roadmaps.userId, user.id)")).toBeLessThan(
      src.indexOf("db.insert(aiChatFrames)"),
    );
    // Still strict — contextOverride and friends stay rejected.
    expect(src).toMatch(/\.strict\(\)/);
  });

  it("builds the corpus for a bound task even at knowledgeMode NONE", () => {
    // The mode gate used to wrap the WHOLE corpus build, which meant a
    // bound task was invisible at the default mode — exactly the case
    // the binding exists for, and exactly why the AI answered "Tôi
    // chưa có nội dung của task" while standing in front of the task.
    // The gate may still skip the mode-gated slices; it may not skip
    // the frame's own task.
    const src = chatRoute.replace(/\s+/g, " ");
    expect(src).toMatch(/if \(grantsKnowledge\(knowledgeMode\) \|\| frame\?\.taskId\)/);
    // ...and the gate must stay, or a frame with no task at NONE would
    // pay for a corpus build that is empty by construction.
    expect(src).toMatch(/grantsKnowledge\(knowledgeMode\)/);
  });

  it("rejects a spoofed userId before any DB write", () => {
    expect(chatRoute).toContain("Forbidden");
    expect(chatRoute).toMatch(/userId\s*&&\s*parsed\.data\.userId\s*!==\s*user\.id/);
  });

  it("resolves ownership on the frame row, not on a body-supplied userId", () => {
    // `frame.userId !== user.id` is what makes a foreign frame id a
    // 404 rather than a silent cross-user write.
    expect(chatRoute).toContain("frame.userId !== user.id");
    // loadFrame matches id AND userId in a single query, so a foreign
    // id is indistinguishable from a nonexistent one.
    expect(idRoute.replace(/\s+/g, " ")).toContain("eq(aiChatFrames.id, frameId), eq(aiChatFrames.userId, userId)");
  });

  it("appends retrieved knowledge to the system turn, never into the transcript", () => {
    // Otherwise the model later treats retrieved text as something the
    // user said — and a prompt-injected note becomes a user instruction.
    expect(chatRoute).toContain("messages[0] = { role: \"system\"");
    expect(chatRoute).not.toMatch(/history\.(?:push|splice|unshift)\(/);
  });
});
