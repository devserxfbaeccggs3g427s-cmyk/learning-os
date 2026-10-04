-- AI chat frames: conversation frames that are independent of the
-- task / roadmap / screen they were opened from. Deliberately a
-- separate table with NO task_id column, so there is no FK path to
-- task context and no cascade delete when a task is removed.
--
-- Written with IF NOT EXISTS throughout. The repo has no tracked
-- drizzle/meta/_journal.json, so `npm run db:migrate` cannot replay a
-- baseline; these migrations get applied by hand. Idempotent DDL is
-- what makes re-running one safe. See scripts/apply-migration.ts.
CREATE TABLE IF NOT EXISTS "ai_chat_frames" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Chat' NOT NULL,
	"entry_point" text DEFAULT 'UNKNOWN' NOT NULL,
	"knowledge_mode" text DEFAULT 'NONE' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"frame_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_chat_frame_snippets" (
	"id" text PRIMARY KEY NOT NULL,
	"frame_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Snippet' NOT NULL,
	"body" text NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_chat_frames" ADD CONSTRAINT "ai_chat_frames_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_frame_id_ai_chat_frames_id_fk" FOREIGN KEY ("frame_id") REFERENCES "public"."ai_chat_frames"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_chat_frame_snippets" ADD CONSTRAINT "ai_chat_frame_snippets_frame_id_ai_chat_frames_id_fk" FOREIGN KEY ("frame_id") REFERENCES "public"."ai_chat_frames"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_chat_frame_snippets" ADD CONSTRAINT "ai_chat_frame_snippets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_chat_frames_user_idx" ON "ai_chat_frames" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_chat_messages_frame_idx" ON "ai_chat_messages" USING btree ("frame_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_chat_frame_snippets_frame_idx" ON "ai_chat_frame_snippets" USING btree ("frame_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_chat_frame_snippets_user_idx" ON "ai_chat_frame_snippets" USING btree ("user_id");