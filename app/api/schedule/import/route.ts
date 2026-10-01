import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { schedules, studyBlocks, tasks } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { ScheduleImportSchema } from "@/lib/ai/schemas";
import { getDefaultUser } from "@/lib/ai/service";

const Body = z.object({
  data: ScheduleImportSchema,
  dryRun: z.boolean().default(false),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid schedule JSON", details: parsed.error.flatten() }, { status: 400 });
  }
  const user = await getDefaultUser();
  const sch = parsed.data.data;

  const unresolved: string[] = [];
  for (const b of sch.blocks) {
    if (!b.taskId && !b.taskCode) {
      unresolved.push(b.title);
    }
  }

  if (parsed.data.dryRun) {
    return NextResponse.json({
      preview: { blocks: sch.blocks.length, unresolved: unresolved.length, totalMinutes: sch.blocks.reduce((a, x) => a + x.durationMinutes, 0) },
    });
  }

  let inserted = 0;
  let skipped = 0;
  let scheduleId = "";

  await db.transaction(async (tx) => {
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
    scheduleId = row.id;

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
  });

  return NextResponse.json({ ok: true, scheduleId, inserted, skipped });
}
