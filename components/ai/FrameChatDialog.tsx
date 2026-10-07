"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Badge, Textarea, Separator } from "@/components/ui";
import { ChatTranscript } from "@/components/ai/ChatTranscript";
import { useFrameChat, type FrameTurnResult } from "@/lib/ai/useFrameChat";
import {
  KNOWLEDGE_MODE_LABELS,
  KNOWLEDGE_MODES,
  grantsKnowledge,
  type FrameKnowledgeMode,
} from "@/lib/ai/frame/client-scope";
import { stripNoAnswerMarker } from "@/lib/ai/frame/no-answer";
import {
  NEW_CHAT_TITLE,
  isUnnamed,
  titleFromPrompt,
  stripTitlePrefix,
  taskTitlePrefix,
  MAX_TITLE_CHARS,
} from "@/lib/ai/frame/title";
import { preloadTaskLinks } from "@/lib/ai/useTaskLinks";
import { cn } from "@/lib/utils/cn";
import {
  Loader2,
  Plus,
  Send,
  Sparkles,
  X,
  MessageSquarePlus,
  DatabaseZap,
  CircleHelp,
  Trash2,
} from "lucide-react";

interface FrameMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface FrameChatDialogProps {
  userId: string;
  open: boolean;
  onClose: () => void;
  /** Where the frame was opened from. Recorded for display, and the
   *  reason `taskId` is expected to be set: a frame opened from a
   *  task-aware screen is bound to that task, which then joins the
   *  retrieval pool regardless of `knowledgeMode`. */
  entryPoint: "NOTE_SCREEN" | "START_TASK";
  /** The task this frame belongs to. Stored on the frame row at
   *  creation; the server validates ownership. Leave undefined for a
   *  frame that is not about any particular task. */
  taskId?: string;
  /** Task code, for the header label only (e.g. "PAY-01"). */
  taskCode?: string | null;
  /** Optional seed text (e.g. "explain this note") — becomes the
   *  first user message only once the user sends it. */
  seedPrompt?: string;
}

type FrameSummary = {
  id: string;
  title: string;
  knowledgeMode: string;
  messageCount: number;
  /** Bound task id, null for a frame not about a task. */
  taskId: string | null;
  /** Task code (PAY-01), resolved from the task list. */
  taskCode?: string | null;
};

/**
 * AI chat frame.
 *
 * The isolation contract, visible in the UI:
 *  - A frame's history is only its own — `GET /api/ai/frames/:id`
 *    returns exactly the messages stored under that frame id.
 *  - The knowledge scope is a per-frame toggle that defaults to
 *    OFF. Nothing is injected from the screen the frame was
 *    opened from.
 *  - Starting a new frame discards the old id entirely, so no
 *    state leaks between frames.
 */
