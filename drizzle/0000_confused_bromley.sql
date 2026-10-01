CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`display_name` text,
	`timezone` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	`settings_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `modules` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `modules_track_idx` ON `modules` (`track_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `roadmaps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`start_date` text,
	`target_end_date` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`roadmap_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`color` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`roadmap_id`) REFERENCES `roadmaps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracks_roadmap_idx` ON `tracks` (`roadmap_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`depends_on_task_id` text NOT NULL,
	`kind` text DEFAULT 'HARD' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_dep_task_idx` ON `task_dependencies` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_dep_dep_idx` ON `task_dependencies` (`depends_on_task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_dep_unique` ON `task_dependencies` (`task_id`,`depends_on_task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`module_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`related_project` text,
	`related_cv_claim` text,
	`why_this_matters` text,
	`prerequisites` text,
	`concepts` text,
	`deep_dive_subtopics` text,
	`internals_to_understand` text,
	`failure_scenarios` text,
	`production_questions` text,
	`interview_questions` text,
	`hands_on_lab` text,
	`expected_output` text,
	`definition_of_done` text,
	`status` text DEFAULT 'BACKLOG' NOT NULL,
	`priority` text DEFAULT 'P2' NOT NULL,
	`difficulty` text DEFAULT 'INTERMEDIATE' NOT NULL,
	`estimated_minutes` integer DEFAULT 45 NOT NULL,
	`actual_minutes` integer DEFAULT 0 NOT NULL,
	`mastery_score` real DEFAULT 0 NOT NULL,
	`next_review_at` text,
	`last_review_at` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_module_idx` ON `tasks` (`module_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_priority_idx` ON `tasks` (`priority`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_code_unique` ON `tasks` (`code`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`objective` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedules_user_date_idx` ON `schedules` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `study_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`task_id` text,
	`type` text DEFAULT 'LEARN' NOT NULL,
	`title` text NOT NULL,
	`objective` text,
	`start_minute` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`deliverable` text,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `study_blocks_sched_idx` ON `study_blocks` (`schedule_id`,`start_minute`);--> statement-breakpoint
CREATE INDEX `study_blocks_task_idx` ON `study_blocks` (`task_id`);--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`block_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`paused_at` text,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`objective` text,
	`difficulty_feedback` integer,
	`confidence` integer,
	`completion_status` text DEFAULT 'PENDING' NOT NULL,
	`session_notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`block_id`) REFERENCES `study_blocks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `study_sessions_user_task_idx` ON `study_sessions` (`user_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `study_sessions_started_idx` ON `study_sessions` (`started_at`);--> statement-breakpoint
CREATE TABLE `task_progress` (
	`task_id` text PRIMARY KEY NOT NULL,
	`total_study_seconds` integer DEFAULT 0 NOT NULL,
	`sessions_completed` integer DEFAULT 0 NOT NULL,
	`last_session_at` text,
	`completion_ratio` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `note_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`task_id` text NOT NULL,
	`revision` integer NOT NULL,
	`content` text NOT NULL,
	`message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `task_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_revisions_note_idx` ON `note_revisions` (`note_id`,`revision`);--> statement-breakpoint
CREATE TABLE `task_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_saved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_notes_task_idx` ON `task_notes` (`task_id`);--> statement-breakpoint
CREATE TABLE `ai_artifact_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`artifact_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_name` text,
	`prompt_version` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`cost_usd` real,
	`duration_ms` integer,
	`success` integer DEFAULT true NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_artifact_idx` ON `ai_artifact_records` (`artifact_type`,`artifact_id`);--> statement-breakpoint
CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text,
	`title` text DEFAULT 'Conversation' NOT NULL,
	`mode` text DEFAULT 'TUTOR' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_conv_user_task_idx` ON `ai_conversations` (`user_id`,`task_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_messages_conv_idx` ON `ai_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `flashcard_decks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source` text DEFAULT 'NOTES_ONLY' NOT NULL,
	`focus` text DEFAULT 'MIXED' NOT NULL,
	`difficulty` text DEFAULT 'MEDIUM' NOT NULL,
	`card_count` integer DEFAULT 0 NOT NULL,
	`generated_by` text,
	`prompt_name` text,
	`prompt_version` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flashcard_decks_task_idx` ON `flashcard_decks` (`task_id`);--> statement-breakpoint
CREATE TABLE `flashcards` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`card_type` text DEFAULT 'BASIC' NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`explanation` text,
	`difficulty` text DEFAULT 'MEDIUM' NOT NULL,
	`tags` text,
	`source_type` text,
	`interval_days` real DEFAULT 0 NOT NULL,
	`ease_factor` real DEFAULT 2.5 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`due_at` text,
	`last_reviewed_at` text,
	`suspended` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `flashcard_decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flashcards_deck_idx` ON `flashcards` (`deck_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `flashcards_due_idx` ON `flashcards` (`due_at`);--> statement-breakpoint
CREATE TABLE `quiz_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`question_id` text NOT NULL,
	`answer` text NOT NULL,
	`is_correct` integer DEFAULT false NOT NULL,
	`confidence` integer,
	`time_spent_seconds` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `quiz_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quiz_answers_attempt_idx` ON `quiz_answers` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`submitted_at` text,
	`score` real,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`incorrect_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quiz_attempts_user_quiz_idx` ON `quiz_attempts` (`user_id`,`quiz_id`);--> statement-breakpoint
CREATE TABLE `quiz_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`question_type` text DEFAULT 'SINGLE_CHOICE' NOT NULL,
	`prompt` text NOT NULL,
	`options` text NOT NULL,
	`correct_answer` text NOT NULL,
	`explanation` text,
	`difficulty` text DEFAULT 'INTERMEDIATE' NOT NULL,
	`tags` text,
	`source_ref` text,
	`related_flashcard_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_flashcard_id`) REFERENCES `flashcards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quiz_questions_quiz_idx` ON `quiz_questions` (`quiz_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source` text DEFAULT 'NOTE_ONLY' NOT NULL,
	`focus` text DEFAULT 'MIXED' NOT NULL,
	`difficulty` text DEFAULT 'INTERMEDIATE' NOT NULL,
	`question_count` integer DEFAULT 0 NOT NULL,
	`generated_by` text,
	`prompt_name` text,
	`prompt_version` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quizzes_task_idx` ON `quizzes` (`task_id`);--> statement-breakpoint
CREATE TABLE `review_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`flashcard_id` text NOT NULL,
	`rating` text NOT NULL,
	`previous_interval_days` real,
	`new_interval_days` real,
	`previous_ease` real,
	`new_ease` real,
	`duration_seconds` integer,
	`reviewed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`flashcard_id`) REFERENCES `flashcards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_history_card_idx` ON `review_history` (`flashcard_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `review_history_user_idx` ON `review_history` (`user_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `review_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`cards_reviewed` integer DEFAULT 0 NOT NULL,
	`again_count` integer DEFAULT 0 NOT NULL,
	`good_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mastery_records` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`band` text DEFAULT 'DEVELOPING' NOT NULL,
	`breakdown` text NOT NULL,
	`override` integer DEFAULT false NOT NULL,
	`override_reason` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mastery_user_task_idx` ON `mastery_records` (`user_id`,`task_id`);--> statement-breakpoint
CREATE TABLE `ai_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`base_url` text,
	`model` text NOT NULL,
	`temperature` text DEFAULT '0.4' NOT NULL,
	`max_tokens` integer DEFAULT 2000 NOT NULL,
	`streaming` integer DEFAULT true NOT NULL,
	`api_key_ciphertext` text,
	`api_key_iv` text,
	`api_key_last4` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_config_user_provider_unique` ON `ai_configurations` (`user_id`,`provider`,`label`);--> statement-breakpoint
CREATE TABLE `application_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_user_key_unique` ON `application_settings` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`system_prompt` text NOT NULL,
	`user_template` text,
	`config` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_template_unique` ON `prompt_templates` (`user_id`,`name`,`version`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `task_tags` (
	`task_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_tags_unique` ON `task_tags` (`task_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `task_tags_tag_idx` ON `task_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_subject_idx` ON `audit_log` (`subject_type`,`subject_id`);