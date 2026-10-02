/**
 * AI Quiz generator.
 *
 * Mirrors the flashcard generator but persists into Quiz/Question tables.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { quizzes, quizQuestions, taskNotes, tasks, aiArtifactRecords } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { resolveAIConfig, getDefaultUser } from "@/lib/ai/service";
import { getProvider } from "@/lib/ai/registry";
import { getPrompt, renderUser } from "@/lib/ai/prompts";
import { QuizGenerationSchema, type QuizGeneration } from "@/lib/ai/schemas";
import { AI_GENERATION } from "@/config/domain";
import { clamp } from "@/lib/ai/context";

const Body = z.object({
  taskId: z.string(),
  userId: z.string().optional(),
  count: z.number().int().min(AI_GENERATION.quiz.minQuestions).max(AI_GENERATION.quiz.maxQuestions).default(AI_GENERATION.quiz.defaultQuestions),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED", "SENIOR", "MIXED"]).default("MIXED"),
  focus: z.enum(["FUNDAMENTAL", "INTERNAL", "FAILURE", "PRODUCTION", "CODE", "INTERVIEW", "MIXED"]).default("MIXED"),
  source: z.enum(["NOTE_ONLY", "TaskContext", "NOTES_AND_AI", "FLASHCARDS", "WRONG_ANSWERS", "SELECTED_CONTENT"]).default("NOTE_ONLY"),
  selectedContent: z.string().max(20_000).optional(),
  title: z.string().min(1).max(120).default("Quiz"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const user = parsed.data.userId ? { id: parsed.data.userId } : await getDefaultUser();
  const cfg = await resolveAIConfig(user.id);
  if (!cfg.apiKey) {
    return NextResponse.json({ error: "AI not configured. Add an OpenRouter API key in Settings → AI." }, { status: 400 });
  }
  const provider = getProvider(cfg.provider, { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });

  const taskRow = (await db.select().from(tasks).where(eq(tasks.id, parsed.data.taskId)).limit(1))[0];
  if (!taskRow) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const noteRow = (await db.select().from(taskNotes).where(eq(taskNotes.taskId, parsed.data.taskId)).limit(1))[0];

  let source = "";
  if (parsed.data.source === "SELECTED_CONTENT" && parsed.data.selectedContent) {
    source = parsed.data.selectedContent;
  } else if (parsed.data.source === "TaskContext") {
    source = [
      `Task: ${taskRow.code ?? ""} ${taskRow.title}`,
      taskRow.description ?? "",
      taskRow.whyThisMatters ?? "",
    ].join("\n");
  } else if (parsed.data.source === "NOTE_ONLY" || parsed.data.source === "NOTES_AND_AI") {
    source = noteRow?.content ?? "";
  }
  source = clamp(source, AI_GENERATION.contextBudget.notesChars);

  const sysPrompt = getPrompt("QUIZ_GENERATOR");
  const messages = [
    { role: "system" as const, content: sysPrompt.system },
    {
      role: "user" as const,
      content: renderUser(
        `Generate exactly {{count}} quiz questions.\nDifficulty: {{difficulty}}.\nFocus: {{focus}}.\n\nSource:\n{{source}}`,
        {
          count: String(parsed.data.count),
          difficulty: parsed.data.difficulty,
          focus: parsed.data.focus,
          source: source || "(no source provided)",
        },
      ),
    },
  ];

  const start = Date.now();
  let result: { data: QuizGeneration; model: string; provider: string; usage?: unknown };
  try {
    const r = await provider.generateStructured<QuizGeneration>({
      messages,
      model: cfg.model,
      schema: QuizGenerationSchema,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    });
    result = { data: r.data, model: r.model, provider: r.provider, usage: r.usage };
  } catch (err) {
    return NextResponse.json(
      { error: "AI generation failed", details: err instanceof Error ? err.message : "unknown" },
      { status: 502 },
    );
  }

  const quizId = ids.quiz();
  await db.transaction(async (tx) => {
    await tx.insert(quizzes).values({
      id: quizId,
      taskId: parsed.data.taskId,
      userId: user.id,
      title: parsed.data.title,
      source: parsed.data.source,
      focus: parsed.data.focus,
      difficulty: parsed.data.difficulty,
      questionCount: result.data.questions.length,
      generatedBy: `${result.provider}:${result.model}`,
      promptName: sysPrompt.name,
      promptVersion: sysPrompt.version,
    });
    if (result.data.questions.length > 0) {
      await tx.insert(quizQuestions).values(
        result.data.questions.map((q, i) => ({
          id: ids.question(),
          quizId,
          orderIndex: i,
          questionType: q.questionType,
          prompt: q.prompt ?? "",
          options: q.options ?? [],
          correctAnswer: q.correctOptionIds ?? [],
          explanation: q.explanation ?? "",
          difficulty: q.difficulty,
          tags: q.tags ?? [],
          sourceRef: q.source ?? null,
        })),
      );
    }
    await tx.insert(aiArtifactRecords).values({
      id: ids.aiArtifact(),
      userId: user.id,
      artifactType: "QUIZ",
      artifactId: quizId,
      provider: result.provider,
      model: result.model,
      promptName: sysPrompt.name,
      promptVersion: sysPrompt.version,
      tokensIn: (result.usage as { inputTokens?: number } | undefined)?.inputTokens ?? null,
      tokensOut: (result.usage as { outputTokens?: number } | undefined)?.outputTokens ?? null,
      costUsd: (result.usage as { costUsd?: number } | undefined)?.costUsd ?? null,
      durationMs: Date.now() - start,
      success: true,
    });
  });

  return NextResponse.json({ quizId, questionCount: result.data.questions.length });
}