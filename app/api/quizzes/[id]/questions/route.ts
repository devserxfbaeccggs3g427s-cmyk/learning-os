import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { quizQuestions } from "@/lib/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const qs = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id))
    .orderBy(asc(quizQuestions.orderIndex));
  return NextResponse.json({
    questions: qs.map((q) => ({
      id: q.id,
      questionType: q.questionType,
      prompt: q.prompt,
      options: Array.isArray(q.options)
        ? (q.options as Array<{ id: string; text: string }>)
        : [],
      correctAnswer: Array.isArray(q.correctAnswer)
        ? (q.correctAnswer as string[])
        : [],
      explanation: q.explanation,
    })),
  });
}