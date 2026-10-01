/**
 * Bulk schedule import.
 *
 * Accepts either:
 *   - { days: ScheduleImport[] }     → import each day
 *   - ScheduleImport[]               → same
 *
 * Each day is validated against ScheduleImportSchema before any DB write;
 * failures are reported in the response so the caller can fix & retry.
 *
 * Each day's writes happen inside its own transaction so a partial-day
 * failure doesn't roll back already-imported days.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { schedules, studyBlocks, tasks } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { ScheduleImportSchema } from "@/lib/ai/schemas";
import { getDefaultUser } from "@/lib/ai/service";

const Body = z.union([
  z.object({ days: z.array(ScheduleImportSchema) }),
  z.array(ScheduleImportSchema),
]);

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid batch body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const days = Array.isArray(parsed.data) ? parsed.data : parsed.data.days;
  const user = await getDefaultUser();

  const results: Array<{
    date: string;
    scheduleId: string;
    inserted: number;
    skipped: number;
  }> = [];
  const failures: Array<{ date: string; error: string }> = [];

  for (const sch of days) {
    try {
      const result = await db.transaction(async (tx) => {
        let row = (
          await tx
            .select()
            .from(schedules)
            .where(and(eq(schedules.userId, user.id), eq(schedules.date, sch.date)))
            .limit(1)
        )[0];
        if (!row) {
          const id = ids.schedule();
          await tx.insert(schedules).values({
            id,
            userId: user.id,
            date: sch.date,
            objective: sch.objective ?? null,
          });
          row = (
            await tx.select().from(schedules).where(eq(schedules.id, id)).limit(1)
          )[0]!;
        }

        let inserted = 0;
        let skipped = 0;
        let order = 0;
        for (const b of sch.blocks) {
          let taskId: string | null = b.taskId ?? null;
          if (!taskId && b.taskCode) {
            const t = (
              await tx.select().from(tasks).where(eq(tasks.code, b.taskCode)).limit(1)
            )[0];
            if (t) taskId = t.id;
          }
          if (!taskId) {
            skipped++;
            continue;
          }
          await tx.insert(studyBlocks).values({
            id: ids.block(),
            scheduleId: row.id,
            taskId,
            type: b.type,
            title: b.title,
            objective: b.objective ?? null,
            startMinute: b.startMinute,
            durationMinutes: b.durationMinutes,
            deliverable: b.deliverable ?? null,
            status: "PLANNED",
            orderIndex: order++,
          });
          inserted++;
        }

        return { date: sch.date, scheduleId: row.id, inserted, skipped };
      });
      results.push(result);
    } catch (err) {
      failures.push({ date: sch.date, error: err instanceof Error ? err.message : "unknown" });
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    totalDays: days.length,
    totalBlocksInserted: results.reduce((a, r) => a + r.inserted, 0),
    totalBlocksSkipped: results.reduce((a, r) => a + r.skipped, 0),
    results,
    failures,
  });
}
