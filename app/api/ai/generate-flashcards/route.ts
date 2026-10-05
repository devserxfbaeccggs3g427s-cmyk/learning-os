/**
 * AI Flashcard generator.
 *
 * Pipeline:
 *   1. Assemble source (notes / task context).
 *   2. Build prompt via PromptRegistry.
 *   3. AI provider generateStructured → Zod parse check.
 *   4. Persist deck + cards.
 *
 * Source-aware: builds a full roadmap-aware context block (ROADMAP CONTEXT
 * + ROADMAP TREE + PREREQUISITES + DEPENDENTS + TASK NOTE) so the deck
 * stays on-topic for the focused task. Falls back to the assembled context
 * when notes are empty.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { flashcards, flashcardDecks } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { resolveAIConfig, getDefaultUser } from "@/lib/ai/service";
import { getProvider } from "@/lib/ai/registry";
import { getPrompt, renderUser } from "@/lib/ai/prompts";
import {
  FlashcardGenerationSchema,
  type FlashcardGeneration,
} from "@/lib/ai/schemas";
import { AI_GENERATION } from "@/config/domain";
import { buildTaskContext, clamp } from "@/lib/ai/context";
import { buildLanguageDirective, getDefaultLanguage } from "@/lib/ai/language";

const Body = z.object({
  taskId: z.string(),
  userId: z.string().optional(),
  count: z.number().int().min(AI_GENERATION.flashcard.minCards).max(AI_GENERATION.flashcard.maxCards).default(AI_GENERATION.flashcard.defaultCards),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  focus: z.enum(["FUNDAMENTALS", "INTERNALS", "FAILURE_SCENARIOS", "PRODUCTION", "INTERVIEW", "MIXED"]).default("MIXED"),
  source: z.enum(["NOTES_ONLY", "TaskContext", "NOTES_AND_AI", "INCORRECT_QUIZ", "SELECTED_CONTENT"]).default("NOTES_ONLY"),
  selectedContent: z.string().max(20_000).optional(),
  title: z.string().min(1).max(120).default("Flashcards"),
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
  // was: notes empty → "(no source material provided)" → generic deck).
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
  } else if (parsed.data.source === "NOTES_ONLY" || parsed.data.source === "NOTES_AND_AI") {
    // Prefer the user's notes; fall back to the assembled task+roadmap
    // context when notes are empty so the AI still stays on-topic.
    source = noteSource ? noteSource : contextMd;
  }
  source = clamp(source, AI_GENERATION.contextBudget.notesChars);

  const sysPrompt = getPrompt("FLASHCARD_GENERATOR");
  // Flashcard prose fields (front.text, back.text, explanation) must respect
  // the user's configured output language. We inject the directive into the
  // user message (not the system prompt) so it doesn't conflict with the
  // strict "Output ONLY JSON" contract in FLASHCARD_GENERATOR.
  const userLang = await getDefaultLanguage(user.id);
  const langDirective = buildLanguageDirective(userLang);
  const messages = [
    { role: "system" as const, content: sysPrompt.system },
    {
      role: "user" as const,
      content:
        renderUser(
          `Generate exactly {{count}} flashcards.\nDifficulty: {{difficulty}}.\nFocus: {{focus}}.\n\nSource material:\n{{source}}`,
          {
            count: String(parsed.data.count),
            difficulty: parsed.data.difficulty,
            focus: parsed.data.focus,
            source: source || "(no source material provided)",
          },
        ) + langDirective,
    },
  ];

  const start = Date.now();
  let result: { data: FlashcardGeneration; model: string; provider: string; usage?: unknown };
  try {
    const r = await provider.generateStructured<FlashcardGeneration>({
      messages,
      model: cfg.model,
      schema: FlashcardGenerationSchema,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    });
    result = { data: r.data, model: r.model, provider: r.provider, usage: r.usage };
  } catch (err) {
    return NextResponse.json(
      {
        error: "AI generation failed",
        details: err instanceof Error ? err.message : "unknown",
      },
      { status: 502 },
    );
  }

  // Persist deck + cards atomically.
  const deckId = ids.deck();
  await db.transaction(async (tx) => {
    await tx.insert(flashcardDecks).values({
      id: deckId,
      taskId: parsed.data.taskId,
      userId: user.id,
      title: parsed.data.title,
      source: parsed.data.source,
      focus: parsed.data.focus,
      difficulty: parsed.data.difficulty,
      cardCount: result.data.cards.length,
      generatedBy: `${result.provider}:${result.model}`,
      promptName: sysPrompt.name,
      promptVersion: sysPrompt.version,
    });
    if (result.data.cards.length > 0) {
      await tx.insert(flashcards).values(
        result.data.cards.map((c, i) => ({
          id: ids.card(),
          deckId,
          orderIndex: i,
          cardType: c.cardType,
          front: c.front.text,
          back: c.back.text,
          explanation: c.explanation ?? null,
          difficulty: c.difficulty,
          tags: c.tags ?? [],
          sourceType: "AI",
        })),
      );
    }
    await tx.insert((await import("@/lib/db/schema")).aiArtifactRecords).values({
      id: ids.aiArtifact(),
      userId: user.id,
      artifactType: "FLASHCARD_DECK",
      artifactId: deckId,
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

  return NextResponse.json({ deckId, cardCount: result.data.cards.length });
}