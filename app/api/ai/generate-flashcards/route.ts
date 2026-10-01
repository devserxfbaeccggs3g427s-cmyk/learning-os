/**
 * AI Flashcard generator.
 *
 * Pipeline:
 *   1. Assemble source (notes / task context).
 *   2. Build prompt via PromptRegistry.
 *   3. AI provider generateStructured → Zod parse check.
 *   4. Persist deck + cards.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flashcards, flashcardDecks, taskNotes, tasks } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { nowIso } from "@/lib/utils/time";
import { resolveAIConfig, getDefaultUser } from "@/lib/ai/service";
import { getProvider } from "@/lib/ai/registry";
import { getPrompt, renderUser } from "@/lib/ai/prompts";
import {
  FlashcardGenerationSchema,
  type FlashcardGeneration,
} from "@/lib/ai/schemas";
import { AI_GENERATION } from "@/config/domain";
import { clamp } from "@/lib/ai/context";

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

  // Pull source material
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
      `Why this matters: ${taskRow.whyThisMatters ?? ""}`,
      `Concepts: ${taskRow.concepts ?? ""}`,
      `Failure scenarios: ${taskRow.failureScenarios ?? ""}`,
    ].join("\n");
  } else if (parsed.data.source === "NOTES_ONLY" || parsed.data.source === "NOTES_AND_AI") {
    source = noteRow?.content ?? "";
  }
  source = clamp(source, AI_GENERATION.contextBudget.notesChars);

  const sysPrompt = getPrompt("FLASHCARD_GENERATOR");
  const messages = [
    { role: "system" as const, content: sysPrompt.system },
    {
      role: "user" as const,
      content: renderUser(
        `Generate exactly {{count}} flashcards.\nDifficulty: {{difficulty}}.\nFocus: {{focus}}.\n\nSource material:\n{{source}}`,
        {
          count: String(parsed.data.count),
          difficulty: parsed.data.difficulty,
          focus: parsed.data.focus,
          source: source || "(no source material provided)",
        },
      ),
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