import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { CardSkeleton } from "@/components/ui";
import { getDefaultUser } from "@/lib/ai/service";
import { TASK_STATUSES, type StudyBlockType } from "@/config/domain";
import { getRoadmapTree, listRoadmaps } from "@/lib/db/queries/roadmap";
import { getStudyDate } from "@/lib/utils/study-date";
import { parseDailyBlockTypes, serializeDailyBlockTypes } from "@/lib/roadmap/daily";
import { DailyView } from "@/components/roadmap/DailyView";

export const dynamic = "force-dynamic";

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; types?: string | string[] }>;
}) {
  const user = await getDefaultUser();
  const params = await searchParams;
  const view = params.view;

  if (view === "day") {
    const types = parseDailyBlockTypes(params.types);
    const studyDate = await getStudyDate();
    const from = new Date(`${studyDate}T00:00:00Z`);
    const to = new Date(from);
    from.setUTCDate(from.getUTCDate() - 7);
    to.setUTCDate(to.getUTCDate() + 21);
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
          <RoadmapNavigation view="day" types={types} />
          <Suspense fallback={<CardSkeleton lines={4} />}>
            <DailyView
              userId={user.id}
              from={from.toISOString().slice(0, 10)}
              to={to.toISOString().slice(0, 10)}
              types={types}
            />
          </Suspense>
        </div>
      </AppShell>
    );
  }

  // Both are cached → effectively instant on warm cache.
  const rms = await listRoadmaps(user.id);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
        <RoadmapNavigation view="tree" />
        {rms.length === 0 ? <EmptyState /> : rms.map((rm) => (
          // Each roadmap streams in independently — the first renders
          // immediately while later ones are still loading. Without the
          // boundary, one bad query would gate the whole page.
          <Suspense
            key={rm.id}
            fallback={
              <div className="space-y-3">
                <CardSkeleton lines={2} />
                <CardSkeleton lines={4} />
              </div>
            }
          >
            <RoadmapCard
              userId={user.id}
              roadmapId={rm.id}
              title={rm.title}
              description={rm.description ?? null}
            />
          </Suspense>
        ))}
      </div>
    </AppShell>
  );
}

function RoadmapNavigation({ view, types }: { view: "tree" | "day"; types?: StudyBlockType[] }) {
  const dayHref = types ? `/roadmap?view=day&types=${serializeDailyBlockTypes(types)}` : "/roadmap?view=day";
  return (
    <nav aria-label="Chế độ xem roadmap" className="flex gap-2">
      <Button asChild size="sm" variant={view === "tree" ? "default" : "outline"}>
        <Link href="/roadmap" aria-current={view === "tree" ? "page" : undefined}>Cây roadmap</Link>
      </Button>
      <Button asChild size="sm" variant={view === "day" ? "default" : "outline"}>
        <Link href={dayHref} aria-current={view === "day" ? "page" : undefined}>Theo ngày</Link>
      </Button>
    </nav>
  );
}

async function RoadmapCard({
  userId,
  roadmapId,
  title,
  description,
}: {
  userId: string;
  roadmapId: string;
  title: string;
  description: string | null;
}) {
  // Cached, projection-only tree. JSONB columns (concepts, interviewQs,
  // etc.) are NOT loaded — saves ~80% payload on 205 tasks.
  const tree = await getRoadmapTree(userId, roadmapId);

  if (!tree) {
    return (
      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </CardHeader>
        </Card>
      </section>
    );
  }

  const total = tree.totals.taskCount;
  const done = tree.totals.doneCount;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <Badge>
            {done}/{total} tasks · {pct}%
          </Badge>
        </CardHeader>
      </Card>

      {tree.tracks.map((tr) => (
        <Card key={tr.id} className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">{tr.title}</CardTitle>
            {tr.summary && <p className="text-xs text-muted-foreground">{tr.summary}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            {tr.modules.length === 0 && (
              <p className="text-sm italic text-muted-foreground">No modules yet.</p>
            )}
            {tr.modules.map((m) => (
              <div key={m.id} className="rounded-md border border-border bg-muted/30">
                <div className="border-b border-border px-3 py-2 text-sm font-semibold">{m.title}</div>
                <ul className="divide-y divide-border">
                  {m.tasks.map((t) => (
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
                  {m.tasks.length === 0 && (
                    <li className="px-3 py-2 text-sm italic text-muted-foreground">No tasks yet.</li>
                  )}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
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