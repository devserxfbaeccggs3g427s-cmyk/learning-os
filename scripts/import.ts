/**
 * Bulk import roadmap + schedule JSON files into Supabase Postgres.
 *
 * Reads:
 *   data/roadmap-import.json  → roadmaps → tracks → modules → tasks (+ deps + tags)
 *   data/schedule-bulk.json   → schedules → studyBlocks (looked up by task code)
 *
 * Idempotent by default:
 *   - Roadmap: skip if a roadmap with the same `title` already exists for the user.
 *   - Schedule: skip each day that already has a schedule (userId+date).
 *
 * Override flags:
 *   --force             delete existing roadmap (by title) + every dependent row,
 *                       then reimport. Use this when the source JSON changed.
 *   --replace-schedule  for each day in schedule-bulk.json, delete existing
 *                       schedule (cascades to study_blocks) and reimport.
 *   --roadmap <path>    override roadmap JSON path (default: data/roadmap-import.json)
 *   --schedule <path>   override schedule JSON path (default: data/schedule-bulk.json)
 *
 * Run:
 *   npm run db:import
 *   npm run db:import -- --force
 *   npm run db:import -- --replace-schedule
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { eq, and, inArray } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnv({ path: ".env.local", override: false });

// Lazy-import after env load so lib/db/client.ts finds LEARNING_OS_POSTGRES_URL.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = await import("../lib/db/client");
const { users, roadmaps, tracks, modules, tasks, taskDependencies, tags, taskTags, schedules, studyBlocks } =
  await import("../lib/db/schema");
const { ids } = await import("../lib/utils/ids");
const { RoadmapImportSchema, ScheduleImportSchema } = await import("../lib/ai/schemas");

// ----------------------------------------------------------------------------
// CLI args
// ----------------------------------------------------------------------------
type Args = {
  force: boolean;
  replaceSchedule: boolean;
  roadmapPath: string;
  schedulePath: string;
};
function parseArgs(argv: string[]): Args {
  const args: Args = {
    force: false,
    replaceSchedule: false,
    roadmapPath: "data/roadmap-import.json",
    schedulePath: "data/schedule-bulk.json",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--replace-schedule") args.replaceSchedule = true;
    else if (a === "--roadmap") args.roadmapPath = argv[++i] ?? args.roadmapPath;
    else if (a === "--schedule") args.schedulePath = argv[++i] ?? args.schedulePath;
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: tsx scripts/import.ts [--force] [--replace-schedule] [--roadmap <path>] [--schedule <path>]",
      );
      process.exit(0);
    } else {
      console.warn(`[import] unknown arg: ${a}`);
    }
  }
  return args;
}

// ----------------------------------------------------------------------------
// User resolution
// ----------------------------------------------------------------------------
async function ensureUser() {
  const existing = await db.select().from(users).limit(1);
  if (existing[0]) return existing[0];
  const id = ids.user();
  await db.insert(users).values({ id });
  const created = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return created[0]!;
}

// ----------------------------------------------------------------------------
// Roadmap import
// ----------------------------------------------------------------------------
type RoadmapStats = {
  skipped: boolean;
  roadmapId?: string;
  tracks: number;
  modules: number;
  tasks: number;
  dependencies: number;
  tags: number;
  estimatedHours: number;
};

async function importRoadmap(
  userId: string,
  payload: unknown,
  force: boolean,
): Promise<RoadmapStats> {
  const rm = RoadmapImportSchema.parse(payload);

  const counts = {
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
    estimatedHours: Math.round(
      rm.tracks
        .flatMap((t) => t.modules)
        .flatMap((m) => m.tasks)
        .reduce((a, task) => a + (task.estimatedMinutes ?? 0), 0) / 60,
    ),
  };

  // Idempotency check: skip if a roadmap with same title already exists.
  const existing = await db
    .select()
    .from(roadmaps)
    .where(and(eq(roadmaps.userId, userId), eq(roadmaps.title, rm.title)))
    .limit(1);

  if (existing[0] && !force) {
    console.log(
      `[import] roadmap "${rm.title}" already exists (id=${existing[0].id}); skipping (use --force to reimport)`,
    );
    return { skipped: true, tags: 0, ...counts };
  }

  if (existing[0] && force) {
    console.log(`[import] --force: deleting existing roadmap "${rm.title}" (id=${existing[0].id})…`);
    // FK ON DELETE CASCADE: roadmaps → tracks → modules → tasks → taskDependencies/taskTags.
    // study_blocks.schedule_id cascades from schedules, not roadmaps, so they're untouched.
    await db.delete(roadmaps).where(eq(roadmaps.id, existing[0].id));
  }

  const roadmapId = ids.roadmap();
  const codeToId = new Map<string, string>();
  let tagsCreated = 0;

  await db.transaction(async (tx) => {
    await tx.insert(roadmaps).values({
      id: roadmapId,
      userId,
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
            const found = (
              await tx.select().from(tags).where(eq(tags.name, tagName)).limit(1)
            )[0];
            let tagId: string;
            if (found) {
              tagId = found.id;
            } else {
              tagId = ids.tag();
              try {
                await tx.insert(tags).values({ id: tagId, name: tagName });
                tagsCreated++;
              } catch {
                // Race-safe fallback: re-read by name.
                const reread = (
                  await tx.select().from(tags).where(eq(tags.name, tagName)).limit(1)
                )[0];
                if (!reread) throw new Error(`failed to upsert tag "${tagName}"`);
                tagId = reread.id;
              }
            }
            await tx.insert(taskTags).values({ taskId, tagId }).onConflictDoNothing();
          }
        }
      }
    }

    // 2nd pass: dependencies — by then all task codes exist in codeToId.
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

  return { skipped: false, roadmapId, tags: tagsCreated, ...counts };
}

// ----------------------------------------------------------------------------
// Schedule import
// ----------------------------------------------------------------------------
type ScheduleStats = {
  daysSeen: number;
  daysInserted: number;
  daysSkipped: number;
  blocksInserted: number;
  blocksSkipped: number; // no matching task by code
};

async function importSchedule(
  userId: string,
  payload: unknown,
  replace: boolean,
): Promise<ScheduleStats> {
  // schedule-bulk.json shape: { days: ScheduleImport[] }
  const body = payload as { days: unknown[] };
  if (!body || !Array.isArray(body.days)) {
    throw new Error('schedule JSON must be { days: [...] } (got schedule-bulk.json?)');
  }
  const days = body.days.map((d) => ScheduleImportSchema.parse(d));

  // Pre-resolve every task code in one query to avoid N+1 lookups per block.
  const allCodes = Array.from(new Set(days.flatMap((d) => d.blocks.map((b) => b.taskCode).filter(Boolean) as string[])));
  const codeToTaskId = new Map<string, string>();
  if (allCodes.length > 0) {
    const found = await db.select({ id: tasks.id, code: tasks.code }).from(tasks).where(inArray(tasks.code, allCodes));
    for (const row of found) if (row.code) codeToTaskId.set(row.code, row.id);
    console.log(
      `[import] resolved ${codeToTaskId.size}/${allCodes.length} task codes (unresolved: ${
        allCodes.length - codeToTaskId.size
      })`,
    );
  }

  const stats: ScheduleStats = {
    daysSeen: days.length,
    daysInserted: 0,
    daysSkipped: 0,
    blocksInserted: 0,
    blocksSkipped: 0,
  };

  for (const sch of days) {
    const existing = (
      await db
        .select()
        .from(schedules)
        .where(and(eq(schedules.userId, userId), eq(schedules.date, sch.date)))
        .limit(1)
    )[0];

    if (existing && !replace) {
      stats.daysSkipped++;
      continue;
    }

    if (existing && replace) {
      // study_blocks have ON DELETE CASCADE on schedule_id, so a single delete
      // removes the schedule row + all its blocks.
      await db.delete(schedules).where(eq(schedules.id, existing.id));
    }

    await db.transaction(async (tx) => {
      const scheduleId = ids.schedule();
      await tx.insert(schedules).values({
        id: scheduleId,
        userId,
        date: sch.date,
        objective: sch.objective ?? null,
      });

      let order = 0;
      for (const b of sch.blocks) {
        const taskId = b.taskCode ? codeToTaskId.get(b.taskCode) ?? null : b.taskId ?? null;
        if (!taskId) {
          stats.blocksSkipped++;
          continue;
        }
        await tx.insert(studyBlocks).values({
          id: ids.block(),
          scheduleId,
          taskId,
          type: b.type,
          title: b.title,
          objective: b.objective ?? null,
          startMinute: b.startMinute,
          durationMinutes: b.durationMinutes,
          deliverable: b.deliverable ?? null,
          status: "PLANNED",
          orderIndex: order++,
        });
        stats.blocksInserted++;
      }
    });
    stats.daysInserted++;
  }

  return stats;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);

  const roadmapAbs = resolve(args.roadmapPath);
  const scheduleAbs = resolve(args.schedulePath);
  console.log(`[import] roadmap  ← ${roadmapAbs}`);
  console.log(`[import] schedule ← ${scheduleAbs}`);
  console.log(
    `[import] flags: ${args.force ? "--force " : ""}${args.replaceSchedule ? "--replace-schedule " : ""}`.trim(),
  );

  const roadmapJson = JSON.parse(readFileSync(roadmapAbs, "utf8"));
  const scheduleJson = JSON.parse(readFileSync(scheduleAbs, "utf8"));

  const user = await ensureUser();
  console.log(`[import] user: ${user.id}`);

  console.log("[import] → importing roadmap…");
  const rmStats = await importRoadmap(user.id, roadmapJson, args.force);
  console.log("[import] roadmap stats:", rmStats);

  console.log("[import] → importing schedule…");
  const schStats = await importSchedule(user.id, scheduleJson, args.replaceSchedule);
  console.log("[import] schedule stats:", schStats);

  console.log("[import] done ✓");
  process.exit(0);
}

main().catch((e) => {
  console.error("[import] failed:", e);
  process.exit(1);
});
