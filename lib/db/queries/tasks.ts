/**
 * Tasks queries. The /tasks page used to pull every row of tasks, modules,
 * tracks, and roadmaps with no filter — fine while there were 5 tasks,
 * painful at 205. This module adds a paginated, status-filtered list and
 * a light projection for the cards.
 *
 * listTasks() now JOINs the hierarchy in a single query so the page does
 * NOT need a separate listHierarchy() round-trip.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/client";
import { tasks, modules, tracks, roadmaps, studyBlocks, schedules } from "@/lib/db/schema";

const TASK_CARD_PROJECTION = {
  id: tasks.id,
  code: tasks.code,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  estimatedMinutes: tasks.estimatedMinutes,
  moduleId: tasks.moduleId,
  moduleTitle: modules.title,
  trackId: tracks.id,
  trackTitle: tracks.title,
  roadmapId: roadmaps.id,
  roadmapTitle: roadmaps.title,
} as const;

export type TaskCard = {
  id: string;
  code: string | null;
  title: string;
  status: string;
  priority: string;
  estimatedMinutes: number;
  moduleId: string;
  moduleTitle: string;
  trackId: string;
  trackTitle: string;
  roadmapId: string;
  roadmapTitle: string;
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

  // Single batched query — replaces the previous 2-step (listTasks +
  // listHierarchy) round-trip. Modules/tracks/roadmaps are pulled in via
  // INNER JOIN since the breadcrumb is required for the UI.
  const countRow = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(tasks)
    .where(where!);

  const items = await db
    .select(TASK_CARD_PROJECTION)
    .from(tasks)
    .innerJoin(modules, eq(modules.id, tasks.moduleId))
    .innerJoin(tracks, eq(tracks.id, modules.trackId))
    .innerJoin(roadmaps, eq(roadmaps.id, tracks.roadmapId))
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
 * Side-car lookup tables for pages that need ALL of the user's roadmaps /
 * tracks / modules (e.g. task-creation forms). The /tasks list view no
 * longer needs this — listTasks() now JOINs the breadcrumb in.
 */

// ----------------------------------------------------------------------------
// Scheduled tasks — the /tasks page's date-grouped view
// ----------------------------------------------------------------------------

/**
 * One study block, the way the Today screen shows it: a timed unit of work
 * (`09:00–10:30 LEARN`) that hangs off a task. `taskId` is nullable — a
 * block can exist without a task, and the UI flags those as "No task".
 */
export type ScheduledBlock = {
  id: string;
  date: string;
  type: string;
  title: string;
  objective: string | null;
  deliverable: string | null;
  startMinute: number;
  durationMinutes: number;
  status: string;
  taskId: string | null;
  taskCode: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  taskPriority: string | null;
};

export type ScheduledDay = {
  date: string;
  objective: string | null;
  blocks: ScheduledBlock[];
};

export type ListScheduledBlocksInput = {
  userId: string;
  /** Inclusive ISO start of the window. */
  from: string;
  to: string;
  /** TASK_STATUSES value — keeps only blocks whose task has this status. */
  status?: string;
};

async function _listScheduledBlocks(input: ListScheduledBlocksInput): Promise<ScheduledDay[]> {
  const conds = [sql`${schedules.userId} = ${input.userId}`];
  // Status filtering goes through the task, not the block: `tasks` is LEFT
  // JOINed (so task-less blocks still show up), so a `where tasks.status = …`
  // would silently drop them. NULL never equals a status, which is what we
  // want — a filtered view should only show real tasks in that state.
  if (input.status) conds.push(eq(tasks.status, input.status));

  const rows = await db
    .select({
      date: schedules.date,
      objective: schedules.objective,
      blockId: studyBlocks.id,
      type: studyBlocks.type,
      blockTitle: studyBlocks.title,
      blockObjective: studyBlocks.objective,
      deliverable: studyBlocks.deliverable,
      startMinute: studyBlocks.startMinute,
      durationMinutes: studyBlocks.durationMinutes,
      blockStatus: studyBlocks.status,
      taskId: studyBlocks.taskId,
      taskCode: tasks.code,
      taskTitle: tasks.title,
      taskStatus: tasks.status,
      taskPriority: tasks.priority,
    })
    .from(schedules)
    .innerJoin(studyBlocks, eq(studyBlocks.scheduleId, schedules.id))
    .leftJoin(tasks, eq(tasks.id, studyBlocks.taskId))
    .where(and(gte(schedules.date, input.from), lte(schedules.date, input.to), ...conds))
    .orderBy(asc(schedules.date), asc(studyBlocks.startMinute));

  // One schedule row per (user, date) by design, so grouping by date is
  // safe — but the objective rides on every block row, so take it from the
  // first row of each group rather than a separate lookup.
  const byDate = new Map<string, ScheduledDay>();
  for (const r of rows) {
    const day = byDate.get(r.date) ?? { date: r.date, objective: r.objective, blocks: [] };
    day.blocks.push({
      id: r.blockId,
      date: r.date,
      type: r.type,
      title: r.blockTitle,
      objective: r.blockObjective,
      deliverable: r.deliverable,
      startMinute: r.startMinute,
      durationMinutes: r.durationMinutes,
      status: r.blockStatus,
      taskId: r.taskId,
      taskCode: r.taskCode,
      taskTitle: r.taskTitle,
      taskStatus: r.taskStatus,
      taskPriority: r.taskPriority,
    });
    byDate.set(r.date, day);
  }
  return [...byDate.values()];
}

/**
 * Every study block in [from, to], grouped by calendar day and ordered by
 * start time — the same shape the Today screen renders for a single date,
 * widened to a window.
 *
 * Distinct from `listTasks`, which answers "every task in the roadmap".
 * This one answers "what am I supposed to do, and when" — driven by
 * `study_blocks`/`schedules`, so a task with no blocks is invisible here by
 * design; that view lives on /roadmap.
 *
 * No EXISTS scope: the schedule rows already carry `user_id`, so filtering
 * by that is both cheaper and sufficient.
 */
