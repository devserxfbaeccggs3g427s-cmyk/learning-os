/**
 * Retrieval preview — what would a query match, without calling the
 * model and without persisting anything.
 *
 * Lets the UI show grounding chips (and an honest "nothing found")
 * before the user spends a turn on it. Same isolation rules as the
 * chat route: scoped to the resolved user and the frame's own
 * `knowledgeMode`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiChatFrames } from "@/lib/db/schema";
import { getDefaultUser } from "@/lib/ai/service";
import { parseKnowledgeMode } from "@/lib/ai/frame/scope";
import { buildFrameCorpus, buildCodeLookup } from "@/lib/ai/frame/corpus";
import { retrieveKnowledge } from "@/lib/ai/frame/retrieval";
import { frameRateLimiter, frameRateKey } from "@/lib/ai/frame/rate-limit";

const Body = z
  .object({
    frameId: z.string().nullable().optional(),
    userId: z.string().nullable().optional(),
    query: z.string().min(1).max(2_000),
    knowledgeMode: z.string().nullable().optional(),
  })
  .strict();

export async function POST(req: Request) {
  const user = await getDefaultUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.userId && parsed.data.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rate = frameRateLimiter.hit(frameRateKey(req, user.id));
  if (!rate.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let frameId = parsed.data.frameId ?? null;
  let frame = null;
  if (frameId) {
    frame = (
      await db
        .select()
        .from(aiChatFrames)
        .where(and(eq(aiChatFrames.id, frameId), eq(aiChatFrames.userId, user.id)))
        .limit(1)
    )[0];
    if (!frame) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const knowledgeMode = parseKnowledgeMode(parsed.data.knowledgeMode ?? frame?.knowledgeMode);
  if (!frameId) frameId = "preview"; // only used to scope pinned snippets

  const corpus = await buildFrameCorpus({
    userId: user.id,
    frameId,
    // Bound task comes off the frame row, not the body — see
    // the chat route: the body schema is `.strict()` and
    // rejects a smuggled taskId.
    taskId: frame?.taskId ?? null,
    knowledgeMode,
    query: parsed.data.query,
  });
  const result = retrieveKnowledge(parsed.data.query, corpus, {
    codeLookup: buildCodeLookup(corpus),
  });

  return NextResponse.json({
    knowledgeMode,
    grounded: result.grounded,
    retrieval: result.telemetry,
    hits: result.hits.map((h) => ({
      label: h.doc.label,
      kind: h.doc.kind,
      code: h.doc.code ?? null,
      title: h.doc.title ?? null,
      score: Number(h.score.toFixed(2)),
      matchedTerms: h.matchedTerms,
      // Preview only: enough to judge relevance, not the whole document.
      excerpt: h.doc.body.slice(0, 400),
    })),
  });
}