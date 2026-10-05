-- Notes attached to a study block.
--
-- Why this exists: one task can have several blocks on the same
-- day (PAY-01 had six on 2026-10-05). Notes used to live only on
-- `task_notes` (keyed by task), so finishing block B of a task
-- overwrote the note block A had just written. The session runner
-- also initialized its editor to "" and ignored the initialNote
-- prop, so every session opened blank.
--
-- `block_notes` follows the task_notes contract exactly: one current
-- row per (block, user), plain markdown content, revision counter,
-- previous content snapshotted into `block_note_revisions` on save.
--
-- `task_notes` is deliberately kept — the AI frame corpus and
-- search still read it, and task-level notes remain a useful
-- "note for the task as a whole". Nothing in this migration
-- moves or deletes existing data.
--
-- Idempotent throughout, matching 0002/0003 — migrations are
-- applied by hand via `npm run db:apply` and may be re-run.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "block_notes" (
  "id" text PRIMARY KEY NOT NULL,
  "block_id" text NOT NULL,
  "user_id" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "last_saved_at" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_notes_block_idx" ON "block_notes" USING btree ("block_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_notes_block_user_idx" ON "block_notes" USING btree ("block_id", "user_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "block_notes" ADD CONSTRAINT "block_notes_block_id_study_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."study_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "block_notes" ADD CONSTRAINT "block_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "block_note_revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "note_id" text NOT NULL,
  "block_id" text NOT NULL,
  "revision" integer NOT NULL,
  "content" text NOT NULL,
  "message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_note_revisions_note_idx" ON "block_note_revisions" USING btree ("note_id", "revision");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "block_note_revisions" ADD CONSTRAINT "block_note_revisions_note_id_block_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."block_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "block_note_revisions" ADD CONSTRAINT "block_note_revisions_block_id_study_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."study_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