export function listScheduledBlocks(input: ListScheduledBlocksInput) {
  return unstable_cache(
    () => _listScheduledBlocks(input),
    ["tasks-scheduled-blocks", input.userId, input.from, input.to, input.status ?? "ALL"],
    { revalidate: 60, tags: [`schedule:${input.userId}`] },
  )();
}

/**
 * Compact code → title index for the AI global chat.
 * Returns at most `limit` rows, ordered to prefer tasks the user is most
 * likely to ask about: not-yet-mastered first, then by module order.
 */
export type TaskCodeIndexRow = {
  code: string | null;
  title: string;
  status: string;
  priority: string;
  moduleTitle: string;
  trackTitle: string;
};

const TASK_CODE_INDEX_PROJECTION = {
  code: tasks.code,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  moduleTitle: modules.title,
  trackTitle: tracks.title,
} as const;

async function _listTaskCodeIndex(
  userId: string,
  limit: number,
): Promise<TaskCodeIndexRow[]> {
  return db
    .select(TASK_CODE_INDEX_PROJECTION)
    .from(tasks)
    .innerJoin(modules, eq(modules.id, tasks.moduleId))
    .innerJoin(tracks, eq(tracks.id, modules.trackId))
    .innerJoin(roadmaps, eq(roadmaps.id, tracks.roadmapId))
    .where(
      sql`${roadmaps.userId} = ${userId} and ${tasks.status} not in ('MASTERED','LEARNED')`,
    )
    .orderBy(asc(tasks.orderIndex))
    .limit(limit);
}

export function listTaskCodeIndex(userId: string, limit = 400) {
  return unstable_cache(
    () => _listTaskCodeIndex(userId, limit),
    ["task-code-index", userId, String(limit)],
    { revalidate: 300, tags: [`tasks:${userId}`] },
  )();
}

/**
 * A task WITH its study content — the projection the AI chat frame's
 * retrieval corpus needs.
 *
 * Distinct from `TaskCodeIndexRow` on purpose: that one feeds the Tasks
 * page card list, where shipping every description, deep-dive subtopic
 * and interview question would be pure waste. Retrieval is the opposite
 * case — a doc carrying only `code / title / status / priority` gives
 * BM25 a token to match on but no text for the model to ground an
 * answer on, which is what made the frame answer "no information" even
 * with a task in scope.
 */
export type TaskContentRow = {
  code: string | null;
  title: string;
  status: string;
  priority: string;
  difficulty: string | null;
  estimatedMinutes: number;
  moduleTitle: string;
  trackTitle: string;
  description: string | null;
  whyThisMatters: string | null;
  concepts: string[];
  deepDiveSubtopics: string[];
  internalsToUnderstand: string[];
  failureScenarios: unknown[];
  interviewQuestions: string[];
  prerequisites: string[];
  handsOnLab: string | null;
  expectedOutput: string | null;
  definitionOfDone: string | null;
};

const TASK_CONTENT_PROJECTION = {
  code: tasks.code,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  difficulty: tasks.difficulty,
  estimatedMinutes: tasks.estimatedMinutes,
  moduleTitle: modules.title,
  trackTitle: tracks.title,
  description: tasks.description,
  whyThisMatters: tasks.whyThisMatters,
  concepts: tasks.concepts,
  deepDiveSubtopics: tasks.deepDiveSubtopics,
  internalsToUnderstand: tasks.internalsToUnderstand,
  failureScenarios: tasks.failureScenarios,
  interviewQuestions: tasks.interviewQuestions,
  prerequisites: tasks.prerequisites,
  handsOnLab: tasks.handsOnLab,
  expectedOutput: tasks.expectedOutput,
  definitionOfDone: tasks.definitionOfDone,
} as const;

async function _listTaskContentIndex(
  userId: string,
  limit: number,
): Promise<TaskContentRow[]> {
  return db
    .select(TASK_CONTENT_PROJECTION)
    .from(tasks)
    .innerJoin(modules, eq(modules.id, tasks.moduleId))
    .innerJoin(tracks, eq(tracks.id, modules.trackId))
    .innerJoin(roadmaps, eq(roadmaps.id, tracks.roadmapId))
    .where(
      sql`${roadmaps.userId} = ${userId} and ${tasks.status} not in ('MASTERED','LEARNED')`,
    )
    .orderBy(asc(tasks.orderIndex))
    .limit(limit);
}

/**
 * Content-rich task index for AI retrieval. Same scope and ordering as
 * {@link listTaskCodeIndex}, different columns.
 *
 * Tagged `tasks:${userId}` like every other task read: the entry is
 * cached but NOT stale — writes already cover the shared
 * `revalidateTag(`tasks:${userId}`)` convention, and a frame that
 * quoted a task the user just finished would answer from a state that
 * no longer exists. The separate cache key means the payload is
 * fetched independently of the code index, not that it is exempt from
 * invalidation.
 */
export function listTaskContentIndex(userId: string, limit = 400) {
  return unstable_cache(
    () => _listTaskContentIndex(userId, limit),
    ["task-content-index", userId, String(limit)],
    { revalidate: 300, tags: [`tasks:${userId}`] },
  )();
}

async function _listHierarchy(userId: string) {
  const rms = await db
    .select({ id: roadmaps.id, title: roadmaps.title })
    .from(roadmaps)
    .where(eq(roadmaps.userId, userId));
  if (rms.length === 0) return { modules: [], tracks: [], roadmaps: [] };

  const { inArray } = await import("drizzle-orm");
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