/**
 * AI Chat (streaming). Server-Sent Events (SSE) over fetch.
 *
 * The client opens this endpoint with a normal POST; we respond with
 * a stream of `data: {...}\n\n` events until `data: [DONE]`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiConversations, aiMessages, taskNotes, tasks } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { getPrompt } from "@/lib/ai/prompts";
import { resolveAIConfig, getDefaultUser } from "@/lib/ai/service";
import { getProvider } from "@/lib/ai/registry";
import { assembleContext } from "@/lib/ai/context";
import { AIProviderError } from "@/lib/ai/provider";
import { applyLanguageDirective, getDefaultLanguage } from "@/lib/ai/language";
import { nowIso } from "@/lib/utils/time";

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
    await db.insert(aiConversations).values({
      id: convId,
      userId: user.id,
      taskId: parsed.data.taskId ?? null,
      mode: parsed.data.mode,
      title: parsed.data.prompt.slice(0, 60),
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
    const taskRow = (await db.select().from(tasks).where(eq(tasks.id, parsed.data.taskId)).limit(1))[0];
    const noteRow = (await db.select().from(taskNotes).where(eq(taskNotes.taskId, parsed.data.taskId)).limit(1))[0];
    contextMd = [
      ":::INPUTS",
      JSON.stringify({
        task: taskRow
          ? {
              code: taskRow.code,
              title: taskRow.title,
              description: taskRow.description,
              status: taskRow.status,
              priority: taskRow.priority,
              difficulty: taskRow.difficulty,
              estimatedMinutes: taskRow.estimatedMinutes,
            }
          : null,
        notes: noteRow ? { content: noteRow.content } : null,
      }, null, 2),
      ":::",
    ].join("\n");
    // Use assembleContext to wrap labeled sections
    const sections = assembleContext({
      task: taskRow
        ? {
            code: taskRow.code,
            title: taskRow.title,
            description: taskRow.description,
            status: taskRow.status,
            priority: taskRow.priority,
            difficulty: taskRow.difficulty,
            estimatedMinutes: taskRow.estimatedMinutes,
          }
        : null,
      note: noteRow ? { content: noteRow.content } : null,
    });
    contextMd = sections.map((s) => `:::section[${s.label}]\n${s.content}\n:::`).join("\n\n");
  }

  // Build messages: system + history + user
  const sysPrompt = getPrompt("TUTOR_SYSTEM");
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