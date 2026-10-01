import Link from "next/link";
import { eq, asc, sql as drizzleSql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { roadmaps, tracks, modules, tasks, taskDependencies } from "@/lib/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { getDefaultUser } from "@/lib/ai/service";
import { TASK_STATUSES } from "@/config/domain";

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const user = await getDefaultUser();
  const rms = await db
    .select()
    .from(roadmaps)
    .where(eq(roadmaps.userId, user.id))
    .limit(10);

  if (rms.length === 0) {
    return (
      <AppShell>
        <EmptyState />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
        {rms.map((rm) => (
          <RoadmapCard key={rm.id} roadmapId={rm.id} title={rm.title} description={rm.description ?? null} />
        ))}
      </div>
    </AppShell>
  );
}

async function RoadmapCard({ roadmapId, title, description }: { roadmapId: string; title: string; description: string | null }) {
  const trs = await db.select().from(tracks).where(eq(tracks.roadmapId, roadmapId)).orderBy(asc(tracks.orderIndex));
  // Fetch all modules under those tracks
  const ms = trs.length
    ? await db
        .select()
        .from(modules)
        .where(drizzleSql`${modules.trackId} IN (${drizzleSql.join(trs.map((t) => drizzleSql`${t.id}`), drizzleSql`, `)})`)
        .orderBy(asc(modules.orderIndex))
    : [];
  const ts = ms.length
    ? await db
        .select()
        .from(tasks)
        .where(drizzleSql`${tasks.moduleId} IN (${drizzleSql.join(ms.map((m) => drizzleSql`${m.id}`), drizzleSql`, `)})`)
        .orderBy(asc(tasks.orderIndex))
    : [];
  const tasksByModule = new Map<string, typeof ts>();
  for (const t of ts) {
    const arr = tasksByModule.get(t.moduleId) ?? [];
    arr.push(t);
    tasksByModule.set(t.moduleId, arr);
  }
  const modulesByTrack = new Map<string, typeof ms>();
  for (const m of ms) {
    const arr = modulesByTrack.get(m.trackId) ?? [];
    arr.push(m);
    modulesByTrack.set(m.trackId, arr);
  }

  // overall stats
  const total = ts.length;
  const done = ts.filter((t) => t.status === "MASTERED" || t.status === "LEARNED").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <Badge>{done}/{total} tasks · {pct}%</Badge>
        </CardHeader>
      </Card>

      {trs.map((tr) => {
        const trModules = modulesByTrack.get(tr.id) ?? [];
        return (
          <Card key={tr.id} className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">{tr.title}</CardTitle>
              {tr.summary && <p className="text-xs text-muted-foreground">{tr.summary}</p>}
            </CardHeader>
            <CardContent className="space-y-4">
              {trModules.length === 0 && <p className="text-sm italic text-muted-foreground">No modules yet.</p>}
              {trModules.map((m) => {
                const mts = tasksByModule.get(m.id) ?? [];
                return (
                  <div key={m.id} className="rounded-md border border-border bg-muted/30">
                    <div className="border-b border-border px-3 py-2 text-sm font-semibold">{m.title}</div>
                    <ul className="divide-y divide-border">
                      {mts.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <StatusDot status={t.status} />
                          <Link href={`/tasks/${t.id}`} className="flex-1 hover:underline">
                            <span className="font-mono text-xs text-muted-foreground">{t.code ?? ""}</span>{" "}
                            <span>{t.title}</span>
                          </Link>
                          <Badge className="text-[10px]">{t.priority}</Badge>
                          <span className="text-xs text-muted-foreground">{t.estimatedMinutes}m</span>
                        </li>
                      ))}
                      {mts.length === 0 && (
                        <li className="px-3 py-2 text-sm italic text-muted-foreground">No tasks yet.</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function StatusDot({ status }: { status: string }) {
  const valid = TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number]);
  const tone = !valid
    ? "bg-muted"
    : status === "MASTERED" || status === "LEARNED"
    ? "bg-emerald-500"
    : status === "IN_PROGRESS" || status === "SCHEDULED"
    ? "bg-amber-500"
    : status === "BLOCKED"
    ? "bg-red-500"
    : status === "NEEDS_REVIEW"
    ? "bg-rose-500"
    : "bg-muted";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />;
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <h1 className="text-2xl font-semibold">No roadmap yet</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Import a roadmap from Settings → Import, or start by creating one. A roadmap is a tree
            of tracks, modules and tasks.
          </p>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/settings/import">Import roadmap</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings/seed">Seed example</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}