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
import { nowIso } from "@/lib/utils/time";

const Body = z.object({
  conversationId: z.string().optional(),
  userId: z.string().optional(),
  taskId: z.string().optional(),
  mode: z.enum(["TUTOR", "INTERVIEW", "FAILURE_DRILL", "DEBUG_DRILL", "KNOWLEDGE_GAP", "GLOBAL"]).default("TUTOR"),
  prompt: z.string(),
  /** Pre-built context (overrides auto context assembly). */
  contextOverride: z.string().optional(),
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
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, convId))
    .orderBy(asc(aiMessages.createdAt))
    .limit(40);

  const messages = [
    { role: "system" as const, content: sysPrompt.system },
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
      try {
        const result = await provider.stream(
          { messages, model: cfg.model, temperature: cfg.temperature, maxTokens: cfg.maxTokens },
          (chunk) => {
            acc += chunk.delta;
            send({ type: "delta", text: chunk.delta });
          },
        );
        // persist assistant message
        await db.insert(aiMessages).values({
          id: ids.aiMsg(),
          conversationId: convId!,
          role: "ASSISTANT",
          content: result.text || acc,
          metadata: JSON.stringify({
            provider: result.provider,
            model: result.model,
            usage: result.usage,
            promptName: sysPrompt.name,
            promptVersion: sysPrompt.version,
          }),
        });
        send({ type: "done", conversationId: convId, usage: result.usage });
      } catch (err) {
        const kind = err instanceof AIProviderError ? err.kind : "provider_failure";
        send({ type: "error", kind, message: err instanceof Error ? err.message : "Unknown error" });
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