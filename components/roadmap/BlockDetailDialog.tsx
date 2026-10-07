"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Clock, ExternalLink, Microscope, Sparkles, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { FrameChatDialog } from "@/components/ai/FrameChatDialog";
import type { ScheduledBlock } from "@/lib/db/queries/tasks";

function formatTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function BlockDetailDialog({ userId, block }: { userId: string; block: ScheduledBlock }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteState, setNoteState] = useState<"loading" | "ready" | "error">("loading");
  const [frameOpen, setFrameOpen] = useState(false);
  const Icon = block.type === "LEARN" ? BookOpen : Microscope;

  useEffect(() => () => requestRef.current?.abort(), []);

  async function openDetail() {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setNote(null);
    setNoteState("loading");
    dialogRef.current?.showModal();
    try {
      const params = new URLSearchParams({ blockId: block.id, userId });
      const response = await fetch(`/api/notes/block/save?${params}`, { signal: request.signal });
      if (!response.ok) throw new Error("Không tải được note");
      const data = await response.json();
      if (request.signal.aborted) return;
      setNote(typeof data.note?.content === "string" ? data.note.content : null);
      setNoteState("ready");
    } catch {
      if (!request.signal.aborted) setNoteState("error");
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => void openDetail()}
        className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 rounded py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatTime(block.startMinute)}–{formatTime(block.startMinute + block.durationMinutes)}
        </span>
        <span className="min-w-0 flex-1">{block.title}</span>
        <Badge className="text-[10px]">{block.type}</Badge>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`block-detail-${block.id}`}
        onClose={() => {
          requestRef.current?.abort();
          setFrameOpen(false);
          triggerRef.current?.focus();
        }}
        onCancel={(event) => {
          // Escape khi drawer AI đang mở: đóng drawer trước, giữ popup block.
          if (frameOpen) {
            event.preventDefault();
            setFrameOpen(false);
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="w-[calc(100%-2rem)] max-w-2xl sm:max-w-3xl max-h-[90vh] overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="flex items-start justify-between border-b border-border p-4">
          <div className="min-w-0 space-y-1">
            <h2 id={`block-detail-${block.id}`} className="flex items-center gap-2 text-lg font-semibold">
              <Icon className="h-5 w-5 shrink-0 text-primary" /> {block.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">
                {formatTime(block.startMinute)}–{formatTime(block.startMinute + block.durationMinutes)}
              </span>
              <span>·</span>
              <span>{block.type}</span>
              <span>·</span>
              <span className="font-mono">{block.date}</span>
              <span>·</span>
              <span>{block.status}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{block.durationMinutes}m</span>
            </div>
          </div>
          <Button autoFocus type="button" size="icon" variant="ghost" aria-label="Đóng chi tiết block" className="h-8 w-8 shrink-0" onClick={() => dialogRef.current?.close()}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFrameOpen(true)}
              title="Mở AI chat frame cho block này"
            >
              <Sparkles className="h-3.5 w-3.5" /> Ask AI
            </Button>
            {block.taskId && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/tasks/${block.taskId}`}><ExternalLink className="h-3.5 w-3.5" /> Open task</Link>
              </Button>
            )}
            {block.taskCode && <span className="text-xs text-muted-foreground">{block.taskCode} · {block.taskTitle}</span>}
          </div>
          {block.objective && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</h3>
              <MarkdownRenderer source={block.objective} className="mt-1 overflow-x-auto" />
            </div>
          )}
          {block.deliverable && <p className="text-xs italic text-muted-foreground">Deliverable: {block.deliverable}</p>}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Block notes</h3>
            {noteState === "loading" ? (
              <p role="status" className="mt-1 text-sm text-muted-foreground">Đang tải note…</p>
            ) : noteState === "error" ? (
              <p role="alert" className="mt-1 text-sm text-destructive">Không tải được note. Đóng và mở lại để thử lại.</p>
            ) : note ? (
              <MarkdownRenderer source={note} className="mt-1 overflow-x-auto" />
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Chưa có note cho block này.</p>
            )}
          </div>
        </div>
        {/* Nằm trong <dialog> để drawer AI không bị top-layer của dialog che.
            Cả hai mở cùng lúc: đọc objective/note bên trái, hỏi AI bên phải. */}
        <FrameChatDialog
          userId={userId}
          open={frameOpen}
          onClose={() => setFrameOpen(false)}
          entryPoint="BLOCK_DETAIL"
          taskId={block.taskId ?? undefined}
          taskCode={block.taskCode}
          seedPrompt={`Giải thích block "${block.title}" (${block.type}, ${block.date})`}
        />
      </dialog>
    </>
  );
}
