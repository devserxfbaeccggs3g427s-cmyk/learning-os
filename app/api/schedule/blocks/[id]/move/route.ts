import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { studyBlocks, schedules } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { nowDate } from "@/lib/utils/time";

const Body = z.object({
  userId: z.string(),
  /** Target calendar day (ISO). Omit to keep the block on its current day. */
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Target start, minutes since midnight. Omit to keep the current start. */
  newStartMinute: z.number().int().min(0).max(1440).optional(),
});

/**
 * Move a study block to another day and/or a different start time.
 *
 * Two shapes of move land here and both resolve to one UPDATE:
 *   - across days → the block's `schedule_id` changes to the target day's
 *     schedule row (created on demand, see below)
 *   - within a day → only `start_minute` changes
 *
 * There is no date column on `study_blocks` — the day IS the schedule row
 * it points at. So "find or create the schedule for this day" is the
 * interesting part: `schedules` carries no unique constraint on
 * `(user_id, date)`, and a plain select-then-insert races with a
 * concurrent insert, leaving two schedule rows for one day and splitting
 * that day's blocks across them. A transaction-scoped advisory lock keyed
 * on (user, date) serialises concurrent moves into the same day.
 *
 * Overlap is rejected (409) rather than silently allowed: two blocks
 * occupying the same minutes makes "what am I doing at 21:00?" ambiguous,
 * and the generated schedule never does it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { userId, newDate, newStartMinute } = parsed.data;

  // Ownership: the block must belong to one of this user's schedules.
  const owned = await db
    .select({
      startMinute: studyBlocks.startMinute,
      durationMinutes: studyBlocks.durationMinutes,
      currentDate: schedules.date,
    })
    .from(studyBlocks)
    .innerJoin(schedules, eq(schedules.id, studyBlocks.scheduleId))
    .where(and(eq(studyBlocks.id, id), eq(schedules.userId, userId)))
    .limit(1);
  const block = owned[0];
  if (!block) return NextResponse.json({ error: "Block not found" }, { status: 404 });

  const targetDate = newDate ?? block.currentDate;
  const targetStart = newStartMinute ?? block.startMinute;

  // Nothing to do — short-circuit so a no-op drag doesn't rewrite rows or
  // create a schedule row needlessly.
  if (targetDate === block.currentDate && targetStart === block.startMinute) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  try {
    await db.transaction(async (tx) => {
      // Released automatically when the transaction commits or rolls back.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext(${targetDate}))`,
      );

      const existing = await tx
        .select({ id: schedules.id })
        .from(schedules)
        .where(and(eq(schedules.userId, userId), eq(schedules.date, targetDate)))
        .limit(1);

      let scheduleId: string;
      if (existing[0]) {
        scheduleId = existing[0].id;
      } else {
        scheduleId = ids.schedule();
        await tx.insert(schedules).values({ id: scheduleId, userId, date: targetDate });
      }

      // Overlap check against the OTHER blocks already on the target day.
      // Half-open intervals: a block ending exactly at 12:30 does not
      // collide with one starting at 12:30.
      const endMinute = targetStart + block.durationMinutes;
      const clash = await tx
        .select({ id: studyBlocks.id })
        .from(studyBlocks)
        .where(
          and(
            eq(studyBlocks.scheduleId, scheduleId),
            ne(studyBlocks.id, id),
            sql`${studyBlocks.startMinute} < ${endMinute}`,
            sql`${studyBlocks.startMinute} + ${studyBlocks.durationMinutes} > ${targetStart}`,
          ),
        )
        .limit(1);
      if (clash[0]) throw new OverlapError();

      await tx
        .update(studyBlocks)
        .set({ scheduleId, startMinute: targetStart, updatedAt: nowDate() })
        .where(eq(studyBlocks.id, id));
    });
  } catch (err) {
    if (err instanceof OverlapError) {
      return NextResponse.json(
        { error: "That time is already taken on the target day." },
        { status: 409 },
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true, date: targetDate, startMinute: targetStart });
}

/**
 * Thrown inside the transaction to abort it. Distinct from a DB error so the
 * handler can map it to 409 without string-matching driver messages.
 */
class OverlapError extends Error {
  constructor() {
    super("overlap");
    this.name = "OverlapError";
  }
}