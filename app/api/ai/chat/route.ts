/**
 * AI Chat (streaming). Server-Sent Events (SSE) over fetch.
 *
 * The client opens this endpoint with a normal POST; we respond with
 * a stream of `data: {...}\n\n` events until `data: [DONE]`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiConversations, aiMessages, tasks } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { getPrompt } from "@/lib/ai/prompts";
import { resolveAIConfig, getDefaultUser } from "@/lib/ai/service";
import { getProvider } from "@/lib/ai/registry";
import { assembleGlobalContext, buildTaskContext, renderContext } from "@/lib/ai/context";
import { titleFromPrompt } from "@/lib/ai/frame/title";
import { AIProviderError } from "@/lib/ai/provider";
import { applyLanguageDirective, getDefaultLanguage } from "@/lib/ai/language";
import { getStudyDate } from "@/lib/utils/study-date";

const Body = z.object({
  conversationId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  mode: z.enum(["TUTOR", "INTERVIEW", "FAILURE_DRILL", "DEBUG_DRILL", "KNOWLEDGE_GAP", "GLOBAL"]).default("TUTOR"),
  prompt: z.string(),
  /** Pre-built context (overrides auto context assembly). */
  contextOverride: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const user = parsed.data.userId
    ? { id: parsed.data.userId }
    : await getDefaultUser();
  const cfg = await resolveAIConfig(user.id);

  // Resolve / create conversation
  let convId = parsed.data.conversationId;
  if (!convId) {
    convId = ids.aiConv();
    // Name it after the first question, using the SAME rule the chat
    // frames use (lib/ai/frame/title.ts). This route used to do
    // `prompt.slice(0, 60)`, which kept newlines (a multi-line prompt
    // became a ragged one-line sidebar row), clipped to a private 60
    // that no other layer agreed with, and carried no task tag even
    // though the task is in scope right here on the body. Three
    // divergence bugs from one duplicated rule.
    //
    // The code lookup is one extra query on conversation creation —
    // a once-per-conversation cost, and it buys a sidebar where
    // "[PAY-01] idempotency check" is distinguishable from four other
    // "idempotency check" rows.
    let taskCode: string | null = null;
    if (parsed.data.taskId) {
      const bound = (
        await db
          .select({ code: tasks.code })
          .from(tasks)
          .where(eq(tasks.id, parsed.data.taskId))
          .limit(1)
      )[0];
      taskCode = bound?.code ?? null;
    }
    await db.insert(aiConversations).values({
      id: convId,
      userId: user.id,
      taskId: parsed.data.taskId ?? null,
      mode: parsed.data.mode,
      title: titleFromPrompt(parsed.data.prompt, taskCode),
    });
  }

  // Persist user message
  await db.insert(aiMessages).values({
    id: ids.aiMsg(),
    conversationId: convId,
    role: "USER",
    content: parsed.data.prompt,
  });

  // Build context if not overridden
  let contextMd = parsed.data.contextOverride ?? "";
  if (!parsed.data.contextOverride && parsed.data.taskId) {
    const { contextMd: built } = await buildTaskContext({
      userId: user.id,
      taskId: parsed.data.taskId,
      budgetChars: 8_000,
    });
    contextMd = built;
  } else if (!parsed.data.contextOverride && !parsed.data.taskId) {
    // Global chat (sidebar / instructor / dashboards). Pull today's schedule
    // and the task-code index so the AI can answer questions like "what
    // should I do today?" or "what is c8?" without the user re-pasting.
    const studyDate = await getStudyDate();
    const sections = await assembleGlobalContext({
      userId: user.id,
      studyDate,
      options: { includeRelatedTasks: true, budgetChars: 6_000 },
    });
    contextMd = renderContext(sections);
  }

  // Pick a prompt that matches the active mode. Each mode has its own
  // persona (interviewer, incident commander, etc.) and now also includes
  // the source-aware roadmap rules.
  const sysPrompt =
    parsed.data.mode === "INTERVIEW"
      ? getPrompt("TUTOR_INTERVIEWER")
      : parsed.data.mode === "FAILURE_DRILL"
        ? getPrompt("TUTOR_FAILURE_DRILL")
        : parsed.data.mode === "DEBUG_DRILL"
          ? getPrompt("TUTOR_DEBUG_DRILL")
          : parsed.data.mode === "KNOWLEDGE_GAP"
            ? getPrompt("TUTOR_KNOWLEDGE_GAP")
            : getPrompt("TUTOR_SYSTEM");
  const userLang = await getDefaultLanguage(user.id);
  const systemContent = applyLanguageDirective(sysPrompt.system, userLang);
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, convId))
    .orderBy(asc(aiMessages.createdAt))
    .limit(40);

  const messages = [
    { role: "system" as const, content: systemContent },
    ...history
      .filter((m) => m.role !== "SYSTEM")
      .map((m) => ({ role: m.role.toLowerCase() as "user" | "assistant", content: m.content })),
    {
      role: "user" as const,
      content: `${contextMd ? `\n\n---\n${contextMd}\n---\n\n` : ""}${parsed.data.prompt}`,
    },
  ];

  // Stream
  const provider = getProvider(cfg.provider, { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
  const stream = new ReadableStream({
    async start(ctrlStream) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => {
        ctrlStream.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      let acc = "";

      // Coalesce upstream deltas so we flush at most every FLUSH_INTERVAL_MS
      // (or sooner if the buffer hits FLUSH_MAX_CHARS). This dramatically
      // reduces SSE event count + React state updates per token, making the
      // client stream feel smooth instead of jittery.
      const FLUSH_INTERVAL_MS = 40;
      const FLUSH_MAX_CHARS = 40;
      let buffer = "";
      let lastFlush = Date.now();
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flushBuffer = (force = false) => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (!buffer) return;
        if (!force && Date.now() - lastFlush < FLUSH_INTERVAL_MS && buffer.length < FLUSH_MAX_CHARS) {
          flushTimer = setTimeout(() => flushBuffer(true), FLUSH_INTERVAL_MS);
          return;
        }
        const out = buffer;
        buffer = "";
        lastFlush = Date.now();
        send({ type: "delta", text: out });
      };

      try {
        const result = await provider.stream(
          { messages, model: cfg.model, temperature: cfg.temperature, maxTokens: cfg.maxTokens },
          (chunk) => {
            if (!chunk.delta) return;
            acc += chunk.delta;
            buffer += chunk.delta;
            flushBuffer(false);
          },
        );
        // Flush whatever is still buffered before the final "done" event.
        flushBuffer(true);
        // persist assistant message
        await db.insert(aiMessages).values({
          id: ids.aiMsg(),
          conversationId: convId!,
          role: "ASSISTANT",
          content: result.text || acc,
          metadata: {
            provider: result.provider,
            model: result.model,
            usage: result.usage,
            promptName: sysPrompt.name,
            promptVersion: sysPrompt.version,
          },
        });
        send({ type: "done", conversationId: convId, usage: result.usage });
      } catch (err) {
        const kind = err instanceof AIProviderError ? err.kind : "provider_failure";
        const message = err instanceof Error ? err.message : "Unknown error";
        // Persist the error as an assistant turn so the conversation log
        // isn't left hanging with a user message but no AI reply.
        await db.insert(aiMessages).values({
          id: ids.aiMsg(),
          conversationId: convId!,
          role: "ASSISTANT",
          content: `⚠️ ${message} (${kind})`,
          metadata: { error: true, kind },
        });
        // A conversation whose only turn failed is an empty
        // conversation — the same rule the chat frames follow. The row
        // exists for the rest of THIS request so the client can stream
        // the error, then goes away; otherwise every failed first
        // message leaves a titled, one-error row the user never had a
        // conversation in. `history` is this conversation's messages
        // INCLUDING the user message just inserted, so `<= 1` means
        // this turn was the first.
        if (history.length <= 1) {
          await db.delete(aiConversations).where(eq(aiConversations.id, convId!));
        }
        send({ type: "error", kind, message });
      } finally {
        ctrlStream.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}