export function FrameChatDialog({
  userId,
  open,
  onClose,
  entryPoint,
  taskId,
  taskCode,
  seedPrompt,
}: FrameChatDialogProps) {
  const [frameId, setFrameId] = useState<string | null>(null);
  const [knowledgeMode, setKnowledgeMode] = useState<FrameKnowledgeMode>("NONE");
  const [messages, setMessages] = useState<FrameMessage[]>([]);
  const [input, setInput] = useState("");
  const [frameTitle, setFrameTitle] = useState("New chat");
  const [list, setList] = useState<FrameSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [deletingFrameId, setDeletingFrameId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Inline rename: the header title becomes a text input on click.
  // Editing is tracked separately from `frameTitle` so an in-progress
  // keystroke never round-trips to the server — only commit does that.
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingSeed, setPendingSeed] = useState<string | null>(null);
  const stream = useFrameChat();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // A dialog that is always mounted must not keep the last
  // frame's identity once it closes. `if (!open) return null`
  // only hides the UI — state survives, so reopening from a
  // different screen reused the old frameId and sent the new
  // scope into the old frame's history. Reset on close so a
  // fresh open starts with no frame and the default scope.
  useEffect(() => {
    if (open) return;
    setFrameId(null);
    setKnowledgeMode("NONE");
    setMessages([]);
    setFrameTitle(NEW_CHAT_TITLE);
    setPendingSeed(null);
    setShowHistory(false);
    setEditingTitle(false);
    setDraftTitle("");
    setDeleteError(null);
  }, [open]);

  // Lazily load the frame list once per open so the history
  // sidebar is fresh without a round-trip on every message.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/ai/frames")
      .then((r) => (r.ok ? r.json() : { frames: [] }))
      .then((j: { frames?: FrameSummary[] }) => {
        if (!cancelled) setList(j.frames ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  // A seed prompt waits for the first send — it never auto-sends,
  // because auto-sending would make the frame's first turn happen
  // without the user choosing a scope.
  useEffect(() => {
    setPendingSeed(seedPrompt ?? null);
  }, [seedPrompt]);

  useEffect(() => {
    if (!open) return;
    preloadTaskLinks();
  }, [open]);

  const thinking = stream.loading && !stream.text;
  const isStreaming = stream.loading || !!stream.text;

  // Commit the completed turn. `result` carries what the server
  // reported, so the escalation card only appears when retrieval
  // was genuinely on and found nothing.
  useEffect(() => {
    if (!stream.done) return;
    const finalText = stream.error
      ? `⚠️ ${stream.error.message} (${stream.error.kind})`
      : stream.text;

    // A turn that failed was this frame's ONLY turn when the frame
    // held no exchange before it — the server deleted that row rather
    // than keep an empty conversation. Undo the optimistic user bubble
    // and drop the id, so the transcript does not get re-attached to
    // whatever frame the next message mints. The error itself stays
    // on screen; only the orphaned question goes.
    const orphan = !!stream.error && !messages.some((m) => m.role === "assistant");

    if (finalText) {
      const text = finalText;
      setMessages((cur) => {
        const copy = orphan ? cur.slice(0, -1) : [...cur];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: text };
        else copy.push({ id: `m-${copy.length}`, role: "assistant", content: text });
        return copy;
      });
    }
    if (orphan) {
      setFrameId(null);
      setFrameTitle(NEW_CHAT_TITLE);
    } else if (stream.frameId && stream.frameId !== frameId) {
      setFrameId(stream.frameId);
    }
    stream.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.done]);

  async function ensureFrame(): Promise<string> {
    if (frameId) return frameId;
    const r = await fetch("/api/ai/frames", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryPoint, knowledgeMode, taskId }),
    });
    if (!r.ok) throw new Error(`Could not start a chat frame (HTTP ${r.status})`);
    const j = await r.json();
    const id: string = j.frame?.id;
    setFrameId(id);
    // The title comes from the frame row, not from a local guess:
    // the chat route names the frame after the first question.
    setFrameTitle(j.frame?.title ?? NEW_CHAT_TITLE);
    return id;
  }

  async function send() {
    const prompt = input.trim();
    if (!prompt || stream.loading) return;
    setInput("");
    setMessages((m) => [...m, { id: `u-${m.length}-${Date.now()}`, role: "user", content: prompt }]);
    // Shown immediately rather than after the round-trip; the server
    // persists this same string as the frame title, prefix included.
    setFrameTitle(titleFromPrompt(prompt, taskCode));
    await sendPrompt(prompt);
  }

  async function sendPrompt(prompt: string) {
    if (!prompt.trim() || stream.loading) return;
    let targetId = frameId;
    try {
      targetId = await ensureFrame();
    } catch {
      setMessages((m) => [
        ...m,
        { id: `err-${m.length}`, role: "assistant", content: "⚠️ Could not create a chat frame." },
      ]);
      return;
    }
    // The server persists the scope with the frame; the value sent
    // here is the scope the user picked for THIS frame.
    await stream.send({ frameId: targetId, prompt, knowledgeMode });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  async function openFrame(id: string) {
    setShowHistory(false);
    setFrameId(id);
    setMessages([]);
    setPendingSeed(null);
    // Drop the previous frame's scope the moment we adopt a new id.
    // The row fetch below replaces it, but it is async: a send landing
    // in between would otherwise carry the OLD frame's knowledgeMode
    // into the NEW frame, so a frame opened at "Tasks" would answer a
    // frame opened at "My notes" with the task index. Start from the
    // fail-closed default so a race can only under-serve, never
    // substitute the wrong corpus.
    setKnowledgeMode("NONE");
    setFrameTitle(NEW_CHAT_TITLE);
    const r = await fetch(`/api/ai/frames/${encodeURIComponent(id)}`);
    if (!r.ok) return;
    const j = await r.json();
    const row = j.frame as { title: string; knowledgeMode: FrameKnowledgeMode } | undefined;
    if (row) {
      setFrameTitle(row.title);
      setKnowledgeMode(KNOWLEDGE_MODES.includes(row.knowledgeMode) ? row.knowledgeMode : "NONE");
    }
    const msgs = (j.messages ?? []) as Array<{ role: string; content: string }>;
    setMessages(
      msgs.map((m, i) => ({
        id: `h-${i}`,
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
    );
  }

  /** New frame = fresh context. The old frame's rows stay in the
   *  DB (visible in history) but nothing is carried over. */
  function newFrame() {
    setFrameId(null);
    setMessages([]);
    setFrameTitle(NEW_CHAT_TITLE);
    setKnowledgeMode("NONE");
    setPendingSeed(null);
    setEditingTitle(false);
    setDraftTitle("");
    stream.reset();
    textareaRef.current?.focus();
  }

  /** Start renaming: seed the input with the question, not the
   *  tag. The `[PAY-01] ` prefix is derived from the bound task,
   *  which a rename cannot change — so it is re-applied on
   *  commit and the user never edits it. */
  function beginRename() {
    setDraftTitle(isUnnamedTitle ? "" : titleQuestion);
    setEditingTitle(true);
  }

  /**
   * Commit a rename. The row is patched only when the title actually
   * changed and is non-empty; an empty or unchanged draft just closes
   * the editor. The `frameId` check matters because a fresh frame has
   * no row yet — renaming it before the first message would be a
   * PATCH against nothing, and the server would 404.
   */
  async function commitRename() {
    const draft = draftTitle.trim();
    setEditingTitle(false);
    if (!draft) return;
    // Re-attach the derived prefix so the stored title stays in
    // the same shape the server writes. Without this, stripping
    // the tag for the editor and saving the bare question would
    // leave the sidebar unable to tell the frame's task at a
    // glance — and a next title would never be compared against
    // the same shape.
    const next = prefix ? prefix + draft : draft;
    if (next === frameTitle) return;
    setFrameTitle(next); // optimistic; corrected below on failure
    if (!frameId) return;
    const r = await fetch(`/api/ai/frames/${encodeURIComponent(frameId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!r.ok) {
      // Roll back to whatever the row still holds.
      setFrameTitle(frameTitle);
      return;
    }
    // Keep the history sidebar label in sync immediately — it is
    // loaded once per open, so a rename would otherwise only appear
    // after the next reopen.
    setList((cur) => cur.map((f) => (f.id === frameId ? { ...f, title: next } : f)));
  }

  async function deleteFrame(id: string) {
    if (stream.loading || deletingFrameId || !window.confirm("Delete this frame and all its messages? This cannot be undone.")) return;
    setDeletingFrameId(id);
    setDeleteError(null);
    try {
      const r = await fetch(`/api/ai/frames/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setList((cur) => cur.filter((f) => f.id !== id));
      if (frameId === id) newFrame();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete frame");
    } finally {
      setDeletingFrameId(null);
    }
  }

  async function changeScope(next: FrameKnowledgeMode) {
    setKnowledgeMode(next);
    if (!frameId) return;
    await fetch(`/api/ai/frames/${encodeURIComponent(frameId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ knowledgeMode: next }),
    }).catch(() => undefined);
  }

  const lastTurn: FrameTurnResult | null = stream.result;
  const noAnswer = !!lastTurn?.noAnswer;
  const scopeOn = grantsKnowledge(knowledgeMode);
  const scopeLabel = KNOWLEDGE_MODE_LABELS[knowledgeMode];
  // The stored title is prefixed with the task code ("[PAY-01] …").
  // It is split out here rather than left in the string so the header
  // and the rename editor can treat the tag as the label it is, and
  // so the input never contains a bracket the user did not type.
  const prefix = taskTitlePrefix(taskCode);
  const isUnnamedTitle = isUnnamed(frameTitle);
  const titleQuestion = isUnnamedTitle ? frameTitle : stripTitlePrefix(frameTitle).title;

  const history = showHistory ? (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border p-3">
        <Button size="sm" onClick={newFrame} className="w-full gap-1">
          <Plus className="h-3.5 w-3.5" /> New frame
        </Button>
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 scroll-thin"
      >
        {list.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No frames yet — send a message to start one.
          </p>
        )}
        {list.map((f) => (
          <div key={f.id} className={cn("flex items-center rounded-lg hover:bg-accent", f.id === frameId && "bg-accent")}>
            <button
              type="button"
              onClick={() => openFrame(f.id)}
              className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessageSquarePlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 leading-snug">{f.title}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {KNOWLEDGE_MODE_LABELS[f.knowledgeMode as FrameKnowledgeMode] ?? f.knowledgeMode} ·{" "}
                  {f.messageCount} {f.messageCount === 1 ? "message" : "messages"}
                </span>
              </span>
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Delete frame ${f.title}`}
              disabled={stream.loading || deletingFrameId !== null}
              onClick={() => void deleteFrame(f.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="AI chat frame">
      <button type="button" aria-label="Close chat" onClick={onClose} className="absolute inset-0 bg-black/40" />
      {/* Height must TRACK the margins, not sit on top of them.
          `h-full` here is 100% of the `inset-0` wrapper = 100dvh, so
          pairing it with `sm:m-4` pushed the panel 1rem down and sent
          its bottom 1rem off-screen — a gap at the top and a clipped
          composer. Subtracting the same 2rem keeps the box flush
          inside its own margins at every breakpoint, including `lg:`
          where only the left/right margins change. `dvh` (not `vh`)
          so the mobile URL bar doesn't eat the composer. */}
      <div className="relative z-10 flex h-[100dvh] w-full flex-col bg-background sm:m-4 sm:h-[calc(100dvh-2rem)] sm:rounded-lg sm:border sm:border-border sm:shadow-xl lg:ml-auto lg:mr-0 lg:w-[440px] lg:max-w-[45vw] lg:rounded-none lg:border-y-0 lg:border-r-0">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              {/* The bound task's code is a label, not part of the
                  name: it is rendered here and left out of the
                  rename input, so editing the title can never
                  detach the frame from the task it belongs to. */}
              <div className="flex min-w-0 items-center gap-1.5">
                {prefix && (
                  <Badge className="shrink-0 rounded px-1 py-0 font-mono text-[10px] font-semibold">
                    {taskCode}
                  </Badge>
                )}
                {editingTitle ? (
                  <input
                    autoFocus
                    value={draftTitle}
                    maxLength={MAX_TITLE_CHARS}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename();
                      } else if (e.key === "Escape") {
                        // Cancel: discard the draft, leave the stored
                        // title exactly as it was.
                        e.preventDefault();
                        setEditingTitle(false);
                        setDraftTitle("");
                      }
                    }}
                    aria-label="Frame title"
                    className="w-full min-w-0 rounded border border-primary bg-background px-1 py-0 text-sm font-semibold outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={beginRename}
                    title="Click to rename this chat"
                    className="block min-w-0 flex-1 truncate rounded px-1 py-0 text-left text-sm font-semibold hover:bg-accent"
                  >
                    {titleQuestion}
                  </button>
                )}
              </div>
              <div className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {taskCode
                  ? `Task ${taskCode} · this chat is about it`
                  : `Independent context · ${entryPoint === "NOTE_SCREEN" ? "opened from a note" : "opened from Start Task"}`}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="Frame history" onClick={() => setShowHistory((v) => !v)}>
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="New frame (fresh context)" onClick={newFrame}>
              <Plus className="h-4 w-4" />
            </Button>
            {frameId && (
              <Button size="icon" variant="ghost" aria-label="Delete this frame" disabled={stream.loading || deletingFrameId !== null} onClick={() => void deleteFrame(frameId)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {deleteError && <p role="alert" className="border-b border-border px-4 py-2 text-xs text-destructive">{deleteError}</p>}
        <div className="flex min-h-0 flex-1">
          {history}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Knowledge scope selector — the single control that
                decides what the frame may read. OFF by default. */}
            <div className="shrink-0 border-b border-border px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Knowledge scope">
                <span className="mr-0.5 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <DatabaseZap className="h-3 w-3" /> Knowledge
                </span>
                {KNOWLEDGE_MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => changeScope(m)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      m === knowledgeMode
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                    aria-pressed={m === knowledgeMode}
                  >
                    {KNOWLEDGE_MODE_LABELS[m]}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {scopeOn
                  ? `This frame may search: ${scopeLabel}.`
                  : "Off — this frame answers from the conversation only."}
              </p>
            </div>

            {/* Transcript */}
            <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
              <ChatTranscript
                items={messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
                streamingText={stream.text}
                thinking={thinking}
                className="space-y-4 p-4"
                bubbleMaxWidthClass="max-w-[88%]"
                emptyState={
                  <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <CircleHelp className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-semibold">A blank, independent context</h3>
                    <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
                      This frame sees only its own conversation{scopeOn ? ` and ${scopeLabel.toLowerCase()}` : ""}
                      {taskCode ? ` and the task you're working on (${taskCode})` : ""}.
                      {!taskCode && " It does not know which task, roadmap step, or screen you came from."}
                    </p>
                    {pendingSeed && (
                      <button
                        onClick={() => {
                          const seed = pendingSeed;
                          setPendingSeed(null);
                          void sendPrompt(seed);
                        }}
                        className="mt-4 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent"
                      >
                        {pendingSeed}
                      </button>
                    )}
                  </div>
                }
              />
            </div>

            {/* No-answer escalation — only when retrieval was on and
                genuinely found nothing. Offers the two honest paths
                instead of a confident hallucination. */}
            {noAnswer && !isStreaming && (
              <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
                <div className="flex items-start gap-2">
                  <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      No match in the material available to this frame.
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {stripNoAnswerMarker(messages[messages.length - 1]?.content ?? "") ||
                        "The model found nothing above the relevance threshold."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-[11px]"
                        onClick={() => changeScope("NOTES")}
                      >
                        <DatabaseZap className="h-3 w-3" /> Search my notes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-[11px]"
                        onClick={() => changeScope("INDEX_PLUS_ROADMAP")}
                      >
                        <DatabaseZap className="h-3 w-3" /> Search tasks + roadmap
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Grounding chips — what the answer was built from. */}
            {lastTurn && !stream.loading && (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border px-4 py-2">
                {scopeOn && lastTurn.retrieval.hits === 0 ? (
                  <span className="text-[10px] text-muted-foreground">
                    No matching material in your notes or roadmap.
                  </span>
                ) : scopeOn ? (
                  <>
                    <Badge className="rounded-md px-1.5 py-0 text-[10px] font-normal">
                      Grounded in {lastTurn.retrieval.hits} source{lastTurn.retrieval.hits === 1 ? "" : "s"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      top score {lastTurn.retrieval.topScore.toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    Conversation-only — no project material was consulted.
                  </span>
                )}
              </div>
            )}

            {/* Composer */}
            <div className="shrink-0 border-t border-border bg-card p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  rows={1}
                  placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  disabled={stream.loading}
                  className="min-h-[40px] resize-none px-3 py-2 text-sm"
                />
                <Button size="default" onClick={send} disabled={stream.loading || !input.trim()} className="h-10 px-4">
                  {stream.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span className="hidden sm:inline">Send</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
