import { pgTable, text, integer, index } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_helpers";
import { users } from "./users";

/**
 * Roadmap hierarchy:
 *   Roadmap → Track → Module → Task
 *
 * Tracks/modules/tasks all carry an `orderIndex` so the tree can be
 * reconstructed without relying on creation order.
 */

export const roadmaps = pgTable(
  "roadmaps",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    source: text("source").notNull().default("manual"), // manual | imported
    startDate: text("start_date"),
    targetEndDate: text("target_end_date"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // listRoadmaps + listHierarchy filter by userId constantly. Without
    // this index every read does a sequential scan of the table.
    userIdx: index("roadmaps_user_idx").on(t.userId),
  }),
);

export const tracks = pgTable(
  "tracks",
  {
    id: text("id").primaryKey(),
    roadmapId: text("roadmap_id")
      .notNull()
      .references(() => roadmaps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    color: text("color"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    roadmapIdx: index("tracks_roadmap_idx").on(t.roadmapId, t.orderIndex),
  }),
);

export const modules = pgTable(
  "modules",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    trackIdx: index("modules_track_idx").on(t.trackId, t.orderIndex),
  }),
);

export type RoadmapRow = typeof roadmaps.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;
export type ModuleRow = typeof modules.$inferSelect;
