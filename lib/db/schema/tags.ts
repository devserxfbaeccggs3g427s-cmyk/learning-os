import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt } from "./_helpers";
import { tasks } from "./tasks";

/**
 * Tags are user-defined strings (e.g. "kafka", "idempotency", "P0").
 * They attach many-to-many to tasks.
 */
export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: createdAt(),
  },
  (t) => ({
    nameUnique: uniqueIndex("tags_name_unique").on(t.name),
  }),
);

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("task_tags_unique").on(t.taskId, t.tagId),
    tagIdx: index("task_tags_tag_idx").on(t.tagId),
  }),
);

export type TagRow = typeof tags.$inferSelect;
export type TaskTagRow = typeof taskTags.$inferSelect;
