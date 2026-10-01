import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { studyBlocks } from "@/lib/db/schema";
import { nowIso } from "@/lib/utils/time";

const Body = z.object({
  status: z.enum(["PLANNED", "IN_PROGRESS", "DONE", "SKIPPED"]).optional(),
  startMinute: z.number().int().min(0).max(24 * 60).optional(),
  durationMinutes: z.number().int().min(5).max(240).optional(),
  title: z.string().optional(),
  objective: z.string().optional(),
  deliverable: z.string().optional(),
  type: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  await db
    .update(studyBlocks)
    .set({ ...parsed.data, updatedAt: nowIso() })
    .where(eq(studyBlocks.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(studyBlocks).where(eq(studyBlocks.id, id));
  return NextResponse.json({ ok: true });
}