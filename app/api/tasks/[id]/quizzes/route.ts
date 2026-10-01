import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { quizzes } from "@/lib/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const qs = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.taskId, id))
    .orderBy(desc(quizzes.createdAt));
  return NextResponse.json({
    quizzes: qs.map((q) => ({
      id: q.id,
      title: q.title,
      questionCount: q.questionCount,
      difficulty: q.difficulty,
      focus: q.focus,
      generatedBy: q.generatedBy,
    })),
  });
}