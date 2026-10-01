import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { quizQuestions, quizAnswers, quizAttempts } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { nowIso } from "@/lib/utils/time";

const Body = z.object({
  questionId: z.string(),
  answer: z.array(z.string()),
});

/**
 * Save an answer for a question in an attempt, and grade it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const question = (await db.select().from(quizQuestions).where(eq(quizQuestions.id, parsed.data.questionId)).limit(1))[0];
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  const correctIds = (Array.isArray(question.correctAnswer) ? question.correctAnswer : []) as string[];
  const submitted = [...parsed.data.answer].sort();
  const isCorrect = correctIds.length === submitted.length && correctIds.every((v, i) => v === submitted[i]);

  await db.insert(quizAnswers).values({
    id: ids.answer(),
    attemptId,
    questionId: parsed.data.questionId,
    answer: parsed.data.answer,
    isCorrect,
  });

  return NextResponse.json({
    isCorrect,
    correctIds,
    explanation: question.explanation,
  });
}