/**
 * Tasks queries. The /tasks page used to pull every row of tasks, modules,
 * tracks, and roadmaps with no filter — fine while there were 5 tasks,
 * painful at 205. This module adds a paginated, status-filtered list and
 * a light projection for the cards.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/client";
import { tasks, modules, tracks, roadmaps } from "@/lib/db/schema";

const TASK_CARD_PROJECTION = {
  id: tasks.id,
  code: tasks.code,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  estimatedMinutes: tasks.estimatedMinutes,
  moduleId: tasks.moduleId,
} as const;

export type TaskCard = {
  id: string;
  code: string | null;
  title: string;
  status: string;
  priority: string;
  estimatedMinutes: number;
  moduleId: string;
};

export type ListTasksResult = {
  items: TaskCard[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListTasksInput = {
  userId: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

/**
 * EXISTS subquery that restricts tasks to rows whose module → track →
 * roadmap chain belongs to the given user. Runs as a single EXISTS check
 * per row (Postgres plans this efficiently with the right indexes).
 */
function userScope(userId: string) {
  return sql`exists (
    select 1
    from ${modules} m
    join ${tracks} t on t.id = m.track_id
    join ${roadmaps} r on r.id = t.roadmap_id
    where m.id = ${tasks.moduleId}
      and r.user_id = ${userId}
  )`;
}

async function _listTasks(input: ListTasksInput): Promise<ListTasksResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, input.pageSize ?? 100));
  const offset = (page - 1) * pageSize;

  const conds = [userScope(input.userId)];
  if (input.status) conds.push(eq(tasks.status, input.status));
  const where = conds.length === 1 ? conds[0] : and(...conds);

  const countRow = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(tasks)
    .where(where!);

  const items = await db
    .select(TASK_CARD_PROJECTION)
    .from(tasks)
    .where(where!)
    .orderBy(asc(tasks.orderIndex))
    .limit(pageSize)
    .offset(offset);

  return { items, total: Number(countRow[0]?.count ?? 0), page, pageSize };
}

export function listTasks(input: ListTasksInput) {
  return unstable_cache(
    () => _listTasks(input),
    [
      "tasks-list",
      input.userId,
      input.status ?? "ALL",
      String(input.page ?? 1),
      String(input.pageSize ?? 100),
    ],
    { revalidate: 30, tags: [`tasks:${input.userId}`] },
  )();
}

/**
 * Side-car lookup tables for the /tasks page card chrome:
 * roadmap / track / module titles by id. Tiny in absolute terms (a few
 * hundred short rows).
 */
async function _listHierarchy(userId: string) {
  const rms = await db
    .select({ id: roadmaps.id, title: roadmaps.title })
    .from(roadmaps)
    .where(eq(roadmaps.userId, userId));
  if (rms.length === 0) return { modules: [], tracks: [], roadmaps: [] };

  const rmIds = rms.map((r) => r.id);
  const trs = await db
    .select({ id: tracks.id, title: tracks.title, roadmapId: tracks.roadmapId })
    .from(tracks)
    .where(inArray(tracks.roadmapId, rmIds));
  const trIds = trs.map((t) => t.id);
  const ms = trIds.length
    ? await db
        .select({ id: modules.id, title: modules.title, trackId: modules.trackId })
        .from(modules)
        .where(inArray(modules.trackId, trIds))
    : [];

  return { modules: ms, tracks: trs, roadmaps: rms };
}

export function listHierarchy(userId: string) {
  return unstable_cache(
    () => _listHierarchy(userId),
    ["tasks-hierarchy", userId],
    { revalidate: 300, tags: [`roadmap:${userId}`] },
  )();
}
