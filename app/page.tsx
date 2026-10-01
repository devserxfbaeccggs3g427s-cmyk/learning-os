/**
 * Today — the home / command-center screen.
 *
 * Uses the study-date cookie (see lib/utils/study-date.ts) so users can
 * temporarily view another day without changing the system clock.
 */
import { redirect } from "next/navigation";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { schedules as scheduleTable, studyBlocks as blockTable, tasks } from "@/lib/db/schema";
import { getDefaultUser } from "@/lib/ai/service";
import { AppShell } from "@/components/layout/AppShell";
import { TodayView } from "@/components/today/TodayView";
import { getStudyDate, isStudyDateOverridden, getRealToday } from "@/lib/utils/study-date";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getDefaultUser();
  const date = await getStudyDate();
  const overridden = await isStudyDateOverridden();
  const realToday = getRealToday();

  // ensure a schedule row exists for the requested date (lazy create)
  let schedRow = (
    await db
      .select()
      .from(scheduleTable)
      .where(and(eq(scheduleTable.userId, user.id), eq(scheduleTable.date, date)))
      .limit(1)
  )[0];

  if (!schedRow) {
    const { ids } = await import("@/lib/utils/ids");
    const id = ids.schedule();
    await db.insert(scheduleTable).values({
      id,
      userId: user.id,
      date,
      objective: overridden
        ? `Study date override — ${realToday} không có study blocks; xem lịch ngày ${date}.`
        : "Welcome — your daily schedule appears here once tasks are scheduled.",
    });
    schedRow = (
      await db.select().from(scheduleTable).where(eq(scheduleTable.id, id)).limit(1)
    )[0]!;
  }

  const blocks = await db
    .select()
    .from(blockTable)
    .where(eq(blockTable.scheduleId, schedRow.id))
    .orderBy(blockTable.startMinute);

  const taskIds = blocks.map((b) => b.taskId).filter(Boolean) as string[];
  const taskById: Record<string, { id: string; title: string; code: string | null }> = {};
  for (const tid of taskIds) {
    const r = await db.select().from(tasks).where(eq(tasks.id, tid)).limit(1);
    if (r[0]) taskById[tid] = { id: r[0].id, title: r[0].title, code: r[0].code };
  }

  return (
    <AppShell>
      <TodayView
        userId={user.id}
        date={date}
        realToday={realToday}
        overridden={overridden}
        objective={schedRow.objective ?? ""}
        blocks={blocks.map((b) => ({
          id: b.id,
          taskId: b.taskId ?? null,
          type: b.type,
          title: b.title,
          objective: b.objective ?? null,
          startMinute: b.startMinute,
          durationMinutes: b.durationMinutes,
          deliverable: b.deliverable ?? null,
          status: b.status,
          taskTitle: b.taskId ? taskById[b.taskId]?.title ?? null : null,
          taskCode: b.taskId ? taskById[b.taskId]?.code ?? null : null,
        }))}
      />
    </AppShell>
  );
}