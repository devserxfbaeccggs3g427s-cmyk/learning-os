/**
 * AI-generated prompt suggestions (sidebar "Suggested questions").
 *
 * Returns topic-organized starter prompts tailored to the user's context.
 *
 * Modes:
 *   - "GLOBAL": cross-task. Source = today's schedule + open-task index.
 *   - "TUTOR":  task-scoped. Source = focused task + user notes for it.
 *
 * Designed to be cheap: small prompt, structured output, no streaming, no
 * persistence. The client caches per (mode, scope, day) in sessionStorage.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAIConfig, getDefaultUser } from "@/lib/ai/service";
import { getProvider } from "@/lib/ai/registry";
import { getPrompt } from "@/lib/ai/prompts";
import { PromptSuggestionsSchema, type PromptSuggestions } from "@/lib/ai/schemas";
import {
  buildTaskContext,
  assembleGlobalContext,
  renderContext,
} from "@/lib/ai/context";
import { getStudyDate } from "@/lib/utils/study-date";
import { buildLanguageDirective, getDefaultLanguage } from "@/lib/ai/language";

const Body = z.object({
  userId: z.string().nullable().optional(),
  mode: z.enum(["GLOBAL", "TUTOR"]).default("GLOBAL"),
  taskId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const user = parsed.data.userId
    ? { id: parsed.data.userId }
    : await getDefaultUser();
  const cfg = await resolveAIConfig(user.id);
  if (!cfg.apiKey) {
    return NextResponse.json(
      { error: "AI not configured" },
      { status: 400 },
    );
  }
  const provider = getProvider(cfg.provider, {
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
  });

  // Build the source block — keep it tight; we don't need 8k chars of
  // context for starter prompts.
  let source = "";
  let focusedTaskTitle: string | undefined;
  if (parsed.data.mode === "TUTOR" && parsed.data.taskId) {
    const { taskRow, noteRow, contextMd } = await buildTaskContext({
      userId: user.id,
      taskId: parsed.data.taskId,
      budgetChars: 3_500,
    });
    focusedTaskTitle = taskRow?.title;
    source = noteRow?.content?.trim() ? noteRow.content : contextMd;
    if (!source) source = contextMd;
  } else {
    const studyDate = await getStudyDate();
    const sections = await assembleGlobalContext({
      userId: user.id,
      studyDate,
      options: { includeRelatedTasks: true, budgetChars: 3_500 },
    });
    source = renderContext(sections);
  }

  const sysPrompt = getPrompt("SUGGESTIONS_GENERATOR");
  const userLang = await getDefaultLanguage(user.id);
  const langDirective = buildLanguageDirective(userLang);

  const focusLine = focusedTaskTitle
    ? `\nFocused task: ${focusedTaskTitle}`
    : "";

  const baseMessages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: sysPrompt.system },
    {
      role: "user",
      content:
        `Mode: ${parsed.data.mode}.${focusLine}\n\n` +
        `Source:\n${source || "(no source material provided)"}\n\n` +
        `Generate topic-organized starter prompts for this user.` +
        langDirective,
    },
  ];

  const maxTokens = Math.max(cfg.maxTokens, sysPrompt.defaultMaxTokens ?? 1600);

  let result: PromptSuggestions;
  try {
    const r = await provider.generateStructured<PromptSuggestions>({
      messages: baseMessages,
      model: cfg.model,
      schema: PromptSuggestionsSchema,
      temperature: cfg.temperature,
      maxTokens,
    });
    result = r.data;
  } catch (err) {
    // One retry: cheaper sampling + a tighter "JSON only" reminder. This
    // rescues the case where the first attempt wrapped output in prose or
    // was truncated mid-object.
    const isMalformed =
      err instanceof Error &&
      /invalid json|schema|malformed_output/i.test(err.message);
    if (!isMalformed) {
      return NextResponse.json(
        {
          error: "AI generation failed",
          details: err instanceof Error ? err.message : "unknown",
        },
        { status: 502 },
      );
    }
    try {
      const r = await provider.generateStructured<PromptSuggestions>({
        messages: [
          ...baseMessages,
          {
            role: "user",
            content:
              "Your previous answer was not parseable. Reply with ONLY the JSON object — no prose, no markdown fences, no commentary. Start with `{` and end with `}`.",
          },
        ],
        model: cfg.model,
        schema: PromptSuggestionsSchema,
        temperature: 0.2,
        maxTokens: Math.ceil(maxTokens * 1.2),
      });
      result = r.data;
    } catch (err2) {
      return NextResponse.json(
        {
          error: "AI generation failed",
          details: err2 instanceof Error ? err2.message : "unknown",
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ topics: result.topics });
}