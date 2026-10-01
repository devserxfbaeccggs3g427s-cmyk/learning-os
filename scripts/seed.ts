/**
 * Seed script.
 *
 * Inserts a sample Backend Engineering roadmap with two tracks so the UI is
 * populated out-of-the-box. Idempotent: re-running won't duplicate.
 *
 * Run: `npm run db:seed`
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { users, roadmaps, tracks, modules, tasks, taskDependencies, schedules, studyBlocks } from "../lib/db/schema";
import { ids } from "../lib/utils/ids";
import { RoadmapImportSchema } from "../lib/ai/schemas";
import { isoDay } from "../lib/utils/time";

const SEED_ROADMAP = {
  schemaVersion: 1,
  title: "Backend Engineering — Foundations",
  description: "Sample roadmap to verify the application runs end-to-end.",
  tracks: [
    {
      title: "Core Java & Concurrency",
      summary: "Memory model, threading, common pitfalls.",
      color: "#6366f1",
      modules: [
        {
          title: "JVM Memory & Concurrency",
          summary: "Stack, heap, JMM, happens-before.",
          tasks: [
            {
              code: "JAVA-CONC-01",
              title: "Thread lifecycle & JVM memory",
              description: "From `new` to `TERMINATED`. Where does the stack live? Why does a thread hold its own program counter?",
              whyThisMatters: "Concurrency bugs are #1 source of backend incidents. JVM memory mistakes leak into latency and throughput.",
              concepts: ["JMM", "happens-before", "volatile", "thread state machine"],
              internalsToUnderstand: ["Object header", "monitor word", "biased locking"],
              failureScenarios: [
                { id: "FS-JC01-01", title: "Lost update", body: "Two threads update shared counter without sync." },
                { id: "FS-JC01-02", title: "Stale visibility", body: "Worker A writes, worker B keeps reading cached value." },
              ],
              productionQuestions: ["How would you diagnose a deadlock in production?"],
              interviewQuestions: ["Explain the Java memory model in 60 seconds.", "What does `volatile` actually guarantee?"],
              handsOnLab: "Build a thread-safe counter using only primitives, then re-check with `jcstress`.",
              expectedOutput: "100/100 across threads, no lost updates.",
              definitionOfDone: "Tests pass; code reviewed; bench recorded.",
              priority: "P1",
              difficulty: "INTERMEDIATE",
              estimatedMinutes: 60,
              tags: ["java", "concurrency", "jvm"],
            },
            {
              code: "JAVA-CONC-02",
              title: "Locks, Reentrancy, Condition",
              whyThisMatters: "Most production codebases still use `synchronized` blocks.",
              concepts: ["monitor", "reentrancy", "Condition variables"],
              failureScenarios: [
                { id: "FS-JC02-01", title: "Lock ordering deadlock", body: "A→B in caller, B→A in callee." },
              ],
              interviewQuestions: ["When does `synchronized` fail to provide mutual exclusion?"],
              priority: "P2",
              difficulty: "INTERMEDIATE",
              estimatedMinutes: 45,
              tags: ["java", "concurrency"],
            },
          ],
        },
      ],
    },
    {
      title: "Database Engineering",
      summary: "Transactions, isolation, locking, idempotency.",
      color: "#10b981",
      modules: [
        {
          title: "Transactions",
          tasks: [
            {
              code: "DB-TX-01",
              title: "ACID & isolation levels",
              description: "Read phenomena, isolation levels, MVCC basics.",
              whyThisMatters: "Correct money flows require explicit isolation reasoning.",
              concepts: ["dirty read", "non-repeatable read", "phantom", "MVCC"],
              failureScenarios: [
                { id: "FS-DB01-01", title: "Phantom read", body: "Aggregate changes mid-transaction." },
              ],
              interviewQuestions: ["Repeatable read vs Serializable — what does PostgreSQL actually do?"],
              priority: "P0",
              difficulty: "ADVANCED",
              estimatedMinutes: 75,
              tags: ["db", "transactions"],
              dependencies: [],
            },
            {
              code: "DB-TX-02",
              title: "Locking patterns",
              whyThisMatters: "Most performance issues under high concurrency are about lock waits.",
              concepts: ["row lock", "gap lock", "next-key lock"],
              interviewQuestions: ["What's a gap lock?"],
              priority: "P1",
              difficulty: "ADVANCED",
              estimatedMinutes: 60,
              tags: ["db", "locking"],
              dependencies: ["DB-TX-01"],
            },
          ],
        },
      ],
    },
  ],
};

async function ensureUser() {
  const existing = await db.select().from(users).limit(1);
  if (existing[0]) return existing[0];
  const id = ids.user();
  await db.insert(users).values({ id });
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
}

async function seedRoadmap(userId: string) {
  const rm = RoadmapImportSchema.parse(SEED_ROADMAP);

  // Skip if already imported by title
  const existing = await db.select().from(roadmaps).where(eq(roadmaps.userId, userId)).limit(1);
  if (existing.length > 0) {
    console.log("[seed] roadmap already exists, skipping");
    return;
  }

  const roadmapId = ids.roadmap();
  const codeToId = new Map<string, string>();

  await db.transaction(async (tx) => {
    await tx.insert(roadmaps).values({
      id: roadmapId,
      userId,
      title: rm.title,
      description: rm.description ?? null,
      source: "seed",
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
        }
      }
    }

    // dependencies
    for (const tr of rm.tracks) {
      for (const mo of tr.modules) {
        for (const t of mo.tasks) {
          const taskId = t.code ? codeToId.get(t.code) : null;
          if (!taskId) continue;
          for (const dep of t.dependencies ?? []) {
            const depId = codeToId.get(dep);
            if (!depId) continue;
            await tx
              .insert(taskDependencies)
              .values({ id: ids.taskDep(), taskId, dependsOnTaskId: depId, kind: "HARD" })
              .onConflictDoNothing();
          }
        }
      }
    }
  });
  console.log("[seed] roadmap inserted");
}

async function seedTodaySchedule(userId: string) {
  const today = isoDay();
  const existing = (await db.select().from(schedules).where(eq(schedules.userId, userId)).limit(20)).filter((s) => s.date === today)[0];
  if (existing) {
    console.log("[seed] today's schedule already exists, skipping");
    return;
  }
  const scheduleId = ids.schedule();

  await db.transaction(async (tx) => {
    await tx.insert(schedules).values({
      id: scheduleId,
      userId,
      date: today,
      objective: "Foundation day — get into the JVM memory model and ACID isolation levels.",
    });
    // Find tasks
    const jc01 = (await tx.select().from(tasks).where(eq(tasks.code, "JAVA-CONC-01")).limit(1))[0];
    const db01 = (await tx.select().from(tasks).where(eq(tasks.code, "DB-TX-01")).limit(1))[0];
    let order = 0;
    if (jc01) {
      await tx.insert(studyBlocks).values({
        id: ids.block(),
        scheduleId,
        taskId: jc01.id,
        type: "LEARN",
        title: "Learn — Thread lifecycle & JVM memory",
        objective: "Understand thread states and where memory lives.",
        startMinute: 20 * 60 + 5,
        durationMinutes: 45,
        deliverable: "Diagram of stack vs heap with thread stacks.",
        status: "PLANNED",
        orderIndex: order++,
      });
      await tx.insert(studyBlocks).values({
        id: ids.block(),
        scheduleId,
        taskId: jc01.id,
        type: "INTERVIEW",
        title: "Interview drill — happens-before",
        objective: "Answer one interview question out loud.",
        startMinute: 22 * 60 + 25,
        durationMinutes: 20,
        deliverable: "Recording or written answer.",
        status: "PLANNED",
        orderIndex: order++,
      });
    }
    if (db01) {
      await tx.insert(studyBlocks).values({
        id: ids.block(),
        scheduleId,
        taskId: db01.id,
        type: "DEEP_DIVE",
        title: "Deep dive — Isolation levels & MVCC",
        objective: "Read phenomena across PG isolation levels.",
        startMinute: 21 * 60 + 15,
        durationMinutes: 45,
        deliverable: "Notes on read phenomena with examples.",
        status: "PLANNED",
        orderIndex: order++,
      });
    }
  });
  console.log("[seed] today's schedule inserted");
}

async function main() {
  const user = await ensureUser();
  await seedRoadmap(user.id);
  await seedTodaySchedule(user.id);
  console.log("[seed] done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});