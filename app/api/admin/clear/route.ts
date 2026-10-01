/**
 * Admin clear-data endpoint. Each `scope` deletes a specific subset of
 * rows. Designed to be called from Settings → Data with explicit confirm.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, rawSqlite } from "@/lib/db/client";
import { getDefaultUser } from "@/lib/ai/service";

const Body = z.object({
  scope: z.enum([
    "progress", // session progress, block statuses, quiz attempts
    "content", // notes, decks, quizzes, conversations
    "schedule", // imported schedules + study blocks
    "roadmap", // imported roadmap (tracks/modules/tasks)
    "all", // wipe everything (keeps user + settings)
  ]),
  /** User must send `confirm: true` or the request is rejected. */
  confirm: z.literal(true),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const user = await getDefaultUser();

  const deleted: Record<string, number> = {};

  function exec(label: string, query: string) {
    // better-sqlite3's `exec` returns the Database for chaining, not a count.
    // Use a prepared statement for change-tracking.
    const r = rawSqlite.prepare(`DELETE FROM ${query}`).run();
    deleted[label] = r.changes;
  }

  if (parsed.data.scope === "progress") {
    rawSqlite.exec("BEGIN");
    try {
      exec("quiz_attempts", "quiz_attempts WHERE user_id = '" + user.id + "'");
      exec("study_sessions", "study_sessions WHERE user_id = '" + user.id + "'");
      exec("task_progress", "task_progress");
      exec("study_blocks_status", "study_blocks WHERE status IN ('IN_PROGRESS','DONE','SKIPPED')");
      rawSqlite.exec("COMMIT");
    } catch (err) {
      rawSqlite.exec("ROLLBACK");
      throw err;
    }
  } else if (parsed.data.scope === "content") {
    rawSqlite.exec("BEGIN");
    try {
      exec("quiz_answers", "quiz_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id='" + user.id + "')");
      exec("quiz_attempts", "quiz_attempts WHERE user_id='" + user.id + "'");
      exec("quiz_questions", "quiz_questions");
      exec("quizzes", "quizzes WHERE user_id='" + user.id + "'");
      exec("flashcards", "flashcards");
      exec("flashcard_decks", "flashcard_decks WHERE user_id='" + user.id + "'");
      exec("review_history", "review_history WHERE user_id='" + user.id + "'");
      exec("review_sessions", "review_sessions WHERE user_id='" + user.id + "'");
      exec("ai_messages", "ai_messages WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE user_id='" + user.id + "')");
      exec("ai_conversations", "ai_conversations WHERE user_id='" + user.id + "'");
      exec("ai_artifact_records", "ai_artifact_records WHERE user_id='" + user.id + "'");
      exec("note_revisions", "note_revisions");
      exec("task_notes", "task_notes WHERE user_id='" + user.id + "'");
      exec("mastery_records", "mastery_records WHERE user_id='" + user.id + "'");
      rawSqlite.exec("COMMIT");
    } catch (err) {
      rawSqlite.exec("ROLLBACK");
      throw err;
    }
  } else if (parsed.data.scope === "schedule") {
    rawSqlite.exec("BEGIN");
    try {
      exec("study_blocks", "study_blocks");
      exec("schedules", "schedules WHERE user_id='" + user.id + "'");
      rawSqlite.exec("COMMIT");
    } catch (err) {
      rawSqlite.exec("ROLLBACK");
      throw err;
    }
  } else if (parsed.data.scope === "roadmap") {
    rawSqlite.exec("BEGIN");
    try {
      // order matters: dependents before parents
      exec("task_dependencies", "task_dependencies");
      exec("task_tags", "task_tags");
      exec("tags", "tags");
      exec("tasks", "tasks");
      exec("modules", "modules");
      exec("tracks", "tracks");
      exec("roadmaps", "roadmaps WHERE user_id='" + user.id + "'");
      rawSqlite.exec("COMMIT");
    } catch (err) {
      rawSqlite.exec("ROLLBACK");
      throw err;
    }
  } else if (parsed.data.scope === "all") {
    rawSqlite.exec("BEGIN");
    try {
      // Wipe everything except user + settings + audit
      exec("ai_artifact_records", "ai_artifact_records");
      exec("ai_messages", "ai_messages");
      exec("ai_conversations", "ai_conversations");
      exec("quiz_answers", "quiz_answers");
      exec("quiz_attempts", "quiz_attempts");
      exec("quiz_questions", "quiz_questions");
      exec("quizzes", "quizzes");
      exec("review_history", "review_history");
      exec("review_sessions", "review_sessions");
      exec("flashcards", "flashcards");
      exec("flashcard_decks", "flashcard_decks");
      exec("note_revisions", "note_revisions");
      exec("task_notes", "task_notes");
      exec("task_progress", "task_progress");
      exec("study_sessions", "study_sessions");
      exec("study_blocks", "study_blocks");
      exec("schedules", "schedules");
      exec("task_dependencies", "task_dependencies");
      exec("task_tags", "task_tags");
      exec("tags", "tags");
      exec("mastery_records", "mastery_records");
      exec("tasks", "tasks");
      exec("modules", "modules");
      exec("tracks", "tracks");
      exec("roadmaps", "roadmaps");
      rawSqlite.exec("COMMIT");
    } catch (err) {
      rawSqlite.exec("ROLLBACK");
      throw err;
    }
  }

  // Touch a query so the type isn't unused.
  void sql;

  return NextResponse.json({ ok: true, scope: parsed.data.scope, deleted });
}