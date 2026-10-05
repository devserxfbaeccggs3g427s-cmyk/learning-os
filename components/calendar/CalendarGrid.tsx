"use client";
import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen, Microscope, ShieldAlert, MessageCircleQuestion, BrainCircuit,
  Clock, FileText, CheckCircle2, X, Loader2, PlayCircle, ExternalLink,
  RefreshCcw, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Textarea } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { cn } from "@/lib/utils/cn";

export interface CalendarBlockItem {
  id: string;
  taskId: string | null;
  taskCode: string | null;
  taskTitle: string | null;
  type: string;
  title: string;
  objective: string | null;
  deliverable: string | null;
  startMinute: number;
  durationMinutes: number;
  status: string;
  /** True when a note has been written for this block. */
  hasNote: boolean;
}

export interface CalendarDay {
  date: string;
  objective: string | null;
  blocks: CalendarBlockItem[];
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

const STATUS_LABEL: Record<string, string> = {
  DONE: "DONE",
  IN_PROGRESS: "IN PROGRESS",
  SKIPPED: "SKIPPED",
  PLANNED: "PLANNED",
};

function statusTone(status: string): string {
  switch (status) {
    case "DONE": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "IN_PROGRESS": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "SKIPPED": return "bg-red-500/10 text-red-600 border-red-500/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function fmtMinute(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The interactive calendar: a day-column grid of study blocks.
 *
 * Two interactions, both backed by the API rather than local state so the
 * server stays the source of truth:
 *  - click a block → modal detail panel (task link, objective/deliverable, and the
 *    block's own note, saved to the block)
 *  - drag a block onto another day (or another spot in that day) → POST
 *    /api/schedule/blocks/[id]/move, which rejects overlaps with a 409
 *
 * The dragged block id lives in a ref, not state: `dragstart` fires and then
 * `drop` fires many frames later, and React 19 would still have the pre-drag
 * `selected` value batched in when the drop handler reads it. A ref is always
 * current, so the drop targets the block the user actually grabbed.
 *
 * Blocks are NOT capped per day. The old "+N more" badge hid blocks the user
 * now needs to click for notes and drag to reschedule — the window shows a
 * full week per row, so the tallest day is comfortably readable.
 */
export function CalendarGrid({
  userId,
  days,
  today,
  realToday,
}: {
  userId: string;
  days: CalendarDay[];
  /** Study date (the highlighted day). */
  today: string;
  realToday: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ date: string; block: CalendarBlockItem } | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The block under the cursor. Read on drop, so it must not be state.
  const dragIdRef = useRef<string | null>(null);

  // Note state for the modal.
  const [noteDraft, setNoteDraft] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const totalMin = useMemo(
    () => days.reduce((s, d) => s + d.blocks.reduce((m, b) => m + b.durationMinutes, 0), 0),
    [days],
  );

  function openDetail(date: string, block: CalendarBlockItem) {
    setSelected({ date, block });
    setNoteSaved(false);
    setNoteDraft("");
    setNoteLoading(true);
    fetch(`/api/notes/block/save?blockId=${block.id}&userId=${userId}`)
      .then((r) => r.json())
      .then((j) => {
        setNoteDraft(j.note?.content ?? "");
        setNoteLoading(false);
      })
      .catch(() => setNoteLoading(false));
  }

  function closeDetail() {
    setSelected(null);
  }

  async function saveNote() {
    if (!selected) return;
    setNoteSaving(true);
    const r = await fetch("/api/notes/block/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blockId: selected.block.id, userId, content: noteDraft }),
    });
    setNoteSaving(false);
    if (r.ok) {
      setNoteSaved(true);
      setError(null);
      router.refresh();
    } else {
      setError("Không lưu được note. Thử lại.");
    }
  }

  async function moveBlock(blockId: string, targetDate: string, targetMinute: number) {
    setMoving(blockId);
    setError(null);
    const r = await fetch(`/api/schedule/blocks/${blockId}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, newDate: targetDate, newStartMinute: targetMinute }),
    });
    setMoving(null);
    if (r.ok) {
      setSelected(null);
      router.refresh();
    } else if (r.status === 409) {
      setError("Giờ đó đã có block khác trên ngày này — hãy kéo sang giờ khác.");
    } else {
      setError("Không dời được block. Thử lại.");
    }
  }

  async function setStatus(blockId: string, status: string) {
    setMoving(blockId);
    setError(null);
    const r = await fetch(`/api/schedule/blocks/${blockId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setMoving(null);
    if (r.ok) {
      router.refresh();
    } else {
      setError("Không cập nhật được trạng thái block.");
    }
  }

  /** Same call TodayView makes, so a block started from the calendar is
   *  indistinguishable from one started on Today. */
  async function startSession(block: CalendarBlockItem) {
    if (!block.taskId) return;
    setStarting(block.id);
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch("/api/sessions/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          taskId: block.taskId,
          blockId: block.id,
          objective: block.objective ?? block.title,
        }),
        signal: ctrl.signal,
      });
      if (r.ok) {
        const j = await r.json();
        if (j.sessionId) {
          window.location.href = `/sessions/${j.sessionId}`;
          return;
        }
      }
      setError("Không tạo được session. Thử lại.");
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "Request quá 15s — database chậm. Thử lại hoặc mở task trực tiếp."
          : "Không tạo được session. Thử lại.",
      );
    } finally {
      clearTimeout(timeout);
      setStarting(null);
    }
  }

