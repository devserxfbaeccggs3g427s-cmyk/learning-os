import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { quizzes, quizAttempts } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { getDefaultUser } from "@/lib/ai/service";
import { nowIso } from "@/lib/utils/time";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quiz = (await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1))[0];
  if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  const user = await getDefaultUser();
  const attemptId = ids.attempt();
  await db.insert(quizAttempts).values({
    id: attemptId,
    quizId: id,
    userId: user.id,
    startedAt: nowIso(),
    status: "IN_PROGRESS",
  });
  return NextResponse.json({ attemptId });
}