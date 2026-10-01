import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { studySessions, taskProgress } from "@/lib/db/schema";
import { nowIso, nowDate, diffSeconds } from "@/lib/utils/time";

const FinishBody = z.object({
  status: z.enum(["COMPLETED", "ABANDONED", "PARTIAL"]).optional(),
  difficultyFeedback: z.number().int().min(1).max(5).optional(),
  confidence: z.number().int().min(1).max(5).optional(),
  sessionNotes: z.string().max(20_000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = FinishBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const existing = await db.select().from(studySessions).where(eq(studySessions.id, id)).limit(1);
  if (!existing[0]) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const sess = existing[0];
  const endedAt = nowIso();
  const endedAtDate = nowDate();
  const totalSeconds = diffSeconds(sess.startedAt, endedAt);

  await db
    .update(studySessions)
    .set({
      status: "COMPLETED",
      endedAt,
      durationSeconds: totalSeconds,
      completionStatus: parsed.data.status ?? "COMPLETED",
      difficultyFeedback: parsed.data.difficultyFeedback ?? null,
      confidence: parsed.data.confidence ?? null,
      sessionNotes: parsed.data.sessionNotes ?? sess.sessionNotes,
      updatedAt: endedAtDate,
    })
    .where(eq(studySessions.id, id));

  // update task progress rollup
  const existingProgress = await db
    .select()
    .from(taskProgress)
    .where(eq(taskProgress.taskId, sess.taskId))
    .limit(1);
  const delta = totalSeconds;
  if (existingProgress[0]) {
    await db
      .update(taskProgress)
      .set({
        totalStudySeconds: sql`${taskProgress.totalStudySeconds} + ${delta}`,
        sessionsCompleted: sql`${taskProgress.sessionsCompleted} + 1`,
        lastSessionAt: endedAt,
        completionRatio: Math.min(1, (existingProgress[0].totalStudySeconds + delta) / 60 / 45),
        updatedAt: endedAtDate,
      })
      .where(eq(taskProgress.taskId, sess.taskId));
  } else {
    await db.insert(taskProgress).values({
      taskId: sess.taskId,
      totalStudySeconds: delta,
      sessionsCompleted: 1,
      lastSessionAt: endedAt,
      completionRatio: Math.min(1, delta / 60 / 45),
      updatedAt: endedAtDate,
    });
  }

  return NextResponse.json({ ok: true, durationSeconds: totalSeconds });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await db.select().from(studySessions).where(eq(studySessions.id, id)).limit(1);
  if (!r[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(r[0]);
}