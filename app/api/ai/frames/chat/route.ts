/**
 * AI chat frame turn — Server-Sent Events (SSE), same wire format as
 * `/api/ai/chat` so the existing client hook can consume it.
 *
 * What is different from the legacy route, and why:
 *
 *  - Context is built ONLY from this frame's own messages plus whatever
 *    `knowledgeMode` explicitly opts into. The legacy route injects
 *    task context when `taskId` is present AND injects today's schedule
 *    + task index when it is absent — there is no no-context path there
 *    at all. Frames are a separate endpoint precisely so they can have
 *    that path.
 *
 *  - `buildTaskContext` / `assembleGlobalContext` are never imported
 *    here. Enforced by tests/frame-isolation.test.ts.
 *
 *  - The rate limiter runs before any DB write or provider call, so a
 *    throttled turn costs nothing.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiChatFrames, aiChatMessages, auditLog, tasks } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { getPrompt } from "@/lib/ai/prompts";
import { resolveAIConfig, getDefaultUser } from "@/lib/ai/service";
import { getProvider } from "@/lib/ai/registry";
import { AIProviderError } from "@/lib/ai/provider";
import { applyLanguageDirective, getDefaultLanguage } from "@/lib/ai/language";
import { clamp, trimHistoryWindow } from "@/lib/ai/text-budget";
import { parseKnowledgeMode, grantsKnowledge } from "@/lib/ai/frame/scope";
import { buildFrameCorpus, buildCodeLookup } from "@/lib/ai/frame/corpus";
import { retrieveKnowledge, DEFAULT_RETRIEVAL_BUDGET_CHARS } from "@/lib/ai/frame/retrieval";
import { detectNoAnswer } from "@/lib/ai/frame/no-answer";
import { frameRateLimiter, frameRateKey } from "@/lib/ai/frame/rate-limit";
import { isUnnamed, titleFromPrompt } from "@/lib/ai/frame/title";

const MAX_PROMPT_CHARS = 8_000;
const HISTORY_WINDOW = 30;

const Body = z
  .object({
    frameId: z.string().nullable().optional(),
    userId: z.string().nullable().optional(),
    prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
    knowledgeMode: z.string().nullable().optional(),
    renderMode: z.enum(["stream", "wait"]).optional(),
  })
  // Reject `taskId` / `contextOverride` smuggling outright: a caller
  // that thinks it can inject task context must get a loud 400, not a
  // silently ignored field.
  .strict();

/** Render retrieved hits into the labeled block the prompt expects. */
function renderGrounding(hits: Array<{ doc: { label: string; body: string }; score: number }>): string {
  if (hits.length === 0) return "";
  const lines = hits.map((h) => `[${h.doc.label}] (score ${h.score.toFixed(2)})\n${h.doc.body}`);
  return clamp(
    `:::section[RETRIEVED PROJECT KNOWLEDGE]\nThe following excerpts were retrieved for this question only. Use them as the factual basis for your answer and cite their labels. Do not treat them as a complete view of the project.\n\n${lines.join("\n\n---\n\n")}\n:::`,
    DEFAULT_RETRIEVAL_BUDGET_CHARS,
  );
}

