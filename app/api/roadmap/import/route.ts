/**
 * Roadmap importer.
 *
 * Validates payload against RoadmapImportSchema and writes roadmap, tracks,
 * modules, tasks (preserving dependencies by code), and tags.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { roadmaps, tracks, modules, tasks, taskDependencies, tags, taskTags } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { RoadmapImportSchema } from "@/lib/ai/schemas";
import { getDefaultUser } from "@/lib/ai/service";

const Body = z.object({
  data: RoadmapImportSchema,
  dryRun: z.boolean().default(false),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid roadmap JSON", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const user = await getDefaultUser();
  const rm = parsed.data.data;

  const stats = {
    tracks: rm.tracks.length,
    modules: rm.tracks.reduce((a, t) => a + t.modules.length, 0),
    tasks: rm.tracks.reduce(
      (a, t) => a + t.modules.reduce((aa, m) => aa + m.tasks.length, 0),
      0,
    ),
    dependencies: rm.tracks
      .flatMap((t) => t.modules)
      .flatMap((m) => m.tasks)
      .reduce((a, task) => a + (task.dependencies?.length ?? 0), 0),
    estimatedHours: 0,
  };
  stats.estimatedHours = Math.round(
    rm.tracks
      .flatMap((t) => t.modules)
      .flatMap((m) => m.tasks)
      .reduce((a, task) => a + (task.estimatedMinutes ?? 0), 0) / 60,
  );

  if (parsed.data.dryRun) {
    return NextResponse.json({ ok: true, preview: stats });
  }

  const roadmapId = ids.roadmap();
  const codeToId = new Map<string, string>();

  await db.transaction(async (tx) => {
    await tx.insert(roadmaps).values({
      id: roadmapId,
      userId: user.id,
      title: rm.title,
      description: rm.description ?? null,
      source: "imported",
      startDate: rm.startDate ?? null,
      targetEndDate: rm.targetEndDate ?? null,
    });

    let trackOrder = 0;
    for (const tr of rm.tracks) {
      const trackId = ids.track();
      await tx.insert(tracks).values({
        id: trackId,
        roadmapId,
        title: tr.title,
        summary: tr.summary ?? null,
        color: tr.color ?? null,
        orderIndex: trackOrder++,
      });
      let moduleOrder = 0;
      for (const mo of tr.modules) {
        const moduleId = ids.module();
        await tx.insert(modules).values({
          id: moduleId,
          trackId,
          title: mo.title,
          summary: mo.summary ?? null,
          orderIndex: moduleOrder++,
        });
        let taskOrder = 0;
        for (const t of mo.tasks) {
          const taskId = ids.task();
          if (t.code) codeToId.set(t.code, taskId);
          await tx.insert(tasks).values({
            id: taskId,
            code: t.code ?? null,
            moduleId,
            title: t.title,
            description: t.description ?? null,
            relatedProject: t.relatedProject ?? null,
            relatedCvClaim: t.relatedCvClaim ?? null,
            whyThisMatters: t.whyThisMatters ?? null,
            prerequisites: t.prerequisites ?? [],
            concepts: t.concepts ?? [],
            deepDiveSubtopics: t.deepDiveSubtopics ?? [],
            internalsToUnderstand: t.internalsToUnderstand ?? [],
            failureScenarios: t.failureScenarios ?? [],
            productionQuestions: t.productionQuestions ?? [],
            interviewQuestions: t.interviewQuestions ?? [],
            handsOnLab: t.handsOnLab ?? null,
            expectedOutput: t.expectedOutput ?? null,
            definitionOfDone: t.definitionOfDone ?? null,
            status: t.status ?? "BACKLOG",
            priority: t.priority ?? "P2",
            difficulty: t.difficulty ?? "INTERMEDIATE",
            estimatedMinutes: t.estimatedMinutes ?? 45,
            orderIndex: taskOrder++,
          });
          for (const tagName of t.tags ?? []) {
            if (!tagName) continue;
            const existingTag = await tx
              .select()
              .from(tags)
              .where(eq(tags.name, tagName))
              .limit(1);
            let tagId: string;
            if (existingTag[0]) {
              tagId = existingTag[0].id;
            } else {
              tagId = ids.tag();
              await tx.insert(tags).values({ id: tagId, name: tagName });
            }
            await tx
              .insert(taskTags)
              .values({ taskId, tagId })
              .onConflictDoNothing();
          }
        }
      }
    }

    // dependencies (2nd pass so all task codes exist)
    for (const tr of rm.tracks) {
      for (const mo of tr.modules) {
        for (const t of mo.tasks) {
          const taskId = t.code ? codeToId.get(t.code) : null;
          if (!taskId) continue;
          for (const dep of t.dependencies ?? []) {
            const depId = codeToId.get(dep);
            if (!depId || depId === taskId) continue;
            await tx
              .insert(taskDependencies)
              .values({ id: ids.taskDep(), taskId, dependsOnTaskId: depId, kind: "HARD" })
              .onConflictDoNothing();
          }
        }
      }
    }
  });

  // Count deps for response (computed client-side from the source payload,
  // since tx callbacks don't trivially expose rowCount for onConflictDoNothing).
  let depsCreated = 0;
  for (const tr of rm.tracks) {
    for (const mo of tr.modules) {
      for (const t of mo.tasks) {
        const taskId = t.code ? codeToId.get(t.code) : null;
        if (!taskId) continue;
        for (const dep of t.dependencies ?? []) {
          const depId = codeToId.get(dep);
          if (depId && depId !== taskId) depsCreated++;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    roadmapId,
    stats: { ...stats, dependencies: depsCreated },
  });
}