  // Close modal on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selected) closeDetail();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-7">
        {days.map((d) => {
          const isStudyDate = d.date === today;
          const isRealToday = d.date === realToday;
          const dayMin = d.blocks.reduce((s, b) => s + b.durationMinutes, 0);
          return (
            <Card
              key={d.date}
              className={cn(
                "min-h-40",
                isStudyDate && "border-primary/60 ring-2 ring-primary/20",
                dropDate === d.date && "border-dashed border-primary",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropDate(d.date);
              }}
              onDragLeave={(e) => {
                // Only clear when the pointer actually leaves the column —
                // dragleave also fires when moving between child nodes.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropDate(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDropDate(null);
                const blockId = dragIdRef.current;
                dragIdRef.current = null;
                if (!blockId) return;
                const rect = e.currentTarget.getBoundingClientRect();
                // Vertical position in the column maps onto the 24h day,
                // snapped to 5 minutes. Clamped so a block always fits.
                const ratio = (e.clientY - rect.top) / rect.height;
                const raw = Math.round((ratio * 24 * 60) / 5) * 5;
                const block = days.flatMap((x) => x.blocks).find((b) => b.id === blockId);
                const max = block ? Math.max(0, 1440 - block.durationMinutes) : 1380;
                void moveBlock(blockId, d.date, Math.min(max, Math.max(0, raw)));
              }}
            >
              <CardHeader className="px-3 py-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {new Date(d.date + "T00:00:00Z").toLocaleDateString("vi-VN", {
                      weekday: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    {isRealToday && !isStudyDate && (
                      <span className="rounded-full bg-muted px-1.5 text-[9px]">today</span>
                    )}
                    <span className="font-mono">{d.date.slice(8)}</span>
                  </span>
                </div>
                {dayMin > 0 && (
                  <div className="font-mono text-[9px] text-muted-foreground">
                    {d.blocks.length} block{d.blocks.length > 1 ? "s" : ""} · {dayMin}m
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-1 px-3 py-1">
                {d.blocks.length === 0 && (
                  <p className="text-[10px] italic text-muted-foreground">no blocks</p>
                )}
                {d.blocks.map((b) => {
                  const Icon = TYPE_ICON[b.type] ?? BookOpen;
                  return (
                    <div
                      key={b.id}
                      draggable
                      onDragStart={(e) => {
                        dragIdRef.current = b.id;
                        e.dataTransfer.effectAllowed = "move";
                        // Firefox refuses to start a drag unless some data moves.
                        e.dataTransfer.setData("text/plain", b.id);
                      }}
                      onDragEnd={() => {
                        dragIdRef.current = null;
                        setDropDate(null);
                      }}
                      onClick={() => openDetail(d.date, b)}
                      className={cn(
                        "cursor-pointer space-y-0.5 rounded bg-muted/50 px-1.5 py-1 text-[10px] transition hover:bg-accent",
                        moving === b.id && "opacity-50",
                      )}
                      title={`${fmtMinute(b.startMinute)}–${fmtMinute(b.startMinute + b.durationMinutes)} · ${b.type}\nClick: xem chi tiết + note · Drag: dời lịch`}
                    >
                      <div className="flex items-center gap-1">
                        <Icon className="h-3 w-3 shrink-0" />
                        <span className="font-mono">{fmtMinute(b.startMinute)}</span>
                        <span className="truncate">{b.title}</span>
                        {b.hasNote && (
                          <FileText className="h-3 w-3 shrink-0 text-primary" aria-label="có note" />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={cn(statusTone(b.status), "text-[9px]")}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                        {!b.taskId && (
                          <span className="text-[9px] uppercase text-amber-600" title="Chưa liên kết task">
                            no task
                          </span>
                        )}
                        <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                          {b.durationMinutes}m
                        </span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal detail panel */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => closeDetail()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-detail-title"
        >
          <div
            className="relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-xl bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border p-4">
              <div className="space-y-1">
                <h2 id="block-detail-title" className="flex items-center gap-2 text-lg font-semibold">
                  {(() => {
                    const Icon = TYPE_ICON[selected.block.type] ?? BookOpen;
                    return <Icon className="h-5 w-5 text-primary" />;
                  })()}
                  {selected.block.title}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">
                    {fmtMinute(selected.block.startMinute)}–
                    {fmtMinute(selected.block.startMinute + selected.block.durationMinutes)}
                  </span>
                  <span>·</span>
                  <span className="uppercase tracking-wide">{selected.block.type}</span>
                  <span>·</span>
                  <span className="font-mono">{selected.date}</span>
                  <span className={statusTone(selected.block.status)}>
                    {STATUS_LABEL[selected.block.status] ?? selected.block.status}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {selected.block.durationMinutes}m
                  </span>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={closeDetail}
                aria-label="Close"
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              {selected.block.taskId ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => startSession(selected.block)}
                    disabled={starting === selected.block.id}
                  >
                    {starting === selected.block.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Starting…
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4" /> Start session
                      </>
                    )}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/tasks/${selected.block.taskId}`}>
                      <ExternalLink className="h-3.5 w-3.5" /> Open task
                    </Link>
                  </Button>
                  {selected.block.status === "PLANNED" || selected.block.status === "IN_PROGRESS" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStatus(selected.block.id, "SKIPPED")}
                      disabled={moving === selected.block.id}
                    >
                      <RefreshCcw className="h-3.5 w-3.5" /> Skip
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStatus(selected.block.id, "PLANNED")}
                      disabled={moving === selected.block.id}
                    >
                      <RefreshCcw className="h-3.5 w-3.5" /> Reopen
                    </Button>
                  )}
                  {selected.block.taskCode && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {selected.block.taskCode} · {selected.block.taskTitle}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  Block này chưa liên kết task — không thể Start session.{" "}
                  <Link href="/roadmap" className="underline">
                    Mở roadmap
                  </Link>{" "}
                  để liên kết, hoặc Skip block.
                </p>
              )}

              {selected.block.objective && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Objective
                  </div>
                  <div className="mt-1 text-sm">
                    <MarkdownRenderer source={selected.block.objective} />
                  </div>
                </div>
              )}
              {selected.block.deliverable && (
                <p className="text-xs italic text-muted-foreground">
                  Deliverable: {selected.block.deliverable}
                </p>
              )}

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Block notes
                </div>
                {noteLoading ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </p>
                ) : (
                  <>
                    <Textarea
                      className="mt-1 h-48"
                      placeholder="// Key takeaways, questions to ask AI later, follow-up tasks…"
                      value={noteDraft}
                      onChange={(e) => {
                        setNoteDraft(e.target.value);
                        setNoteSaved(false);
                      }}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <Button size="sm" onClick={saveNote} disabled={noteSaving}>
                        {noteSaving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        Save note
                      </Button>
                      {noteSaved && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Saved
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground">
                Mẹo: click để xem note, kéo sang cột ngày khác (hoặc vị trí khác trong ngày) để dời lịch.
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {days.reduce((n, d) => n + d.blocks.length, 0)} blocks ·{" "}
        {Math.floor(totalMin / 60)}h{totalMin % 60 ? ` ${totalMin % 60}m` : ""} planned in this window.
      </p>
    </div>
  );
}