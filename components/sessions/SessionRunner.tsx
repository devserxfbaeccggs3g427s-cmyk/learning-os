"use client";
import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Textarea, Badge } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { FrameChatDialog } from "@/components/ai/FrameChatDialog";
import { Play, Pause, Square, ArrowLeft, Timer, Save, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

interface SessionRunnerProps {
  userId: string;
  blockId: string | null;
  session: { id: string; taskId: string; startedAt: string; endedAt: string | null; durationSeconds: number; status: string; objective: string | null };
  task: { id: string; code: string | null; title: string; description: string | null };
  initialNote: string;
}

export function SessionRunner({ session, task, initialNote, userId, blockId }: SessionRunnerProps) {
  const [elapsed, setElapsed] = useState(session.durationSeconds);
  const [paused, setPaused] = useState(session.status === "PAUSED");
  // Seeded from initialNote. This used to be useState("") — the prop was
  // accepted and then ignored, so every session opened with a blank editor
  // and finishing overwrote the stored note with whatever was typed (or "").
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ difficulty: 3, confidence: 3 });
  const [finishing, setFinishing] = useState(false);
  const [frameChatOpen, setFrameChatOpen] = useState(false);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    interval.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (interval.current) clearInterval(interval.current);
    };
  }, [paused]);

  async function persistNote() {
    setSaving(true);
    // A session started from a study block writes to that block's note —
    // one note per block, so six blocks on one task no longer overwrite
    // each other. Block-less sessions (started straight from the task
    // page, say) still fall back to the task-level note.
    const url = blockId ? "/api/notes/block/save" : "/api/notes/save";
    const body = blockId
      ? { blockId, userId, content: note }
      : { taskId: task.id, userId, content: note };
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    return r.ok;
  }

  async function finish() {
    setFinishing(true);
    await persistNote();
    // Mark the session COMPLETED — server rolls up time into task_progress.
    const r = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "COMPLETED",
        difficultyFeedback: feedback.difficulty,
        confidence: feedback.confidence,
        sessionNotes: note.slice(0, 2000),
      }),
    });
    if (!r.ok) {
      alert("Could not finish session. Please retry.");
      setFinishing(false);
      return;
    }
    // Auto-mark the linked study block DONE so Today's progress reflects it.
    if (blockId) {
      await fetch(`/api/schedule/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
    }
    window.location.href = `/tasks/${task.id}`;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-8">
      <Link href={`/tasks/${task.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to task
      </Link>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {task.code && <span className="font-mono">{task.code}</span>}
              <span>•</span>
              <Badge>{paused ? "Paused" : session.status}</Badge>
            </div>
            <CardTitle className="mt-1 text-xl">{task.title}</CardTitle>
            {session.objective && (
              <p className="mt-1 text-sm text-muted-foreground">Objective: {session.objective}</p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFrameChatOpen(true)}
              className="mt-2 gap-1"
              title="Open an AI chat frame bound to this task — it can answer questions about what you're working on"
            >
              <Sparkles className="h-4 w-4" /> Ask AI
            </Button>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-bold tabular-nums">{fmt(elapsed)}</div>
            <div className="mt-1 flex justify-end gap-1">
              <Button size="icon" variant="outline" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Resume" : "Pause"}>
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="destructive" onClick={finish} aria-label="Finish">
                <Square className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {task.description && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Brief</CardTitle></CardHeader>
          <CardContent>
            <MarkdownRenderer source={task.description} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {blockId ? "Block notes" : "Session notes"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {blockId
              ? "Attached to this study block — reopening the block later shows the same note. Saved automatically when you finish."
              : "Saved automatically when you finish."}
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            className="h-48"
            placeholder="// Key takeaways, questions to ask AI later, follow-up tasks…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={persistNote} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save notes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Feedback</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Difficulty (1 easy → 5 hard)</label>
            <input
              type="range"
              min={1}
              max={5}
              value={feedback.difficulty}
              onChange={(e) => setFeedback((f) => ({ ...f, difficulty: Number(e.target.value) }))}
              className="mt-1 w-full"
            />
            <div className="text-center text-sm font-medium">{feedback.difficulty}</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Confidence (1 low → 5 high)</label>
            <input
              type="range"
              min={1}
              max={5}
              value={feedback.confidence}
              onChange={(e) => setFeedback((f) => ({ ...f, confidence: Number(e.target.value) }))}
              className="mt-1 w-full"
            />
            <div className="text-center text-sm font-medium">{feedback.confidence}</div>
          </div>
        </CardContent>
      </Card>

      {/* The frame is BOUND to this task: the task id is stored on the
          frame row, so the AI knows what "this task" means. It still
          carries no schedule or cross-task context — the user picks
          any wider knowledge scope inside the dialog. */}
      <FrameChatDialog
        userId={userId}
        open={frameChatOpen}
        onClose={() => setFrameChatOpen(false)}
        entryPoint="START_TASK"
        taskId={task.id}
        taskCode={task.code}
      />
    </div>
  );
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}