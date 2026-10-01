/**
 * Roadmap queries. All exports are wrapped in `unstable_cache` so the
 * roadmap tree (which is read-mostly) doesn't re-fetch from Postgres on
 * every page render. The userId is part of the cache key, so the cache is
 * per-user.
 *
 * Cache strategy:
 *   - 5 min revalidate (roadmap changes ~weekly during planning).
 *   - Tag `roadmap:${userId}` so future mutations can call `revalidateTag`
 *     for instant invalidation.
 */
import { eq, asc, sql as drizzleSql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/client";
import { roadmaps, tracks, modules, tasks } from "@/lib/db/schema";

// Projection used by the roadmap tree view — drops heavy JSONB columns
// (concepts, failureScenarios, interviewQuestions, etc.). Each task shrinks
// from ~5-10KB to ~150B on the wire.
const TASK_LIST_PROJECTION = {
  id: tasks.id,
  code: tasks.code,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  estimatedMinutes: tasks.estimatedMinutes,
  moduleId: tasks.moduleId,
} as const;

export type RoadmapTreeTask = {
  id: string;
  code: string | null;
  title: string;
  status: string;
  priority: string;
  estimatedMinutes: number;
  moduleId: string;
};

export type RoadmapTree = {
  roadmap: { id: string; title: string; description: string | null };
  tracks: Array<{
    id: string;
    title: string;
    summary: string | null;
    orderIndex: number;
    modules: Array<{
      id: string;
      title: string;
      summary: string | null;
      orderIndex: number;
      tasks: RoadmapTreeTask[];
    }>;
  }>;
  totals: { taskCount: number; doneCount: number };
};

async function _getRoadmapTree(userId: string, roadmapId: string): Promise<RoadmapTree | null> {
  const rm = (
    await db
      .select({ id: roadmaps.id, title: roadmaps.title, description: roadmaps.description })
      .from(roadmaps)
      .where(eq(roadmaps.id, roadmapId))
      .limit(1)
  )[0];
  if (!rm) return null;

  const trs = await db
    .select({ id: tracks.id, title: tracks.title, summary: tracks.summary, orderIndex: tracks.orderIndex })
    .from(tracks)
    .where(eq(tracks.roadmapId, roadmapId))
    .orderBy(asc(tracks.orderIndex));

  const ms = trs.length
    ? await db
        .select({
          id: modules.id,
          trackId: modules.trackId,
          title: modules.title,
          summary: modules.summary,
          orderIndex: modules.orderIndex,
        })
        .from(modules)
        .where(
          drizzleSql`${modules.trackId} IN (${drizzleSql.join(
            trs.map((t) => drizzleSql`${t.id}`),
            drizzleSql`, `,
          )})`,
        )
        .orderBy(asc(modules.orderIndex))
    : [];

  const ts: RoadmapTreeTask[] = ms.length
    ? await db
        .select(TASK_LIST_PROJECTION)
        .from(tasks)
        .where(
          drizzleSql`${tasks.moduleId} IN (${drizzleSql.join(
            ms.map((m) => drizzleSql`${m.id}`),
            drizzleSql`, `,
          )})`,
        )
        .orderBy(asc(tasks.orderIndex))
    : [];

  const tasksByModule = new Map<string, RoadmapTreeTask[]>();
  for (const t of ts) {
    const arr = tasksByModule.get(t.moduleId) ?? [];
    arr.push(t);
    tasksByModule.set(t.moduleId, arr);
  }
  const modulesByTrack = new Map<string, typeof ms>();
  for (const m of ms) {
    const arr = modulesByTrack.get(m.trackId) ?? [];
    arr.push(m);
    modulesByTrack.set(m.trackId, arr);
  }

  const total = ts.length;
  const done = ts.filter((t) => t.status === "MASTERED" || t.status === "LEARNED").length;

  return {
    roadmap: rm,
    tracks: trs.map((tr) => ({
      ...tr,
      modules: (modulesByTrack.get(tr.id) ?? []).map((m) => ({
        ...m,
        tasks: tasksByModule.get(m.id) ?? [],
      })),
    })),
    totals: { taskCount: total, doneCount: done },
  };
}

/**
 * Cached roadmap tree. Use the `roadmap:${userId}` tag for invalidation.
 */
export function getRoadmapTree(userId: string, roadmapId: string) {
  return unstable_cache(
    () => _getRoadmapTree(userId, roadmapId),
    ["roadmap-tree", userId, roadmapId],
    { revalidate: 300, tags: [`roadmap:${userId}`] },
  )();
}

/** List a user's roadmap headers (title + description only). */
async function _listRoadmaps(userId: string) {
  return db
    .select({ id: roadmaps.id, title: roadmaps.title, description: roadmaps.description })
    .from(roadmaps)
    .where(eq(roadmaps.userId, userId))
    .limit(10);
}

export function listRoadmaps(userId: string) {
  return unstable_cache(() => _listRoadmaps(userId), ["roadmap-list", userId], {
    revalidate: 300,
    tags: [`roadmap:${userId}`],
  })();
}
