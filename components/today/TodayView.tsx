"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  BookOpen, Microscope, ShieldAlert, MessageCircleQuestion, BrainCircuit,
  Clock, PlayCircle, PauseCircle, RefreshCcw, CheckCircle2,
  CalendarDays, RotateCcw, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Input } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { cn } from "@/lib/utils/cn";

export interface TodayBlock {
  id: string;
  taskId: string | null;
  type: string;
  title: string;
  objective: string | null;
  startMinute: number;
  durationMinutes: number;
  deliverable: string | null;
  status: string;
  taskTitle: string | null;
  taskCode: string | null;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  LEARN: BookOpen,
  DEEP_DIVE: Microscope,
  LAB: Microscope,
  FAILURE_DRILL: ShieldAlert,
  INTERVIEW: MessageCircleQuestion,
  REVIEW: BrainCircuit,
  SYSTEM_DESIGN: BrainCircuit,
  DEBUG_DRILL: ShieldAlert,
  RECALL: BrainCircuit,
};

function fmtMinute(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function statusTone(status: string): string {
  switch (status) {
    case "DONE": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "IN_PROGRESS": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "SKIPPED": return "bg-red-500/10 text-red-600 border-red-500/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextWeekday(iso: string, target: number): string {
  // 1 = Monday … 7 = Sunday
  const d = new Date(iso + "T00:00:00Z");
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function TodayView({
  userId,
  date,
  realToday,
  overridden,
  objective,
  blocks,
}: {
  userId: string;
  date: string;
  realToday: string;
  overridden: boolean;
  objective: string;
  blocks: TodayBlock[];
}) {
  const totalMin = useMemo(() => blocks.reduce((s, b) => s + b.durationMinutes, 0), [blocks]);
  const doneMin = useMemo(
    () => blocks.filter((b) => b.status === "DONE").reduce((s, b) => s + b.durationMinutes, 0),
    [blocks],
  );
  const progressPct = totalMin === 0 ? 0 : Math.round((doneMin / totalMin) * 100);
  const [isPending, startTx] = useTransition();
  const [items, setItems] = useState(blocks);
  // Track in-flight mutations so per-block buttons can disable during the
  // request — prevents double-click → two sessions for the same block.
  const [busyBlockIds, setBusyBlockIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(date);

  function setBusy(blockId: string, on: boolean) {
    setBusyBlockIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(blockId);
      else next.delete(blockId);
      return next;
    });
  }

  async function setStatus(blockId: string, status: string) {
    if (busyBlockIds.has(blockId)) return;
    setBusy(blockId, true);
    setItems((arr) => arr.map((b) => (b.id === blockId ? { ...b, status } : b)));
    try {
      await fetch(`/api/schedule/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } finally {
      setBusy(blockId, false);
    }
  }

  async function startSession(block: TodayBlock) {
    if (!block.taskId || busyBlockIds.has(block.id)) return;
    setBusy(block.id, true);
    startTx(async () => {
      try {
        const r = await fetch(`/api/sessions/start`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId,
            taskId: block.taskId,
            blockId: block.id,
            objective: block.objective ?? block.title,
          }),
        });
        if (r.ok) {
          const j = await r.json();
          window.location.href = `/sessions/${j.sessionId}`;
        }
      } finally {
        setBusy(block.id, false);
      }
    });
  }

  async function applyDate(newDate: string) {
    document.cookie = `study_date=${newDate}; max-age=2592000; samesite=lax`;
    setPickerOpen(false);
    window.location.reload();
  }

  async function resetToReal() {
    await fetch("/api/study-date", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: true }) });
    setPickerOpen(false);
    window.location.reload();
  }

  const shortcuts = [
    { label: "Hôm nay", date: realToday, primary: !overridden },
    { label: "Hôm qua", date: addDays(realToday, -1) },
    { label: "Ngày mai", date: addDays(realToday, 1) },
    { label: "Thứ Hai", date: nextWeekday(realToday, 1) },
    { label: "Thứ Bảy", date: nextWeekday(realToday, 6) },
    { label: "Chủ nhật", date: nextWeekday(realToday, 0) },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Today · {date}</h1>
          {overridden && (
            <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/30">
              <CalendarDays className="mr-1 h-3 w-3" />
              Đang xem ngày khác (real: {realToday})
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen((v) => !v)}
            className="ml-auto"
          >
            <CalendarDays className="mr-1 h-3.5 w-3.5" />
            Đổi ngày
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {objective ? (
            <MarkdownRenderer source={objective} />
          ) : (
            "Set a daily objective from your schedule to anchor the day."
          )}
        </div>
      </header>

      {pickerOpen && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chọn nhanh:</span>
              {shortcuts.map((s) => (
                <Button
                  key={s.label}
                  size="sm"
                  variant={s.primary ? "default" : "outline"}
                  onClick={() => applyDate(s.date)}
                >
                  {s.label} <span className="ml-1 font-mono text-[10px] opacity-70">{s.date.slice(5)}</span>
                </Button>
              ))}
              {overridden && (
                <Button size="sm" variant="outline" onClick={resetToReal}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Reset về hôm nay
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={pickerDate}
                onChange={(e) => setPickerDate(e.target.value)}
                className="max-w-xs"
              />
              <Button size="sm" onClick={() => applyDate(pickerDate)}>
                <ArrowRight className="mr-1 h-3 w-3" /> Apply
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Hỗ trợ xem trước lịch của ngày bất kỳ (kể cả ngày nghỉ / Tết). Đổi sang ngày khác không xoá lịch gốc.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tiến độ hôm nay</CardTitle>
          <Badge>{doneMin}/{totalMin} min</Badge>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {progressPct}% complete · {blocks.length - items.filter((b) => b.status === "DONE").length} blocks remaining
          </p>
        </CardContent>
      </Card>

      {/* Timeline */}
      <section className="space-y-3">
        {items.length === 0 && (
          <EmptyState overridden={overridden} realToday={realToday} />
        )}
        {items.map((b) => {
          const Icon = TYPE_ICON[b.type] ?? BookOpen;
          const endMin = b.startMinute + b.durationMinutes;
          return (
            <Card key={b.id} className="group overflow-hidden">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 sm:w-40">
                  <div className="rounded-md bg-muted p-2">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {fmtMinute(b.startMinute)}–{fmtMinute(endMin)}
                    </div>
                    <div className="text-xs font-medium uppercase tracking-wide">{b.type}</div>
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold leading-tight">{b.title}</h3>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                        statusTone(b.status),
                      )}
                    >
                      {b.status}
                    </span>
                  </div>
                  {b.taskId && (
                    <Link
                      href={`/tasks/${b.taskId}`}
                      className="mt-0.5 inline-block text-xs text-muted-foreground hover:underline"
                    >
                      {b.taskCode ? `${b.taskCode} · ` : ""}{b.taskTitle}
                    </Link>
                  )}
                  {b.objective && (
                    <p className="mt-2 text-sm text-muted-foreground">{b.objective}</p>
                  )}
                  {b.deliverable && (
                    <p className="mt-1 text-xs italic text-muted-foreground">Deliverable: {b.deliverable}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const busy = busyBlockIds.has(b.id);
                    return (
                      <>
                        {b.status === "PLANNED" && (
                          <Button
                            size="sm"
                            onClick={() => startSession(b)}
                            disabled={busy || isPending}
                            className="gap-1"
                          >
                            <PlayCircle className="h-4 w-4" /> Start
                          </Button>
                        )}
                        {b.status === "IN_PROGRESS" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setStatus(b.id, "DONE")}
                            disabled={busy}
                            className="gap-1"
                          >
                            <CheckCircle2 className="h-4 w-4" /> Finish
                          </Button>
                        )}
                        {b.status === "DONE" && (
                          <Button size="sm" variant="ghost" disabled className="gap-1">
                            <CheckCircle2 className="h-4 w-4" /> Done
                          </Button>
                        )}
                        {(b.status === "PLANNED" || b.status === "IN_PROGRESS") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setStatus(b.id, "SKIPPED")}
                            disabled={busy}
                            className="gap-1"
                          >
                            <RefreshCcw className="h-4 w-4" /> Skip
                          </Button>
                        )}
                        {b.taskId && (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/tasks/${b.taskId}`}>Open</Link>
                          </Button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

function EmptyState({ overridden, realToday }: { overridden: boolean; realToday: string }) {
  if (overridden) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CalendarDays className="h-8 w-8 text-amber-600" />
          <div className="space-y-1">
            <h3 className="font-semibold">Ngày này chưa có study blocks</h3>
            <p className="text-sm text-muted-foreground">
              Real hôm nay là {realToday}. Dùng <strong>Đổi ngày</strong> phía trên để chuyển sang ngày khác.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Clock className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <h3 className="font-semibold">No study blocks scheduled yet</h3>
          <p className="text-sm text-muted-foreground">
            Import a roadmap and a daily schedule, or schedule a task from the roadmap.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/roadmap">Open Roadmap</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/settings/import">Import</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}