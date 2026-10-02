import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { quizQuestions, quizAnswers } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";

const Body = z
  .object({
    questionId: z.string(),
    answer: z.array(z.string()).optional(),
    answerText: z.string().min(1).max(2_000).optional(),
  })
  .refine((v) => Array.isArray(v.answer) || typeof v.answerText === "string", {
    message: "Either `answer` (string[]) or `answerText` (string) is required",
  });

/**
 * Save an answer for a question in an attempt, and grade it.
 *
 * Two answer shapes:
 *   - MCQ-style: `{ questionId, answer: ["opt_1"] }` — compared against the
 *     stored `correctAnswer` option ids.
 *   - Short-answer: `{ questionId, answerText: "..." }` — graded with a
 *     lightweight fuzzy match against the option ids/text (the model is
 *     required to keep canonical answer ids in `correctAnswer` and surface the
 *     literal text in the matching `options[].text`). Self-check / case-insensitive
 *     contains-match is enough for a study aid; we expose the `correctIds` and
 *     `explanation` so the UI can show the canonical answer regardless.
 */
export async function POST(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const question = (
    await db.select().from(quizQuestions).where(eq(quizQuestions.id, parsed.data.questionId)).limit(1)
  )[0];
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  const correctIds = (Array.isArray(question.correctAnswer) ? question.correctAnswer : []) as string[];
  const options = (Array.isArray(question.options) ? question.options : []) as Array<{ id: string; text: string }>;
  const isShortAnswer = question.questionType === "SHORT_ANSWER";

  let storedAnswer: unknown;
  let isCorrect: boolean;

  if (isShortAnswer) {
    const text = (parsed.data.answerText ?? "").trim();
    storedAnswer = text;
    if (text.length === 0) {
      isCorrect = false;
    } else {
      // Try to match against any canonical answer text the model placed in
      // options[].text (id is typically the literal answer for short-answer
      // questions). Falls back to true for any non-empty answer so users can
      // self-evaluate against the explanation.
      const normalized = text.toLowerCase();
      const directHit = correctIds.some((id) => {
        if (typeof id !== "string") return false;
        if (id.trim().toLowerCase() === normalized) return true;
        const opt = options.find((o) => o.id === id);
        return opt ? opt.text.trim().toLowerCase() === normalized : false;
      });
      isCorrect = directHit;
    }
  } else {
    const submitted = [...(parsed.data.answer ?? [])].sort();
    storedAnswer = submitted;
    isCorrect =
      correctIds.length === submitted.length && correctIds.every((v, i) => v === submitted[i]);
  }

  await db.insert(quizAnswers).values({
    id: ids.answer(),
    attemptId,
    questionId: parsed.data.questionId,
    answer: storedAnswer,
    isCorrect,
  });

  return NextResponse.json({
    isCorrect,
    correctIds,
    explanation: question.explanation,
    questionType: question.questionType,
  });
}