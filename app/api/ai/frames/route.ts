/**
 * AI chat frames — list and create.
 *
 * Frames are stored in their own tables (`ai_chat_frames` /
 * `ai_chat_messages`), never mixed with the task-scoped / global
 * `ai_conversations`. Every read and write is scoped to the resolved
 * user; a frame belonging to another user is simply not visible.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiChatFrames, auditLog, tasks, modules, tracks, roadmaps } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { getDefaultUser } from "@/lib/ai/service";
import { parseKnowledgeMode } from "@/lib/ai/frame/scope";
import { NEW_CHAT_TITLE, MAX_TITLE_CHARS } from "@/lib/ai/frame/title";
import type { FrameEntryPoint } from "@/lib/db/schema/aiFrames";

const CreateBody = z
  .object({
    // Optional: normally absent, because a frame is created the
    // moment the user sends their first question — and that
    // question IS the title (see the chat route). A caller may
    // pass one, but it must be non-empty and bounded.
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS).optional(),
    entryPoint: z.enum(["NOTE_SCREEN", "START_TASK", "UNKNOWN"]).default("UNKNOWN"),
    knowledgeMode: z.string().optional(),
    // The ONE task a frame is bound to. This is the only place in the
    // whole API where a task id may enter a frame — the chat and
    // retrieve routes reject a body-supplied taskId and read the bound
    // task off the stored frame row instead. Ownership is checked
    // below before anything is written, so a foreign task id is a 400
    // and no frame is created.
    taskId: z.string().trim().min(1).optional(),
  })
  // `.strict()` rejects smuggled keys (contextOverride, …) with a 400
  // instead of silently ignoring them. `taskId` above is the one
  // deliberate exception — see its comment.
  .strict();

export async function GET(req: Request) {
  const user = await getDefaultUser();

  const frames = await db
    .select({
      id: aiChatFrames.id,
      title: aiChatFrames.title,
      entryPoint: aiChatFrames.entryPoint,
      knowledgeMode: aiChatFrames.knowledgeMode,
      // The frame's own bound task. The sidebar needs it to tell
      // "the PAY-01 conversation" from "the FLOW-02 one" without
      // fetching each frame.
      taskId: aiChatFrames.taskId,
      createdAt: aiChatFrames.createdAt,
      updatedAt: aiChatFrames.updatedAt,
      // Cast to int: Postgres COUNT(*) is bigint and postgres-js hands
      // bigints back as strings, so without the cast the JSON field is
      // `"3"` and `messageCount === 1` in the dialog never matches.
      //
      // The reference is `sql.raw`, NOT `${aiChatFrames.id}`: inside
      // this subquery an interpolated column renders as the bare,
      // unqualified `"id"`, which Postgres resolves against the INNER
      // scope — ai_chat_messages.id — so the count compared a message
      // id to itself and came back 0 for every frame. Qualifying it
      // keeps the reference in the outer scope, where it means the
      // frame.
      messageCount: sql<number>`(
        SELECT CAST(COUNT(*) AS int) FROM ai_chat_messages m WHERE m.frame_id = ${sql.raw("ai_chat_frames.id")}
      )`,
    })
    .from(aiChatFrames)
    .where(and(eq(aiChatFrames.userId, user.id), eq(aiChatFrames.archived, false)))
    .orderBy(desc(aiChatFrames.updatedAt))
    .limit(200);

  return NextResponse.json({ frames });
}

export async function POST(req: Request) {
  const user = await getDefaultUser();
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // The bound task is validated before anything is written. A task has
  // no userId of its own — ownership runs task → module → track →
  // roadmap → userId, the same chain `listTaskContentIndex` uses. A
  // foreign or unknown task id is a 400 and NO frame is created, so a
  // caller cannot use this endpoint to probe which task ids exist.
  let boundTaskId: string | null = null;
  if (parsed.data.taskId) {
    const owned = await db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(modules, eq(modules.id, tasks.moduleId))
      .innerJoin(tracks, eq(tracks.id, modules.trackId))
      .innerJoin(roadmaps, eq(roadmaps.id, tracks.roadmapId))
      .where(and(eq(tasks.id, parsed.data.taskId), eq(roadmaps.userId, user.id)))
      .limit(1);
    if (owned.length === 0) {
      return NextResponse.json(
        { error: "Unknown task", taskId: parsed.data.taskId },
        { status: 400 },
      );
    }
    boundTaskId = owned[0]!.id;
  }

  const id = ids.aiFrame();
  const frame = {
    id,
    userId: user.id,
    title: parsed.data.title ?? NEW_CHAT_TITLE,
    entryPoint: parsed.data.entryPoint as FrameEntryPoint,
    knowledgeMode: parseKnowledgeMode(parsed.data.knowledgeMode),
    taskId: boundTaskId,
  };

  await db.insert(aiChatFrames).values(frame);

  // Audit: lengths/counts only — never message content (the audit log's
  // own doc says never log secrets; message bodies are the closest thing
  // to user content we have).
  await db.insert(auditLog).values({
    id: ids.audit(),
    userId: user.id,
    action: "AI_FRAME_CREATE",
    subjectType: "AI_CHAT_FRAME",
    subjectId: id,
    metadata: {
      entryPoint: frame.entryPoint,
      knowledgeMode: frame.knowledgeMode,
      taskBound: frame.taskId !== null,
    },
  });

  return NextResponse.json({ frame }, { status: 201 });
}