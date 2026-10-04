"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Card, CardContent, Button, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { FrameChatDialog } from "@/components/ai/FrameChatDialog";
import { Save, Check, Eye, Pencil, Columns2, Maximize2, Minimize2, History, Sparkles } from "lucide-react";

interface NoteEditorProps {
  userId: string;
  taskId: string;
  initialContent: string;
  initialRevision: number;
}

type Mode = "edit" | "preview" | "split" | "reading";

export function NoteEditor({ userId, taskId, initialContent, initialRevision }: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [savedRevision, setSavedRevision] = useState(initialRevision);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>("split");
  const [frameChatOpen, setFrameChatOpen] = useState(false);
  const [_, startTx] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save (debounced)
  useEffect(() => {
    if (content === initialContent) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTx(async () => {
        setSaving(true);
        const r = await fetch("/api/notes/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ taskId, userId, content }),
        });
        if (r.ok) {
          const j = await r.json();
          setSavedRevision(j.revision ?? savedRevision);
        }
        setSaving(false);
      });
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [content, taskId, userId, initialContent]); // eslint-disable-line react-hooks/exhaustive-deps

  async function manualSave() {
    setSaving(true);
    const r = await fetch("/api/notes/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId, userId, content, message: "Manual save" }),
    });
    if (r.ok) {
      const j = await r.json();
      setSavedRevision(j.revision ?? savedRevision);
    }
    setSaving(false);
  }

  const isDirty = content !== initialContent;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Notes · revision {savedRevision}</span>
          {saving ? (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Save className="h-3 w-3 animate-pulse" /> saving…
            </span>
          ) : isDirty ? (
            <span className="text-muted-foreground">unsaved</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="h-3 w-3" /> saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden gap-1 sm:flex">
            <ModeButton active={mode === "edit"} onClick={() => setMode("edit")}><Pencil className="h-3 w-3" /> Edit</ModeButton>
            <ModeButton active={mode === "split"} onClick={() => setMode("split")}><Columns2 className="h-3 w-3" /> Split</ModeButton>
            <ModeButton active={mode === "preview"} onClick={() => setMode("preview")}><Eye className="h-3 w-3" /> Preview</ModeButton>
            <ModeButton active={mode === "reading"} onClick={() => setMode("reading")}><Maximize2 className="h-3 w-3" /> Reading</ModeButton>
          </div>
          <Button size="sm" variant="outline" onClick={() => setFrameChatOpen(true)}>
            <Sparkles className="mr-1 h-3 w-3" /> Ask AI
          </Button>
          <Button size="sm" variant="outline" onClick={manualSave} disabled={!isDirty || saving}>
            <Save className="mr-1 h-3 w-3" /> Save
          </Button>
        </div>
      </div>

      {/* Bound to THIS task: the task id is stored on the frame row,
          so the AI knows which task is meant. Everything wider — the
          task index, the roadmap, other notes — still needs an
          explicit scope choice inside the dialog. */}
      <FrameChatDialog
        userId={userId}
        open={frameChatOpen}
        onClose={() => setFrameChatOpen(false)}
        entryPoint="NOTE_SCREEN"
        taskId={taskId}
      />

      {mode === "split" && (
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <textarea
            className="h-[70vh] w-full resize-none border-0 border-r border-border bg-background p-4 font-mono text-sm leading-6 outline-none lg:h-[calc(100vh-220px)]"
            placeholder="// Description... write your notes here. Supports Markdown + :::concept blocks."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="max-h-[70vh] overflow-y-auto bg-muted/20 p-4 lg:h-[calc(100vh-220px)] lg:max-h-none">
            <MarkdownRenderer source={content || "_Empty note._"} />
          </div>
        </div>
      )}

      {mode === "edit" && (
        <textarea
          className="h-[70vh] w-full resize-none border-0 bg-background p-4 font-mono text-sm leading-6 outline-none"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}

      {mode === "preview" && (
        <div className="max-h-[70vh] overflow-y-auto bg-muted/20 p-4">
          <MarkdownRenderer source={content || "_Empty note._"} />
        </div>
      )}

      {mode === "reading" && (
        <div className="mx-auto max-w-3xl bg-background p-8">
          <MarkdownRenderer source={content || "_Empty note._"} reading />
        </div>
      )}
    </Card>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs ${
        active ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}