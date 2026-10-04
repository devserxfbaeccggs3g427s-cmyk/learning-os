/**
 * A single AI chat frame — read, update scope, delete.
 *
 * Ownership is enforced on every access: the row is matched by BOTH id
 * and `userId`, so a frame id belonging to another user produces the
 * same 404 as an id that does not exist. That uniformity matters — a
 * distinguishable "403" would let the endpoint be used to enumerate
 * which frame ids are real.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiChatFrames, aiChatMessages, aiChatFrameSnippets } from "@/lib/db/schema";
import { getDefaultUser } from "@/lib/ai/service";
import { parseKnowledgeMode } from "@/lib/ai/frame/scope";
import { MAX_TITLE_CHARS } from "@/lib/ai/frame/title";

const PatchBody = z
  .object({
    // Renaming a frame by hand. The bound task is deliberately NOT
    // patchable: it is set once at creation, validated against
    // ownership, and is what makes the frame's context its own.
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS).optional(),
    knowledgeMode: z.string().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

/**
 * Resolve a frame for the current user, or null. Single place where
 * ownership is checked — every handler below goes through it.
 */
async function loadFrame(frameId: string, userId: string) {
  return (
    await db
      .select()
      .from(aiChatFrames)
      .where(and(eq(aiChatFrames.id, frameId), eq(aiChatFrames.userId, userId)))
      .limit(1)
  )[0];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getDefaultUser();

  const frame = await loadFrame(id, user.id);
  if (!frame) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // History is scoped by frameId — this is the whole isolation story.
  // A frame's context is exactly its own rows.
  const messages = await db
    .select({
      id: aiChatMessages.id,
      role: aiChatMessages.role,
      content: aiChatMessages.content,
      metadata: aiChatMessages.metadata,
      createdAt: aiChatMessages.createdAt,
    })
    .from(aiChatMessages)
    .where(eq(aiChatMessages.frameId, id))
    .orderBy(asc(aiChatMessages.createdAt));

  const snippets = await db
    .select({
      id: aiChatFrameSnippets.id,
      title: aiChatFrameSnippets.title,
      body: aiChatFrameSnippets.body,
      source: aiChatFrameSnippets.source,
      createdAt: aiChatFrameSnippets.createdAt,
    })
    .from(aiChatFrameSnippets)
    .where(
      and(
        eq(aiChatFrameSnippets.frameId, id),
        eq(aiChatFrameSnippets.userId, user.id),
      ),
    )
    .orderBy(asc(aiChatFrameSnippets.createdAt));

  return NextResponse.json({
    frame: {
      id: frame.id,
      title: frame.title,
      entryPoint: frame.entryPoint,
      knowledgeMode: frame.knowledgeMode,
      // The frame's own bound task. Returned so the dialog can label
      // the frame; the chat route reads the same column off the row.
      taskId: frame.taskId,
      archived: frame.archived,
      createdAt: frame.createdAt,
      updatedAt: frame.updatedAt,
    },
    messages,
    snippets,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getDefaultUser();

  const frame = await loadFrame(id, user.id);
  if (!frame) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Partial<typeof aiChatFrames.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.knowledgeMode !== undefined) {
    updates.knowledgeMode = parseKnowledgeMode(parsed.data.knowledgeMode);
  }
  if (parsed.data.archived !== undefined) updates.archived = parsed.data.archived;

  await db.update(aiChatFrames).set(updates).where(eq(aiChatFrames.id, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getDefaultUser();

  const frame = await loadFrame(id, user.id);
  if (!frame) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Messages and snippets cascade via FK.
  await db.delete(aiChatFrames).where(eq(aiChatFrames.id, id));

  return NextResponse.json({ ok: true });
}