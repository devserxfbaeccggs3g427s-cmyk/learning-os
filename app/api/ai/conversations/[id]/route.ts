import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiConversations, aiMessages } from "@/lib/db/schema";
import { getDefaultUser } from "@/lib/ai/service";

const Query = z.object({
  userId: z.string().optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const user = parsed.data.userId ? { id: parsed.data.userId } : await getDefaultUser();

  // Ownership check — never leak another user's conversation.
  const conv = (
    await db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id)))
      .limit(1)
  )[0];
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await db
    .select({
      id: aiMessages.id,
      role: aiMessages.role,
      content: aiMessages.content,
      createdAt: aiMessages.createdAt,
      metadata: aiMessages.metadata,
    })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, id))
    .orderBy(asc(aiMessages.createdAt));

  return NextResponse.json({
    conversation: {
      id: conv.id,
      title: conv.title,
      mode: conv.mode,
      taskId: conv.taskId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    },
    messages,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getDefaultUser();
  const deleted = await db
    .delete(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id)))
    .returning({ id: aiConversations.id });

  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}