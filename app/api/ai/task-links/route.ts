/**
 * GET /api/ai/task-links
 *
 * Returns a compact map of the current user's task codes → {id, title}.
 * Used by the AI chat client to resolve `task://CODE` placeholders the AI
 * emits (e.g. `[c8](task://c8)`) into real `/tasks/{id}` links.
 *
 * Intentionally not cached aggressively — codes & ids rarely change but
 * we keep this fresh so freshly-created tasks resolve immediately.
 */
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks, modules, tracks, roadmaps } from "@/lib/db/schema";
import { getDefaultUser } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getDefaultUser();
  const rm = await db
    .select({ id: roadmaps.id })
    .from(roadmaps)
    .where(eq(roadmaps.userId, user.id));
  if (rm.length === 0) return NextResponse.json({});
  const roadmapIds = rm.map((r) => r.id);

  const rows = await db
    .select({ id: tasks.id, code: tasks.code, title: tasks.title })
    .from(tasks)
    .innerJoin(modules, eq(modules.id, tasks.moduleId))
    .innerJoin(tracks, eq(tracks.id, modules.trackId))
    .where(inArray(tracks.roadmapId, roadmapIds));

  const map: Record<string, { id: string; title: string }> = {};
  for (const r of rows) if (r.code) map[r.code] = { id: r.id, title: r.title };
  return NextResponse.json(map);
}