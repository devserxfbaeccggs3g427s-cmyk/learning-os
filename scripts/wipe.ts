/**
 * Wipe all application data from Supabase Postgres.
 *
 * Run: `npm run db:wipe`
 *
 * WARNING: This deletes every row in every table except `users` and
 * `application_settings`. There is no undo. Make sure you have a backup
 * (Settings → Data → Backup) before running.
 *
 * Use this for:
 *   - cleaning up after a test/staging import
 *   - resetting to a clean slate before re-importing the canonical
 *     roadmap + schedule JSON
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: false });
import { sql } from "drizzle-orm";
import postgres from "postgres";

const url =
  process.env.LEARNING_OS_POSTGRES_URL ??
  process.env.LEARNING_OS_SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!url) {
  throw new Error("[wipe] LEARNING_OS_POSTGRES_URL is required (set it in .env.local)");
}

const redacted = url.replace(/:[^:@/]+@/, ":***@");
console.log(`[wipe] target: ${redacted}`);

const client = postgres(url, { max: 1, prepare: false, ssl: "require" });

const TABLES_IN_DELETE_ORDER: Array<[string, string]> = [
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

try {
  await client.begin(async (tx) => {
    for (const [label, table] of TABLES_IN_DELETE_ORDER) {
      // Table names are static literals above; safe to interpolate.
      const r = await tx`delete from ${client(table)}`;
      console.log(`[wipe] ${label}: ${r.count} rows`);
    }
  });
  console.log("[wipe] done. All application tables cleared.");
  console.log("[wipe] Kept: users, application_settings, ai_configurations, prompt_templates, audit_log");
} catch (err) {
  console.error("[wipe] failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
