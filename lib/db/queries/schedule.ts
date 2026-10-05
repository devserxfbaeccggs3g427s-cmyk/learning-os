/**
 * Schedule queries. Two hot read paths:
 *   - Today: one schedule row + its blocks + joined task titles.
 *   - Calendar: a 28-day window of schedules + their blocks.
 *
 * Both have N+1 problems in the legacy page code. These helpers fetch
 * once per shape (no per-row queries) and project only the columns the
 * UI uses, so the JSONB-heavy `tasks` rows aren't dragged over the wire.
 */
import { and, eq, asc, gte, lte, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/client";
import { schedules, studyBlocks, tasks, blockNotes } from "@/lib/db/schema";

const TASK_REF_PROJECTION = {
  id: tasks.id,
  title: tasks.title,
  code: tasks.code,
} as const;

const BLOCK_LIST_PROJECTION = {
  id: studyBlocks.id,
  scheduleId: studyBlocks.scheduleId,
  taskId: studyBlocks.taskId,
  type: studyBlocks.type,
  title: studyBlocks.title,
  startMinute: studyBlocks.startMinute,
  durationMinutes: studyBlocks.durationMinutes,
  status: studyBlocks.status,
  // objective + deliverable intentionally excluded — the Today list doesn't
  // render them. The calendar detail panel does, and it reads these from
  // CALENDAR_BLOCK_PROJECTION instead.
} as const;

/**
 * The calendar's block shape. Carries objective/deliverable plus the joined
 * task reference and a note flag so the grid can render a complete detail
 * panel without a second round-trip per click.
 *
 * A 28-day window is ~170 blocks, so pulling two short text columns costs
 * nothing measurable next to the per-click fetch it replaces.
 */
const CALENDAR_BLOCK_PROJECTION = {
  ...BLOCK_LIST_PROJECTION,
  objective: studyBlocks.objective,
  deliverable: studyBlocks.deliverable,
} as const;

export type CalendarBlock = {
  id: string;
  scheduleId: string;
  taskId: string | null;
  type: string;
  title: string;
  startMinute: number;
  durationMinutes: number;
  status: string;
};

export type CalendarBlockDetail = CalendarBlock & {
  objective: string | null;
  deliverable: string | null;
  taskCode: string | null;
  taskTitle: string | null;
  hasNote: boolean;
};

export type CalendarEntry = {
  schedule: { id: string; date: string; objective: string | null };
  blocks: CalendarBlockDetail[];
};

async function _getCalendarRange(userId: string, start: string, end: string): Promise<CalendarEntry[]> {
  const rows = await db
    .select({
      id: schedules.id,
      date: schedules.date,
      objective: schedules.objective,
    })
    .from(schedules)
    .where(
      and(
        eq(schedules.userId, userId),
        gte(schedules.date, start),
        lte(schedules.date, end),
      ),
    );
  if (rows.length === 0) return [];

  const scheduleIds = rows.map((r) => r.id);
  const blocks = await db
    .select(CALENDAR_BLOCK_PROJECTION)
    .from(studyBlocks)
    .where(inArray(studyBlocks.scheduleId, scheduleIds))
    .orderBy(asc(studyBlocks.startMinute));

  // Two batched follow-ups instead of per-block lookups: task titles for the
  // detail panel, and which blocks already have a note (the FileText dot).
  const taskIds = Array.from(new Set(blocks.map((b) => b.taskId).filter(Boolean) as string[]));
  const taskMap = new Map<string, { id: string; title: string; code: string | null }>();
  if (taskIds.length > 0) {
    const taskRows = await db.select(TASK_REF_PROJECTION).from(tasks).where(inArray(tasks.id, taskIds));
    for (const t of taskRows) taskMap.set(t.id, t);
  }

  const blockIds = blocks.map((b) => b.id);
  const notedBlockIds = new Set<string>();
  if (blockIds.length > 0) {
    const noteRows = await db
      .select({ blockId: blockNotes.blockId })
      .from(blockNotes)
      .where(and(inArray(blockNotes.blockId, blockIds), eq(blockNotes.userId, userId)));
    for (const n of noteRows) notedBlockIds.add(n.blockId);
  }

  const blocksBySchedule = new Map<string, CalendarBlockDetail[]>();
  for (const b of blocks) {
    const detail: CalendarBlockDetail = {
      ...b,
      taskCode: b.taskId ? (taskMap.get(b.taskId)?.code ?? null) : null,
      taskTitle: b.taskId ? (taskMap.get(b.taskId)?.title ?? null) : null,
      hasNote: notedBlockIds.has(b.id),
    };
    const arr = blocksBySchedule.get(b.scheduleId) ?? [];
    arr.push(detail);
    blocksBySchedule.set(b.scheduleId, arr);
  }

  return rows.map((r) => ({
    schedule: r,
    blocks: blocksBySchedule.get(r.id) ?? [],
  }));
}

export function getCalendarRange(userId: string, start: string, end: string) {
  // Calendar window changes infrequently (a day's blocks don't change once
  // generated). 60s cache absorbs page-to-page navigation within a session.
  return unstable_cache(
    () => _getCalendarRange(userId, start, end),
    ["calendar-range", userId, start, end],
    { revalidate: 60, tags: [`schedule:${userId}`] },
  )();
}

export type TodayView = {
  schedule: { id: string; date: string; objective: string | null };
  blocks: Array<
    CalendarBlock & {
      taskTitle: string | null;
      taskCode: string | null;
    }
  >;
};

async function _getTodayView(
  userId: string,
  date: string,
): Promise<{ schedule: { id: string; date: string; objective: string | null }; taskMap: Map<string, { id: string; title: string; code: string | null }>; blocks: TodayView["blocks"] } | null> {
  const sched = (
    await db
      .select({ id: schedules.id, date: schedules.date, objective: schedules.objective })
      .from(schedules)
      .where(and(eq(schedules.userId, userId), eq(schedules.date, date)))
      .limit(1)
  )[0];
  if (!sched) return null;

  const blocks = await db
    .select(BLOCK_LIST_PROJECTION)
    .from(studyBlocks)
    .where(eq(studyBlocks.scheduleId, sched.id))
    .orderBy(asc(studyBlocks.startMinute));

  // Single batched query — replaces the N+1 loop in the legacy code.
  const taskIds = Array.from(new Set(blocks.map((b) => b.taskId).filter(Boolean) as string[]));
  const taskMap = new Map<string, { id: string; title: string; code: string | null }>();
  if (taskIds.length > 0) {
    const taskRows = await db
      .select(TASK_REF_PROJECTION)
      .from(tasks)
      .where(inArray(tasks.id, taskIds));
    for (const t of taskRows) taskMap.set(t.id, t);
  }

  return {
    schedule: sched,
    taskMap,
    blocks: blocks.map((b) => ({
      ...b,
      taskTitle: b.taskId ? (taskMap.get(b.taskId)?.title ?? null) : null,
      taskCode: b.taskId ? (taskMap.get(b.taskId)?.code ?? null) : null,
    })),
  };
}

/**
 * Returns the today schedule + blocks + joined task titles for a given date.
 * Note: when the user marks a block done via the API, the page already calls
 * `revalidatePath('/')`, which clears this cache indirectly through Next's
 * router cache. The 30s revalidate is a fallback.
 */
export function getTodayView(userId: string, date: string) {
  return unstable_cache(
    () => _getTodayView(userId, date),
    ["today-view", userId, date],
    { revalidate: 30, tags: [`schedule:${userId}`, `today:${userId}:${date}`] },
  )();
}
