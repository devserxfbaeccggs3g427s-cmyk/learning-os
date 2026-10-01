/**
 * Today — the home / command-center screen.
 *
 * Uses the study-date cookie (see lib/utils/study-date.ts) so users can
 * temporarily view another day without changing the system clock.
 *
 * Performance notes:
 *   - getDefaultUser() is cached (single-user app)
 *   - getStudyDateInfo() reads the cookie once
 *   - All top-level awaits run in parallel via Promise.all
 *   - The slow schedule/blocks fetch lives inside a Suspense boundary so
 *     the AppShell + header stream in immediately.
 */
import { Suspense } from "react";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { schedules as scheduleTable } from "@/lib/db/schema";
import { getDefaultUser } from "@/lib/ai/service";
import { AppShell } from "@/components/layout/AppShell";
import { TodayView } from "@/components/today/TodayView";
import { TodayViewSkeleton } from "@/components/today/TodayViewSkeleton";
import { getStudyDateInfo } from "@/lib/utils/study-date";
import { getTodayView } from "@/lib/db/queries/schedule";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // 3 parallel reads: cached user + single cookie read + (real today is sync).
  const [user, study] = await Promise.all([
    getDefaultUser(),
    getStudyDateInfo(),
  ]);
  const { value: date, overridden, realToday } = study;

  return (
    <AppShell>
      <Suspense fallback={<TodayViewSkeleton date={date} realToday={realToday} overridden={overridden} />}>
        <TodayData userId={user.id} date={date} overridden={overridden} realToday={realToday} />
      </Suspense>
    </AppShell>
  );
}

async function TodayData({
  userId,
  date,
  overridden,
  realToday,
}: {
  userId: string;
  date: string;
  overridden: boolean;
  realToday: string;
}) {
  // Lazy-create schedule row for the requested date if absent.
  const existing = (
    await db
      .select({ id: scheduleTable.id })
      .from(scheduleTable)
      .where(and(eq(scheduleTable.userId, userId), eq(scheduleTable.date, date)))
      .limit(1)
  )[0];

  if (!existing) {
    const { ids } = await import("@/lib/utils/ids");
    const id = ids.schedule();
    await db.insert(scheduleTable).values({
      id,
      userId,
      date,
      objective: overridden
        ? `Study date override — ${realToday} không có study blocks; xem lịch ngày ${date}.`
        : "Welcome — your daily schedule appears here once tasks are scheduled.",
    });
  }

  // Single cached fetch: schedule + blocks + task titles (no N+1).
  const view = await getTodayView(userId, date);

  if (!view) {
    return (
      <TodayView
        userId={userId}
        date={date}
        realToday={realToday}
        overridden={overridden}
        objective=""
        blocks={[]}
      />
    );
  }

  return (
    <TodayView
      userId={userId}
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
  );
}