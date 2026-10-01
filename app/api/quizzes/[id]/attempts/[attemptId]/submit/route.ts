import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { quizAttempts, quizAnswers } from "@/lib/db/schema";
import { nowIso } from "@/lib/utils/time";

export async function POST(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const attempt = (await db.select().from(quizAttempts).where(eq(quizAttempts.id, attemptId)).limit(1))[0];
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  const totals = await db
    .select({
      total: sql<number>`count(*)`,
      correct: sql<number>`SUM(CASE WHEN ${quizAnswers.isCorrect} THEN 1 ELSE 0 END)`,
    })
    .from(quizAnswers)
    .where(eq(quizAnswers.attemptId, attemptId));

  const total = Number(totals[0]?.total ?? 0);
  const correct = Number(totals[0]?.correct ?? 0);
  const incorrect = total - correct;
  const score = total > 0 ? correct / total : 0;

  await db
    .update(quizAttempts)
    .set({
      submittedAt: nowIso(),
      score,
      correctCount: correct,
      incorrectCount: incorrect,
      status: "SUBMITTED",
    })
    .where(eq(quizAttempts.id, attemptId));

  return NextResponse.json({ ok: true, total, correct, incorrect, score });
}