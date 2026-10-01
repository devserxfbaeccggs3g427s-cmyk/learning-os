import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskNotes, noteRevisions } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { nowIso } from "@/lib/utils/time";

const Body = z.object({
  taskId: z.string(),
  userId: z.string(),
  content: z.string().max(500_000),
  message: z.string().max(500).optional(),
});

/**
 * Save notes for a task.
 *
 * We always keep one current `TaskNote` row per task. Saving bumps the
 * `revision` counter, snapshots the previous content into `note_revisions`.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { taskId, userId, content, message } = parsed.data;
  const existing = await db
    .select()
    .from(taskNotes)
    .where(and(eq(taskNotes.taskId, taskId), eq(taskNotes.userId, userId)))
    .limit(1);
  if (existing[0]) {
    const cur = existing[0];
    if (cur.content === content) {
      return NextResponse.json({ ok: true, unchanged: true, revision: cur.revision });
    }
    // snapshot previous
    await db.insert(noteRevisions).values({
      id: ids.noteRev(),
      noteId: cur.id,
      taskId,
      revision: cur.revision,
      content: cur.content,
      message: message ?? null,
    });
    await db
      .update(taskNotes)
      .set({
        content,
        revision: cur.revision + 1,
        lastSavedAt: nowIso(),
      })
      .where(eq(taskNotes.id, cur.id));
    return NextResponse.json({ ok: true, revision: cur.revision + 1 });
  }
  const id = ids.note();
  await db.insert(taskNotes).values({
    id,
    taskId,
    userId,
    content,
    revision: 1,
    lastSavedAt: nowIso(),
  });
  return NextResponse.json({ ok: true, revision: 1, id });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");
  const userId = url.searchParams.get("userId");
  if (!taskId || !userId) return NextResponse.json({ error: "taskId and userId required" }, { status: 400 });
  const row = await db
    .select()
    .from(taskNotes)
    .where(and(eq(taskNotes.taskId, taskId), eq(taskNotes.userId, userId)))
    .limit(1);
  return NextResponse.json({ note: row[0] ?? null });
}