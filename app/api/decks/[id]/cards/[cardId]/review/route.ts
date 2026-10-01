import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flashcards, reviewHistory } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { nowIso, nowDate } from "@/lib/utils/time";
import { scheduleCard } from "@/lib/srs/scheduler";

const Body = z.object({
  rating: z.enum(["AGAIN", "HARD", "GOOD", "EASY"]),
  durationSeconds: z.number().int().min(0).default(0),
  userId: z.string().optional(),
});

/**
 * Record a flashcard review and update the SRS schedule.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; cardId: string }> }) {
  const { cardId } = await params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const card = (await db.select().from(flashcards).where(eq(flashcards.id, cardId)).limit(1))[0];
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const userId = body.data.userId ?? "anonymous";
  const previous = {
    intervalDays: card.intervalDays,
    easeFactor: card.easeFactor,
    repetitions: card.repetitions,
    lapses: card.lapses,
  };
  const next = scheduleCard(previous, body.data.rating);

  await db
    .update(flashcards)
    .set({
      intervalDays: next.intervalDays,
      easeFactor: next.easeFactor,
      repetitions: next.repetitions,
      lapses: next.lapses,
      dueAt: next.dueAt,
      lastReviewedAt: nowIso(),
      updatedAt: nowDate(),
    })
    .where(eq(flashcards.id, cardId));

  await db.insert(reviewHistory).values({
    id: ids.review(),
    userId,
    flashcardId: cardId,
    rating: body.data.rating,
    previousIntervalDays: previous.intervalDays,
    newIntervalDays: next.intervalDays,
    previousEase: previous.easeFactor,
    newEase: next.easeFactor,
    durationSeconds: body.data.durationSeconds,
    reviewedAt: nowIso(),
  });

  return NextResponse.json({ ok: true, dueAt: next.dueAt, intervalDays: next.intervalDays });
}