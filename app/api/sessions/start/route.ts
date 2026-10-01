import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { studySessions } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { nowIso } from "@/lib/utils/time";

const Body = z.object({
  userId: z.string(),
  taskId: z.string(),
  blockId: z.string().optional(),
  objective: z.string().optional(),
});

export async function POST(req: Request) {
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const id = ids.session();
  await db.insert(studySessions).values({
    id,
    userId: parsed.data.userId,
    taskId: parsed.data.taskId,
    blockId: parsed.data.blockId ?? null,
    status: "ACTIVE",
    startedAt: nowIso(),
    objective: parsed.data.objective ?? null,
  });
  if (parsed.data.blockId) {
    // mark block as in_progress
    await db
      .update((await import("@/lib/db/schema")).studyBlocks)
      .set({ status: "IN_PROGRESS", updatedAt: nowIso() })
      .where(eq((await import("@/lib/db/schema")).studyBlocks.id, parsed.data.blockId));
  }
  return NextResponse.json({ sessionId: id });
}