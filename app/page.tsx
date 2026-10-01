/**
 * Today — the home / command-center screen.
 *
 * Uses the study-date cookie (see lib/utils/study-date.ts) so users can
 * temporarily view another day without changing the system clock.
 */
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { schedules as scheduleTable } from "@/lib/db/schema";
import { getDefaultUser } from "@/lib/ai/service";
import { AppShell } from "@/components/layout/AppShell";
import { TodayView } from "@/components/today/TodayView";
import { getStudyDate, isStudyDateOverridden, getRealToday } from "@/lib/utils/study-date";
import { getTodayView } from "@/lib/db/queries/schedule";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getDefaultUser();
  const date = await getStudyDate();
  const overridden = await isStudyDateOverridden();
  const realToday = getRealToday();

  // Lazy-create schedule row for the requested date if absent. This is a
  // small write — not cached. The read of blocks + tasks below is cached
  // via getTodayView (30s + invalidation on update).
  const existing = (
    await db
      .select({ id: scheduleTable.id })
      .from(scheduleTable)
      .where(and(eq(scheduleTable.userId, user.id), eq(scheduleTable.date, date)))
      .limit(1)
  )[0];

  if (!existing) {
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
  }

  // Single cached fetch: schedule + blocks + task titles (no N+1).
  const view = await getTodayView(user.id, date);

  if (!view) {
    // Should not happen because we just lazy-created, but keep a fallback.
    return (
      <AppShell>
        <TodayView
          userId={user.id}
          date={date}
          realToday={realToday}
          overridden={overridden}
          objective=""
          blocks={[]}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <TodayView
        userId={user.id}
        date={date}
        realToday={realToday}
        overridden={overridden}
        objective={view.schedule.objective ?? ""}
        blocks={view.blocks.map((b) => ({
          id: b.id,
          taskId: b.taskId ?? null,
          type: b.type,
          title: b.title,
          objective: null, // not loaded by the list projection
          startMinute: b.startMinute,
          durationMinutes: b.durationMinutes,
          deliverable: null, // not loaded by the list projection
          status: b.status,
          taskTitle: b.taskTitle,
          taskCode: b.taskCode,
        }))}
      />
    </AppShell>
  );
}
