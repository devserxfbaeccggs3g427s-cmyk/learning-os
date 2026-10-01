/**
 * Admin clear-data endpoint. Each `scope` deletes a specific subset of
 * rows. Designed to be called from Settings → Data with explicit confirm.
 *
 * Uses Drizzle transactions + raw `DELETE …` SQL through `tx.execute(sql)`
 * to get reliable `rowCount` values (the typed query builder doesn't
 * surface rowCount on DML outside Postgres-js low-level results).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function exec(tx: Tx, label: string, deleted: Record<string, number>, stmt: ReturnType<typeof sql>) {
  const r = (tx.execute(stmt) as unknown as { count?: number }) ?? {};
  deleted[label] = Number(r.count ?? 0);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const user = await getDefaultUser();
  const deleted: Record<string, number> = {};

  await db.transaction(async (tx) => {
    const uid = user.id;

    if (parsed.data.scope === "progress") {
      exec(tx, "quizAttempts", deleted, sql`delete from quiz_attempts where user_id = ${uid}`);
      exec(tx, "studySessions", deleted, sql`delete from study_sessions where user_id = ${uid}`);
      exec(tx, "taskProgress", deleted, sql`delete from task_progress`);
      exec(
        tx,
        "studyBlocks",
        deleted,
        sql`delete from study_blocks where status in ('IN_PROGRESS','DONE','SKIPPED')`,
      );
    } else if (parsed.data.scope === "content") {
      exec(
        tx,
        "quizAnswers",
        deleted,
        sql`delete from quiz_answers where attempt_id in (select id from quiz_attempts where user_id = ${uid})`,
      );
      exec(tx, "quizAttempts", deleted, sql`delete from quiz_attempts where user_id = ${uid}`);
      exec(tx, "quizQuestions", deleted, sql`delete from quiz_questions`);
      exec(tx, "quizzes", deleted, sql`delete from quizzes where user_id = ${uid}`);
      exec(tx, "flashcards", deleted, sql`delete from flashcards`);
      exec(tx, "flashcardDecks", deleted, sql`delete from flashcard_decks where user_id = ${uid}`);
      exec(tx, "reviewHistory", deleted, sql`delete from review_history where user_id = ${uid}`);
      exec(tx, "reviewSessions", deleted, sql`delete from review_sessions where user_id = ${uid}`);
      exec(
        tx,
        "aiMessages",
        deleted,
        sql`delete from ai_messages where conversation_id in (select id from ai_conversations where user_id = ${uid})`,
      );
      exec(tx, "aiConversations", deleted, sql`delete from ai_conversations where user_id = ${uid}`);
      exec(tx, "aiArtifactRecords", deleted, sql`delete from ai_artifact_records where user_id = ${uid}`);
      exec(tx, "noteRevisions", deleted, sql`delete from note_revisions`);
      exec(tx, "taskNotes", deleted, sql`delete from task_notes where user_id = ${uid}`);
      exec(tx, "masteryRecords", deleted, sql`delete from mastery_records where user_id = ${uid}`);
    } else if (parsed.data.scope === "schedule") {
      exec(tx, "studyBlocks", deleted, sql`delete from study_blocks`);
      exec(tx, "schedules", deleted, sql`delete from schedules where user_id = ${uid}`);
    } else if (parsed.data.scope === "roadmap") {
      // order matters: dependents before parents
      exec(tx, "taskDependencies", deleted, sql`delete from task_dependencies`);
      exec(tx, "taskTags", deleted, sql`delete from task_tags`);
      exec(tx, "tags", deleted, sql`delete from tags`);
      exec(tx, "tasks", deleted, sql`delete from tasks`);
      exec(tx, "modules", deleted, sql`delete from modules`);
      exec(tx, "tracks", deleted, sql`delete from tracks`);
      exec(tx, "roadmaps", deleted, sql`delete from roadmaps where user_id = ${uid}`);
    } else if (parsed.data.scope === "all") {
      const tables: Array<[string, string]> = [
        ["aiArtifactRecords", "ai_artifact_records"],
        ["aiMessages", "ai_messages"],
        ["aiConversations", "ai_conversations"],
        ["quizAnswers", "quiz_answers"],
        ["quizAttempts", "quiz_attempts"],
        ["quizQuestions", "quiz_questions"],
        ["quizzes", "quizzes"],
        ["reviewHistory", "review_history"],
        ["reviewSessions", "review_sessions"],
        ["flashcards", "flashcards"],
        ["flashcardDecks", "flashcard_decks"],
        ["noteRevisions", "note_revisions"],
        ["taskNotes", "task_notes"],
        ["taskProgress", "task_progress"],
        ["studySessions", "study_sessions"],
        ["studyBlocks", "study_blocks"],
        ["schedules", "schedules"],
        ["taskDependencies", "task_dependencies"],
        ["taskTags", "task_tags"],
        ["tags", "tags"],
        ["masteryRecords", "mastery_records"],
        ["tasks", "tasks"],
        ["modules", "modules"],
        ["tracks", "tracks"],
        ["roadmaps", "roadmaps"],
      ];
      for (const [label, table] of tables) {
        // table names are static literals above; safe to interpolate.
        exec(tx, label, deleted, sql.raw(`delete from ${table}`));
      }
    }
  });

  return NextResponse.json({ ok: true, scope: parsed.data.scope, deleted });
}