export async function POST(req: Request) {
  const user = await getDefaultUser();
  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Hardening over the repo-wide convention (most routes trust a
  // body-supplied userId verbatim): a frame must never be writable on
  // behalf of another user.
  if (parsed.data.userId && parsed.data.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit before any DB write or provider call.
  const rate = frameRateLimiter.hit(frameRateKey(req, user.id));
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error:
          rate.reason === "daily"
            ? "Daily AI frame budget exhausted. Try again tomorrow."
            : "Too many AI frame messages. Slow down and try again shortly.",
      },
      { status: 429 },
    );
  }

  let frameId = parsed.data.frameId ?? null;
  if (!frameId) {
    frameId = ids.aiFrame();
    await db.insert(aiChatFrames).values({
      id: frameId,
      userId: user.id,
      title: parsed.data.prompt.slice(0, 60),
      entryPoint: "UNKNOWN",
      knowledgeMode: parseKnowledgeMode(parsed.data.knowledgeMode),
    });
  }

  // Ownership check: a frame must belong to this user. A foreign or
  // unknown frame id is the same 404 — no oracle for which ids exist.
  const frame = (
    await db
      .select()
      .from(aiChatFrames)
      .where(eq(aiChatFrames.id, frameId))
      .limit(1)
  )[0];
  if (!frame || frame.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Per-turn scope: the request may narrow it (e.g. "search harder") but
  // the stored scope is what persists.
  const knowledgeMode = parseKnowledgeMode(parsed.data.knowledgeMode ?? frame.knowledgeMode);

  await db.insert(aiChatMessages).values({
    id: ids.aiFrameMsg(),
    frameId,
    role: "USER",
    content: parsed.data.prompt,
  });

  // Name the frame after its first question, ONCE. A frame whose
  // title is still the placeholder is one nobody has named, so the
  // user's own words win — and a frame they have renamed (via PATCH,
  // or by hand) is never overwritten by turn two.
  //
  // This runs here rather than on create because the create call
  // happens before the user has typed anything: titling it server-side
  // would mean either "New chat" forever or guessing from a seed the
  // user never sent.
  if (isUnnamed(frame.title)) {
    // The prefix needs the bound task's CODE, which the frame row
    // stores as an id. Only the bound task qualifies — a task id
    // typed into the prompt is just part of the question.
    let boundCode: string | null = null;
    if (frame.taskId) {
      const bound = (
        await db
          .select({ code: tasks.code })
          .from(tasks)
          .where(eq(tasks.id, frame.taskId))
          .limit(1)
      )[0];
      boundCode = bound?.code ?? null;
    }
    await db
      .update(aiChatFrames)
      .set({ title: titleFromPrompt(parsed.data.prompt, boundCode), updatedAt: new Date() })
      .where(eq(aiChatFrames.id, frameId));
  }

  // ---- Build context: this frame's history + opted-in knowledge only.
  const historyRows = await db
    .select({ role: aiChatMessages.role, content: aiChatMessages.content })
    .from(aiChatMessages)
    .where(eq(aiChatMessages.frameId, frameId))
    .orderBy(asc(aiChatMessages.createdAt));

  // The freshly-inserted user message is already in `historyRows`, so
  // it is included once below rather than appended twice.
  const history = trimHistoryWindow(historyRows, HISTORY_WINDOW);

  let groundingMd = "";
  let telemetry = { candidates: 0, hits: 0, topScore: 0 };
  let grounded = false;
  // The corpus is worth building when the mode opts into knowledge,
  // OR the frame has a bound task — that one task is in scope at
  // every mode including NONE (it is what the frame was opened
  // for). A frame with no bound task at NONE has an empty corpus
  // by construction, so this stays free for them.
  if (grantsKnowledge(knowledgeMode) || frame?.taskId) {
    const corpus = await buildFrameCorpus({
      userId: user.id,
      frameId,
      // The bound task is read off the FRAME ROW, never the body — the
      // body schema is `.strict()` and rejects a smuggled taskId, so a
      // caller cannot aim this frame at a task it does not belong to.
      taskId: frame?.taskId ?? null,
      knowledgeMode,
      query: parsed.data.prompt,
    });
    const result = retrieveKnowledge(parsed.data.prompt, corpus, {
      codeLookup: buildCodeLookup(corpus),
    });
    groundingMd = renderGrounding(result.hits);
    telemetry = result.telemetry;
    grounded = result.grounded;
  }

  const sysPrompt = getPrompt("FRAME_CHAT");
  const userLang = await getDefaultLanguage(user.id);
  const systemContent = applyLanguageDirective(sysPrompt.system, userLang);

  const messages = [
    { role: "system" as const, content: systemContent },
    ...history.map((m) => ({
      role: m.role.toLowerCase() as "user" | "assistant",
      content: m.content,
    })),
  ];
  // Retrieved knowledge is appended to the system turn, not spliced into
  // the transcript — so it never becomes something the model later
  // treats as something "the user said".
  if (groundingMd) {
    messages[0] = { role: "system", content: `${systemContent}\n\n${groundingMd}` };
  }

  const cfg = await resolveAIConfig(user.id);
  const provider = getProvider(cfg.provider, { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });

  const stream = new ReadableStream({
    async start(ctrlStream) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => {
        ctrlStream.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      let acc = "";

      // Same delta-coalescing as the legacy route: at most one SSE
      // event every ~40ms keeps the client's rAF batching happy.
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
        flushBuffer(true);
        const finalText = result.text || acc;
        await db.insert(aiChatMessages).values({
          id: ids.aiFrameMsg(),
          frameId,
          role: "ASSISTANT",
          content: finalText,
          metadata: {
            provider: result.provider,
            model: result.model,
            usage: result.usage,
            promptName: sysPrompt.name,
            promptVersion: sysPrompt.version,
            knowledgeMode,
            grounded,
            noAnswer: detectNoAnswer(finalText),
            retrieval: telemetry,
          },
        });
        await db.insert(auditLog).values({
          id: ids.audit(),
          userId: user.id,
          action: "AI_FRAME_MESSAGE",
          subjectType: "AI_CHAT_FRAME",
          subjectId: frameId,
          // Counts and lengths only — never message content.
          metadata: {
            knowledgeMode,
            grounded,
            hits: telemetry.hits,
            promptChars: parsed.data.prompt.length,
            replyChars: finalText.length,
            tokensOut: result.usage?.outputTokens ?? null,
          },
        });
        send({
          type: "done",
          frameId,
          usage: result.usage,
          grounded,
          noAnswer: detectNoAnswer(finalText),
          retrieval: telemetry,
        });
      } catch (err) {
        const kind = err instanceof AIProviderError ? err.kind : "provider_failure";
        const message = err instanceof Error ? err.message : "Unknown error";
        await db.insert(aiChatMessages).values({
          id: ids.aiFrameMsg(),
          frameId,
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