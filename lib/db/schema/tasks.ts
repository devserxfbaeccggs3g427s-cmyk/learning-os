import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_helpers";
import { modules } from "./roadmap";

/**
 * Tasks. They live under a Module but also carry their own semantic fields
 * (ID/code, status, priority, difficulty, time tracking). The structured
 * "research worksheet" content (Why This Matters, Failure Scenarios, etc.)
 * lives on the task itself; long-form free notes are in `taskNotes`.
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    code: text("code"), // e.g. DB-TX-01, PAY-IDEM-01
    moduleId: text("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),

    // CV-driven fields (mirrors the roadmap document)
    relatedProject: text("related_project"),
    relatedCvClaim: text("related_cv_claim"),
    whyThisMatters: text("why_this_matters"),
    prerequisites: text("prerequisites"), // JSON array of strings
    concepts: text("concepts"), // JSON array
    deepDiveSubtopics: text("deep_dive_subtopics"), // JSON array
    internalsToUnderstand: text("internals_to_understand"), // JSON array
    failureScenarios: text("failure_scenarios"), // JSON array of {id,title,body}
    productionQuestions: text("production_questions"), // JSON array
    interviewQuestions: text("interview_questions"), // JSON array
    handsOnLab: text("hands_on_lab"), // free markdown
    expectedOutput: text("expected_output"),
    definitionOfDone: text("definition_of_done"),

    // Time / priority / status (status default from config)
    status: text("status").notNull().default("BACKLOG"),
    priority: text("priority").notNull().default("P2"),
    difficulty: text("difficulty").notNull().default("INTERMEDIATE"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(45),
    actualMinutes: integer("actual_minutes").notNull().default(0),

    // Mastery / review scheduling
    masteryScore: real("mastery_score").notNull().default(0),
    nextReviewAt: text("next_review_at"),
    lastReviewedAt: text("last_review_at"),

    orderIndex: integer("order_index").notNull().default(0),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    moduleIdx: index("tasks_module_idx").on(t.moduleId, t.orderIndex),
    statusIdx: index("tasks_status_idx").on(t.status),
    priorityIdx: index("tasks_priority_idx").on(t.priority),
    codeIdx: uniqueIndex("tasks_code_unique").on(t.code),
  }),
);

/**
 * Many-to-many self-relation for task dependencies.
 * `(taskId) depends on (dependsOnTaskId)`.
 */
export const taskDependencies = sqliteTable(
  "task_dependencies",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: text("depends_on_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    // Optional: hard dependency vs soft (recommended order).
    kind: text("kind").notNull().default("HARD"), // HARD | SOFT
    createdAt: createdAt(),
  },
  (t) => ({
    taskIdx: index("task_dep_task_idx").on(t.taskId),
    depIdx: index("task_dep_dep_idx").on(t.dependsOnTaskId),
    uniqueDep: uniqueIndex("task_dep_unique").on(t.taskId, t.dependsOnTaskId),
  }),
);

export type TaskRow = typeof tasks.$inferSelect;
export type TaskDependencyRow = typeof taskDependencies.$inferSelect;