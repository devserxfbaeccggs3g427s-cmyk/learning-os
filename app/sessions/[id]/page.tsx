import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { studySessions, tasks, taskNotes } from "@/lib/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { SessionRunner } from "@/components/sessions/SessionRunner";
import { getDefaultUser } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getDefaultUser();
  const session = (await db.select().from(studySessions).where(eq(studySessions.id, id)).limit(1))[0];
  if (!session) notFound();
  const task = (await db.select().from(tasks).where(eq(tasks.id, session.taskId)).limit(1))[0];
  if (!task) notFound();
  const note = (await db.select().from(taskNotes).where(eq(taskNotes.taskId, session.taskId)).limit(1))[0];

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
        initialNote={note?.content ?? ""}
      />
    </AppShell>
  );
}