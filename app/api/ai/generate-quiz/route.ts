/**
 * AI Quiz generator.
 *
 * Mirrors the flashcard generator but persists into Quiz/Question tables.
 *
 * Source-aware: instead of a flat task excerpt, builds a full roadmap-aware
 * context block (ROADMAP CONTEXT + ROADMAP TREE + PREREQUISITES + DEPENDENTS
 * + TASK NOTE) so the generated questions stay on-topic for the focused
 * task. When the user has no notes, falls back to the assembled context
 * rather than emitting an empty prompt that drifts off-topic.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { quizzes, quizQuestions, aiArtifactRecords } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { resolveAIConfig, getDefaultUser } from "@/lib/ai/service";
import { getProvider } from "@/lib/ai/registry";
import { getPrompt, renderUser } from "@/lib/ai/prompts";
import { QuizGenerationSchema, type QuizGeneration } from "@/lib/ai/schemas";
import { AI_GENERATION } from "@/config/domain";
import { buildTaskContext, clamp } from "@/lib/ai/context";
import { buildLanguageDirective, getDefaultLanguage } from "@/lib/ai/language";

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

  // Build the source-aware context. We always fetch task + roadmap data so
  // the AI knows the topic even when notes are empty (the previous behavior
  // was: notes empty → "(no source provided)" → generic, off-topic quiz).
  const { taskRow, noteSource, contextMd } = await buildTaskContext({
    userId: user.id,
    taskId: parsed.data.taskId,
    budgetChars: AI_GENERATION.contextBudget.notesChars,
  });
  if (!taskRow) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let source = "";
  if (parsed.data.source === "SELECTED_CONTENT" && parsed.data.selectedContent) {
    source = parsed.data.selectedContent;
  } else if (parsed.data.source === "TaskContext") {
    source = contextMd;
  } else if (parsed.data.source === "NOTE_ONLY" || parsed.data.source === "NOTES_AND_AI") {
    // Prefer the user's notes; fall back to the assembled task+roadmap
    // context when notes are empty so the AI still stays on-topic.
    source = noteSource ? noteSource : contextMd;
  }
  source = clamp(source, AI_GENERATION.contextBudget.notesChars);

  const sysPrompt = getPrompt("QUIZ_GENERATOR");
  // Quiz prose fields (prompt, options[].text, explanation) must respect
  // the user's configured output language. We inject the directive into the
  // user message (not the system prompt) so it doesn't conflict with the
  // strict "Output ONLY JSON" contract in QUIZ_GENERATOR.
  const userLang = await getDefaultLanguage(user.id);
  const langDirective = buildLanguageDirective(userLang);
  const messages = [
    { role: "system" as const, content: sysPrompt.system },
    {
      role: "user" as const,
      content:
        renderUser(
          `Generate exactly {{count}} quiz questions.\nDifficulty: {{difficulty}}.\nFocus: {{focus}}.\n\nSource:\n{{source}}`,
          {
            count: String(parsed.data.count),
            difficulty: parsed.data.difficulty,
            focus: parsed.data.focus,
            source: source || "(no source provided)",
          },
        ) + langDirective,
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