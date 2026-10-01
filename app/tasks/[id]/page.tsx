import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks, taskNotes, modules, tracks, taskDependencies, flashcardDecks, quizzes } from "@/lib/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { TaskWorkspace } from "@/components/tasks/TaskWorkspace";
import { getDefaultUser } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getDefaultUser();
  const taskRow = (await db.select().from(tasks).where(eq(tasks.id, id)).limit(1))[0];
  if (!taskRow) notFound();

  // Round 1: in parallel — module lookup (used for its id) + all child
  // collections that only depend on the taskId + the user (for note scope).
  const moduleRow = (
    await db.select().from(modules).where(eq(modules.id, taskRow.moduleId)).limit(1)
  )[0];

  const [noteRow, deps, decks, taskQuizzes, trackRow] = await Promise.all([
    db
      .select()
      .from(taskNotes)
      .where(and(eq(taskNotes.taskId, id), eq(taskNotes.userId, user.id)))
      .limit(1)
      .then((r) => r[0]),
    db.select().from(taskDependencies).where(eq(taskDependencies.taskId, id)),
    db.select().from(flashcardDecks).where(eq(flashcardDecks.taskId, id)),
    db.select().from(quizzes).where(eq(quizzes.taskId, id)),
    moduleRow
      ? db.select().from(tracks).where(eq(tracks.id, moduleRow.trackId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
  ]);

  // Round 2: dep task titles — only if we have deps.
  const depTaskIds = deps.map((d) => d.dependsOnTaskId);
  const depTasks = depTaskIds.length
    ? await db.select().from(tasks).where(inArray(tasks.id, depTaskIds))
    : [];

  return (
    <AppShell>
      <TaskWorkspace
        userId={user.id}
        task={{
          id: taskRow.id,
          code: taskRow.code,
          title: taskRow.title,
          description: taskRow.description,
          relatedProject: taskRow.relatedProject,
          whyThisMatters: taskRow.whyThisMatters,
          failureScenarios: Array.isArray(taskRow.failureScenarios)
            ? (taskRow.failureScenarios as unknown[])
            : null,
          interviewQuestions: Array.isArray(taskRow.interviewQuestions)
            ? taskRow.interviewQuestions
            : null,
          handsOnLab: taskRow.handsOnLab,
          definitionOfDone: taskRow.definitionOfDone,
          status: taskRow.status,
          priority: taskRow.priority,
          difficulty: taskRow.difficulty,
          estimatedMinutes: taskRow.estimatedMinutes,
          masteryScore: taskRow.masteryScore,
        }}
        track={trackRow ? { title: trackRow.title } : null}
        module={moduleRow ? { title: moduleRow.title } : null}
        dependencies={deps.map((d) => {
          const t = depTasks.find((x) => x.id === d.dependsOnTaskId);
          return {
            id: d.id,
            dependsOnTaskId: d.dependsOnTaskId,
            title: t?.title ?? "(missing)",
            code: t?.code ?? null,
          };
        })}
        initialNote={noteRow?.content ?? ""}
        noteRevision={noteRow?.revision ?? 0}
        decks={decks.map((d) => ({
          id: d.id,
          title: d.title,
          cardCount: d.cardCount,
          difficulty: d.difficulty,
          focus: d.focus,
          generatedBy: d.generatedBy,
        }))}
        quizzes={taskQuizzes.map((q) => ({
          id: q.id,
          title: q.title,
          questionCount: q.questionCount,
          difficulty: q.difficulty,
          focus: q.focus,
          generatedBy: q.generatedBy,
        }))}
      />
    </AppShell>
  );
}