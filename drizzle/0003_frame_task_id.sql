-- Bind an AI chat frame to the task it was opened from.
--
-- Previously ai_chat_frames had no task column at all, by design: a frame
-- must not automatically inherit the task/roadmap/screen context of
-- wherever it was opened. That invariant is kept — the chat route still
-- rejects a body-supplied taskId via zod .strict(), and the task is read
-- off the FRAME ROW, so a caller cannot aim a frame at a foreign task.
--
-- What changes is that a task-aware screen (Start Task / task Notes) can
-- now bind ONE task to the frame at creation time. That task joins the
-- retrieval pool as a single document, so it competes on score like
-- everything else and `grounded` telemetry stays honest.
--
-- ON DELETE SET NULL, deliberately not CASCADE: unlike
-- ai_conversations.task_id (which cascades), deleting a task must not
-- silently destroy the conversation opened about it. The frame survives
-- with task_id = NULL and loses only that one retrieval candidate.
--
-- Idempotent throughout, matching 0002_ai_chat_frames.sql — the repo has
-- no tracked drizzle/meta/_journal.json so migrations are applied by hand
-- via `npm run db:apply` and may be re-run.
ALTER TABLE "ai_chat_frames" ADD COLUMN IF NOT EXISTS "task_id" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_chat_frames" ADD CONSTRAINT "ai_chat_frames_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_chat_frames_task_idx" ON "ai_chat_frames" USING btree ("task_id");