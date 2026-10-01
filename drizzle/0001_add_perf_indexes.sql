CREATE INDEX "roadmaps_user_idx" ON "roadmaps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_notes_task_user_idx" ON "task_notes" USING btree ("task_id","user_id");