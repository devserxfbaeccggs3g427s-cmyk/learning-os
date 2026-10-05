import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { blockNotes, blockNoteRevisions, studyBlocks, schedules } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { nowIso } from "@/lib/utils/time";

const Body = z.object({
  blockId: z.string(),
  userId: z.string(),
  content: z.string().max(500_000),
  message: z.string().max(500).optional(),
});

/**
 * Save notes for a study BLOCK — the mirror of `/api/notes/save`, keyed by
 * block instead of task.
 *
 * Same one-current-note + revision-snapshot contract as the task-level
 * route. The reason this exists is the one-note-per-task model losing data:
 * a task with six blocks on one day meant the sixth Finish overwrote the
 * first five.
 *
 * The block is looked up through `schedules.user_id` rather than trusting
 * the body's `userId` alone, so one user can't write into another user's
 * block note by guessing an id. The body `userId` still decides WHICH note
 * row is written (the (block, user) key), matching the task route.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { blockId, userId, content, message } = parsed.data;

  // Ownership check: the block must belong to a schedule owned by this user.
  const owned = await db
    .select({ id: studyBlocks.id })
    .from(studyBlocks)
    .innerJoin(schedules, eq(schedules.id, studyBlocks.scheduleId))
    .where(and(eq(studyBlocks.id, blockId), eq(schedules.userId, userId)))
    .limit(1);
  if (!owned[0]) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const existing = await db
    .select()
    .from(blockNotes)
    .where(and(eq(blockNotes.blockId, blockId), eq(blockNotes.userId, userId)))
    .limit(1);

  if (existing[0]) {
    const cur = existing[0];
    if (cur.content === content) {
      return NextResponse.json({ ok: true, unchanged: true, revision: cur.revision });
    }
    // Snapshot the outgoing content before overwriting, so the history is
    // recoverable even though nothing surfaces it in the UI yet.
    await db.insert(blockNoteRevisions).values({
      id: ids.blockNoteRev(),
      noteId: cur.id,
      blockId,
      revision: cur.revision,
      content: cur.content,
      message: message ?? null,
    });
    await db
      .update(blockNotes)
      .set({ content, revision: cur.revision + 1, lastSavedAt: nowIso() })
      .where(eq(blockNotes.id, cur.id));
    // The calendar renders a "has note" dot per block from a cached range
    // query. Without this the dot can lag the save by up to 60s.
    revalidateTag(`schedule:${userId}`);
    return NextResponse.json({ ok: true, revision: cur.revision + 1 });
  }

  const id = ids.blockNote();
  await db.insert(blockNotes).values({
    id,
    blockId,
    userId,
    content,
    revision: 1,
    lastSavedAt: nowIso(),
  });
  revalidateTag(`schedule:${userId}`);
  return NextResponse.json({ ok: true, revision: 1, id });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const blockId = url.searchParams.get("blockId");
  const userId = url.searchParams.get("userId");
  if (!blockId || !userId) {
    return NextResponse.json({ error: "blockId and userId required" }, { status: 400 });
  }
  const row = await db
    .select()
    .from(blockNotes)
    .where(and(eq(blockNotes.blockId, blockId), eq(blockNotes.userId, userId)))
    .limit(1);
  return NextResponse.json({ note: row[0] ?? null });
}