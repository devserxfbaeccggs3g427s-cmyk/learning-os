/**
 * AI-generated prompt suggestions.
 *
 * Returns topic-organized starter prompts tailored to the user's context.
 *
 * Modes:
 *   - "GLOBAL": cross-task. Source = today's schedule + open-task index.
 *   - "TUTOR":  task-scoped. Source = focused task + user notes for it.
 *
 * Chat scopes:
 *   - "empty": chat is empty → use the source block to generate starter prompts.
 *   - "has":   chat has messages → use `chatContext` (the transcript) to
 *               generate follow-up prompts. For TUTOR we still keep the task
 *               source so follow-ups stay anchored to the focused task.
 *
 * Variety: when scope is GLOBAL+empty, a per-day rotated theme hint nudges
 * the prompt generator toward a different topic each day (so the same
 * suggestions don't repeat tomorrow).
 *
 * Designed to be cheap: small prompt, structured output, no streaming, no
 * persistence. The client caches per (mode, scope, day) in storage.
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
  /** Verbatim recent transcript (last few turns). */
  chatContext: z.string().max(8_000).optional(),
  /** "empty" → use source. "has" → chat-grounded follow-ups. */
  chatScope: z.enum(["empty", "has"]).default("empty"),
});

const GLOBAL_THEMES = [
  "explain a concept from today's schedule",
  "quiz the user on something from a recent note",
  "draft a small hands-on exercise for the next open task",
  "connect two roadmap topics into a study path",
  "summarise what the user learned recently",
  "act as an interviewer and ask a focused question",
  "help the user review an upcoming task",
];

function dailyThemeSeed(): string {
  const d = new Date();
  // Day-of-year + user-pseudo gives a per-day rotating seed.
  const doy = Math.floor(
    (d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  const theme = GLOBAL_THEMES[doy % GLOBAL_THEMES.length];
  return theme ?? GLOBAL_THEMES[0]!;
}

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

  const isTutor = parsed.data.mode === "TUTOR";
  const hasChat = parsed.data.chatScope === "has" && !!parsed.data.chatContext?.trim();

  // Build the source block — keep it tight; we don't need 8k chars of
  // context for starter prompts.
  let source = "";
  let focusedTaskTitle: string | undefined;
  let themeHint = "";

  if (isTutor && parsed.data.taskId) {
    // Task source is ALWAYS included for TUTOR so follow-ups stay anchored
    // to the focused task even when chatContext is present.
    const { taskRow, noteSource, contextMd } = await buildTaskContext({
      userId: user.id,
      taskId: parsed.data.taskId,
      budgetChars: 1_200,
    });
    focusedTaskTitle = taskRow?.title;
    source = noteSource ? noteSource : contextMd;
    if (!source) source = contextMd;
  } else if (!hasChat) {
    // GLOBAL + empty: include a SLIM global context (skip the full roadmap
    // tree — it's huge and adds little value to 3 starter prompts) + a
    // per-day theme hint.
    const studyDate = await getStudyDate();
    const sections = await assembleGlobalContext({
      userId: user.id,
      studyDate,
      options: {
        includeRelatedTasks: true,
        includeRoadmap: false,
        budgetChars: 1_200,
      },
    });
    source = renderContext(sections);
    themeHint = dailyThemeSeed();
  } else {
    // GLOBAL + has: chat is the source. Skip the heavy global context fetch
    // so we respond quickly; the latest exchange already carries the intent.
    source = "";
  }

  const sysPrompt = getPrompt("SUGGESTIONS_GENERATOR");
  const userLang = await getDefaultLanguage(user.id);
  const langDirective = buildLanguageDirective(userLang);

  const focusLine = focusedTaskTitle
    ? `\nFocused task: ${focusedTaskTitle}`
    : "";

  const themeLine = themeHint ? `\nTheme hint (today): ${themeHint}.` : "";
  const chatLine = hasChat
    ? `\nLatest exchange (user question + AI answer):\n${parsed.data.chatContext}`
    : "";

  const baseMessages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: sysPrompt.system },
    {
      role: "user",
      content:
        `Mode: ${parsed.data.mode}.${focusLine}` +
        `${themeLine}${chatLine}\n\n` +
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
        maxTokens: maxTokens,
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