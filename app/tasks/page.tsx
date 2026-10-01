import Link from "next/link";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks, modules, tracks, roadmaps } from "@/lib/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, Badge } from "@/components/ui";
import { TASK_STATUSES } from "@/config/domain";
import { ListTree } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  BACKLOG: "bg-muted text-muted-foreground",
  SCHEDULED: "bg-blue-500/10 text-blue-600",
  IN_PROGRESS: "bg-amber-500/10 text-amber-600",
  LEARNED: "bg-emerald-500/10 text-emerald-600",
  NEEDS_REVIEW: "bg-rose-500/10 text-rose-600",
  MASTERED: "bg-emerald-700/10 text-emerald-700",
  BLOCKED: "bg-red-500/10 text-red-600",
};

export default async function TasksListPage() {
  const all = await db.select().from(tasks).orderBy(asc(tasks.orderIndex));
  const allModules = await db.select().from(modules);
  const allTracks = await db.select().from(tracks);
  const allRoadmaps = await db.select().from(roadmaps);

  const modMap = new Map(allModules.map((m) => [m.id, m]));
  const trackMap = new Map(allTracks.map((t) => [t.id, t]));
  const rmMap = new Map(allRoadmaps.map((r) => [r.id, r]));

  // Group by status
  const groups: Record<string, typeof all> = {};
  for (const t of all) {
    const s = TASK_STATUSES.includes(t.status as (typeof TASK_STATUSES)[number]) ? t.status : "BACKLOG";
    (groups[s] ??= []).push(t);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ListTree className="h-6 w-6 text-primary" /> All Tasks
        </h1>

        {all.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No tasks yet. Import a roadmap from{" "}
              <Link className="text-primary underline" href="/settings/import">Settings → Import</Link>.
            </CardContent>
          </Card>
        )}

        {TASK_STATUSES.map((status) => {
          const items = groups[status] ?? [];
          if (items.length === 0) return null;
          return (
            <section key={status}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {status} <Badge>{items.length}</Badge>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => {
                  const m = modMap.get(t.moduleId);
                  const tr = m ? trackMap.get(m.trackId) : null;
                  const rm = tr ? rmMap.get(tr.roadmapId) : null;
                  return (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      className="rounded-md border border-border bg-card p-3 hover:bg-accent"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{t.code ?? ""}</span>
                        <span className={STATUS_TONE[t.status] ?? ""}>{t.priority}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm font-medium leading-5">{t.title}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        {rm && <span>{rm.title}</span>}
                        {tr && <span>› {tr.title}</span>}
                        {m && <span>› {m.title}</span>}
                        <span className="ml-auto">{t.estimatedMinutes}m</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}