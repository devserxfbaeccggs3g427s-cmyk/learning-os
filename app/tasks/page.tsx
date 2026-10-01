import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { TASK_STATUSES } from "@/config/domain";
import { ListTree } from "lucide-react";
import { getDefaultUser } from "@/lib/ai/service";
import { listTasks } from "@/lib/db/queries/tasks";

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

const PAGE_SIZE = 100;

type SearchParams = Promise<{ status?: string; page?: string }>;

export default async function TasksListPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getDefaultUser();
  const sp = await searchParams;

  const statusFilter = TASK_STATUSES.includes(sp.status as (typeof TASK_STATUSES)[number])
    ? sp.status
    : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // Single JOINed query — paginated, status-filterable, projection-only.
  // The breadcrumb (roadmap › track › module) is already on each row.
  const { items, total } = await listTasks({
    userId: user.id,
    status: statusFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  // Group by status (within the current page). For all-status view we keep
  // the legacy "sections by status" UX; for filtered view we render a flat
  // list with pagination controls.
  const groups: Record<string, typeof items> = {};
  for (const t of items) {
    const s = TASK_STATUSES.includes(t.status as (typeof TASK_STATUSES)[number])
      ? t.status
      : "BACKLOG";
    (groups[s] ??= []).push(t);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ListTree className="h-6 w-6 text-primary" /> All Tasks
          </h1>
          <div className="flex flex-wrap items-center gap-1">
            <FilterChip href="/tasks" label="All" active={!statusFilter} />
            {TASK_STATUSES.map((s) => (
              <FilterChip key={s} href={`/tasks?status=${s}`} label={s} active={statusFilter === s} />
            ))}
          </div>
        </header>

        {items.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No tasks yet. Import a roadmap from{" "}
              <Link className="text-primary underline" href="/settings/import">
                Settings → Import
              </Link>
              .
            </CardContent>
          </Card>
        )}

        {TASK_STATUSES.map((status) => {
          const grouped = groups[status] ?? [];
          if (grouped.length === 0) return null;
          return (
            <section key={status}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {status} <Badge>{grouped.length}</Badge>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.map((t) => (
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
                      <span>{t.roadmapTitle}</span>
                      <span>› {t.trackTitle}</span>
                      <span>› {t.moduleTitle}</span>
                      <span className="ml-auto">{t.estimatedMinutes}m</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {/* Pagination footer — only show when a filter narrows results. */}
        {statusFilter && total > PAGE_SIZE && (
          <nav className="flex items-center justify-between border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
                {page > 1 ? (
                  <Link href={`/tasks?status=${statusFilter}&page=${page - 1}`}>← Prev</Link>
                ) : (
                  <span>← Prev</span>
                )}
              </Button>
              <Button
                asChild={page < totalPages}
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
              >
                {page < totalPages ? (
                  <Link href={`/tasks?status=${statusFilter}&page=${page + 1}`}>Next →</Link>
                ) : (
                  <span>Next →</span>
                )}
              </Button>
            </div>
          </nav>
        )}
      </div>
    </AppShell>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70"
      }`}
    >
      {label}
    </Link>
  );
}
