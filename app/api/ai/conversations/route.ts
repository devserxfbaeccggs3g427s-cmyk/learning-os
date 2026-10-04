import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiConversations } from "@/lib/db/schema";
import { getDefaultUser } from "@/lib/ai/service";

const Query = z.object({
  userId: z.string().optional(),
  mode: z.enum(["TUTOR", "INTERVIEW", "FAILURE_DRILL", "DEBUG_DRILL", "KNOWLEDGE_GAP", "GLOBAL"]).optional(),
  taskId: z.string().optional(),
  /** "global" → taskId IS NULL; "task" → taskId = X; omit → no filter. */
  scope: z.enum(["global", "task"]).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const user = parsed.data.userId ? { id: parsed.data.userId } : await getDefaultUser();

  const filters = [eq(aiConversations.userId, user.id), eq(aiConversations.archived, false)];
  if (parsed.data.mode) filters.push(eq(aiConversations.mode, parsed.data.mode));
  if (parsed.data.taskId) filters.push(eq(aiConversations.taskId, parsed.data.taskId));
  if (parsed.data.scope === "global") filters.push(isNull(aiConversations.taskId));
  if (parsed.data.scope === "task" && !parsed.data.taskId) {
    filters.push(sql`${aiConversations.taskId} IS NOT NULL`);
  }

  const list = await db
    .select({
      id: aiConversations.id,
      title: aiConversations.title,
      mode: aiConversations.mode,
      taskId: aiConversations.taskId,
      createdAt: aiConversations.createdAt,
      updatedAt: aiConversations.updatedAt,
      // Same fix as the frame list route: an interpolated column
      // renders inside the subquery as the bare, unqualified `"id"`,
      // which Postgres resolves against the INNER scope —
      // ai_messages.id. The predicate compared a message id to itself
      // and was never true, so every conversation read "0 messages".
      // `sql.raw` keeps the reference qualified to the outer table.
      // Cast to int as well: COUNT(*) is bigint, which postgres-js
      // hands back as a JSON *string*.
      messageCount: sql<number>`(
        SELECT CAST(COUNT(*) AS int) FROM ai_messages m WHERE m.conversation_id = ${sql.raw("ai_conversations.id")}
      )`,
    })
    .from(aiConversations)
    .where(and(...filters))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(200);

  return NextResponse.json({ conversations: list });
}