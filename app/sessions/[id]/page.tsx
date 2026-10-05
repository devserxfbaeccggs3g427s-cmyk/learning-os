import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { studySessions, tasks, blockNotes, taskNotes } from "@/lib/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { SessionRunner } from "@/components/sessions/SessionRunner";
import { getDefaultUser } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getDefaultUser();
  const session = (await db.select().from(studySessions).where(eq(studySessions.id, id)).limit(1))[0];
  if (!session) notFound();

  // Task, block note, and (for block-less sessions) the task note all hang
  // off the session row alone → one parallel round-trip. Block notes are
  // the primary store: the session was started from a block, so its notes
  // belong to that block, not to the task as a whole.
  const [task, blockNote, taskNote] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.id, session.taskId)).limit(1).then((r) => r[0]),
    session.blockId
      ? db
          .select()
          .from(blockNotes)
          .where(eq(blockNotes.blockId, session.blockId))
          .limit(1)
          .then((r) => r[0])
      : Promise.resolve(undefined),
    // Only loaded when there's no block to attach to; otherwise unused.
    session.blockId
      ? Promise.resolve(undefined)
      : db.select().from(taskNotes).where(eq(taskNotes.taskId, session.taskId)).limit(1).then((r) => r[0]),
  ]);
  if (!task) notFound();

  return (
    <AppShell>
      <SessionRunner
        userId={user.id}
        blockId={session.blockId}
        session={{
          id: session.id,
          taskId: session.taskId,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSeconds: session.durationSeconds,
          status: session.status,
          objective: session.objective,
        }}
        task={{
          id: task.id,
          code: task.code,
          title: task.title,
          description: task.description,
        }}
        initialNote={blockNote?.content ?? taskNote?.content ?? ""}
      />
    </AppShell>
  );
}