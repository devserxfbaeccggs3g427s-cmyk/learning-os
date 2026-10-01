"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Input, Textarea } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { NoteEditor } from "./NoteEditor";
import { Save, BookOpen, Sparkles, Layers, ListChecks, FlaskConical, BrainCircuit, Microscope, ShieldAlert, MessageCircleQuestion, ArrowLeft, Plus, MessageSquare } from "lucide-react";
import { useConversationList, type ConversationMessage } from "@/lib/ai/useConversationList";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

// Lazy-load heavy panels — they ship with their own AI/fetch deps and
// most users only visit one tab per task. The skeleton matches their
// outer container so the layout doesn't shift on tab switch.
const AITutor = dynamic(() => import("./AITutor").then((m) => m.AITutor), {
  ssr: false,
  loading: () => <PanelSkeleton label="AI tutor" />,
});
const FlashcardPanel = dynamic(() => import("./FlashcardPanel").then((m) => m.FlashcardPanel), {
  loading: () => <PanelSkeleton label="Flashcards" />,
});
const QuizPanel = dynamic(() => import("./QuizPanel").then((m) => m.QuizPanel), {
  loading: () => <PanelSkeleton label="Quiz" />,
});

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex animate-pulse items-center gap-2 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        Loading {label}…
      </div>
    </div>
  );
}

interface TaskWorkspaceProps {
  userId: string;
  task: {
    id: string;
    code: string | null;
    title: string;
    description: string | null;
    relatedProject: string | null;
    whyThisMatters: string | null;
    failureScenarios: unknown[] | null;
    interviewQuestions: string[] | null;
    handsOnLab: string | null;
    definitionOfDone: string | null;
    status: string;
    priority: string;
    difficulty: string;
    estimatedMinutes: number;
    masteryScore: number;
  };
  track: { title: string } | null;
  module: { title: string } | null;
  dependencies: Array<{ id: string; dependsOnTaskId: string; title: string; code: string | null }>;
  initialNote: string;
  noteRevision: number;
  decks: Array<{ id: string; title: string; cardCount: number; difficulty: string; focus: string; generatedBy: string | null }>;
  quizzes: Array<{ id: string; title: string; questionCount: number; difficulty: string; focus: string; generatedBy: string | null }>;
}

const STATUS_TONE: Record<string, string> = {
  BACKLOG: "bg-muted text-muted-foreground",
  SCHEDULED: "bg-blue-500/10 text-blue-600",
  IN_PROGRESS: "bg-amber-500/10 text-amber-600",
  LEARNED: "bg-emerald-500/10 text-emerald-600",
  NEEDS_REVIEW: "bg-rose-500/10 text-rose-600",
  MASTERED: "bg-emerald-700/10 text-emerald-700",
  BLOCKED: "bg-red-500/10 text-red-600",
};

export function TaskWorkspace(props: TaskWorkspaceProps) {
  const t = props.task;
  const [tab, setTab] = useState("overview");
  const [showMobileTabs, setShowMobileTabs] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
      <Link
        href="/roadmap"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to roadmap
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {props.track && <span>{props.track.title}</span>}
            {props.module && <span>› {props.module.title}</span>}
            {t.code && <span className="font-mono">· {t.code}</span>}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          {t.description && (
            <p className="max-w-2xl text-sm text-muted-foreground">{t.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("uppercase", STATUS_TONE[t.status] ?? "")}>{t.status}</Badge>
          <Badge>P{t.priority[1]}</Badge>
          <Badge>{t.difficulty}</Badge>
          <Badge>{t.estimatedMinutes}m est.</Badge>
          {t.masteryScore > 0 && <Badge>Mastery {Math.round(t.masteryScore * 100)}%</Badge>}
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview"><BookOpen className="mr-1 h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="notes"><Layers className="mr-1 h-3.5 w-3.5" />Notes</TabsTrigger>
          <TabsTrigger value="ai"><Sparkles className="mr-1 h-3 w-3" />AI Tutor</TabsTrigger>
          <TabsTrigger value="flashcards"><BrainCircuit className="mr-1 h-3.5 w-3.5" />Flashcards</TabsTrigger>
          <TabsTrigger value="quiz"><ListChecks className="mr-1 h-3.5 w-3.5" />Quiz</TabsTrigger>
          <TabsTrigger value="lab"><FlaskConical className="mr-1 h-3.5 w-3.5" />Lab</TabsTrigger>
          <TabsTrigger value="interview"><MessageCircleQuestion className="mr-1 h-3.5 w-3.5" />Interview</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Why this matters</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6">
                {t.whyThisMatters ? <MarkdownRenderer source={t.whyThisMatters} /> : <p className="italic text-muted-foreground">Not documented.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Failure scenarios</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6">
                {t.failureScenarios ? (
                  <MarkdownRenderer source={renderJson(t.failureScenarios)} />
                ) : (
                  <p className="italic text-muted-foreground">Not documented.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Dependencies</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {props.dependencies.length === 0 && <p className="italic text-muted-foreground">None.</p>}
                {props.dependencies.map((d) => (
                  <Link
                    key={d.id}
                    href={`/tasks/${d.dependsOnTaskId}`}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 hover:bg-accent"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{d.code ?? ""}</span>
                    <span>{d.title}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Definition of done</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6">
                {t.definitionOfDone ? <MarkdownRenderer source={t.definitionOfDone} /> : <p className="italic text-muted-foreground">Not documented.</p>}
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Interview questions</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6">
                {t.interviewQuestions ? <MarkdownRenderer source={renderJson(t.interviewQuestions)} /> : <p className="italic text-muted-foreground">Not documented.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <NoteEditor
            userId={props.userId}
            taskId={t.id}
            initialContent={props.initialNote}
            initialRevision={props.noteRevision}
          />
        </TabsContent>

        <TabsContent value="ai">
          <AITutor userId={props.userId} taskId={t.id} taskTitle={t.title} note={props.initialNote} />
        </TabsContent>

        <TabsContent value="flashcards">
          <FlashcardPanel userId={props.userId} taskId={t.id} initialDecks={props.decks} />
        </TabsContent>

        <TabsContent value="quiz">
          <QuizPanel userId={props.userId} taskId={t.id} initialQuizzes={props.quizzes} />
        </TabsContent>

        <TabsContent value="lab">
          <Card>
            <CardHeader><CardTitle>Hands-on lab</CardTitle></CardHeader>
            <CardContent className="text-sm leading-6">
              {t.handsOnLab ? <MarkdownRenderer source={t.handsOnLab} reading /> : <p className="italic text-muted-foreground">No lab defined.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interview">
          <InterviewMode userId={props.userId} taskId={t.id} taskTitle={t.title} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function renderJson(value: unknown): string {
  let arr: unknown = value;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr) as unknown;
    } catch {
      return value as string;
    }
  }
  if (Array.isArray(arr)) {
    return arr
      .map((x) => (typeof x === "string" ? `- ${x}` : `- **${(x as { title?: string }).title ?? ""}** — ${(x as { body?: string }).body ?? ""}`))
      .join("\n");
  }
  return String(arr ?? "");
}

function InterviewMode({ userId, taskId, taskTitle }: { userId: string; taskId: string; taskTitle: string }) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: "assistant", content: "Hi — I'm your interviewer for this task. Ready when you are. Tell me, at a high level, what does this task cover?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { list, refresh } = useConversationList({ userId, mode: "INTERVIEW", taskId });
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distFromBottom < 80;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loadingHistory]);
  const sendIt = async () => {
    if (!input.trim()) return;
    const userMsg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    const r = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        taskId,
        mode: "INTERVIEW",
        prompt: input,
        conversationId,
      }),
    });
    if (!r.body) {
      setLoading(false);
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
    let newConvId = conversationId;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      const lines = chunk.split("\n\n");
      for (const l of lines) {
        const m = l.match(/^data: (.*)$/);
        if (!m) continue;
        try {
          const obj = JSON.parse(m[1]!);
          if (obj.type === "delta" && typeof obj.text === "string") {
            acc += obj.text;
            setMessages((cur) => {
              const copy = [...cur];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant-stream") {
                copy[copy.length - 1] = { role: "assistant-stream", content: acc };
              } else {
                copy.push({ role: "assistant-stream", content: acc });
              }
              return copy;
            });
          } else if (obj.type === "done") {
            if (obj.conversationId) newConvId = obj.conversationId;
          } else if (obj.type === "error") {
            const msg = `⚠️ ${obj.message ?? "AI request failed"}${obj.kind ? ` (${obj.kind})` : ""}`;
            acc = msg;
            setMessages((cur) => {
              const copy = [...cur];
              const last = copy[copy.length - 1];
              if (last && (last.role === "assistant-stream" || last.role === "assistant")) {
                copy[copy.length - 1] = { role: "assistant", content: msg };
              } else {
                copy.push({ role: "assistant", content: msg });
              }
              return copy;
            });
          }
        } catch {}
      }
    }
    if (newConvId && newConvId !== conversationId) {
      setConversationId(newConvId);
      refresh();
    }
    setLoading(false);
  };

  async function openConversation(id: string) {
    setLoadingHistory(true);
    setConversationId(id);
    setMessages([]);
    try {
      const q = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const r = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}${q}`);
      if (!r.ok) return;
      const j = await r.json();
      const msgs = (j.messages ?? []).map((m: ConversationMessage) => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
      }));
      setMessages(msgs);
    } finally {
      setLoadingHistory(false);
    }
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([
      { role: "assistant", content: "Hi — I'm your interviewer for this task. Ready when you are. Tell me, at a high level, what does this task cover?" },
    ]);
    setInput("");
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
      {/* History sidebar */}
      <Card className="flex h-[60vh] min-h-0 flex-col overflow-hidden lg:h-[calc(100vh-200px)]">
        <CardHeader className="shrink-0 p-3">
          <Button size="sm" onClick={startNewChat} className="w-full">
            <Plus className="h-4 w-4" /> New interview
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 scroll-thin">
          {list.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No saved interviews for this task yet.
            </p>
          )}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent",
                c.id === conversationId && "bg-accent",
              )}
            >
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2 flex-1 leading-snug">{c.title}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="flex h-[60vh] min-h-0 flex-col overflow-hidden lg:h-[calc(100vh-200px)]">
        <CardHeader className="shrink-0">
          <CardTitle>Interview · {taskTitle}</CardTitle>
          <p className="text-xs text-muted-foreground">I ask one question at a time. Be specific. I'll evaluate, then dig deeper.</p>
        </CardHeader>
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-3 scroll-thin"
        >
          {loadingHistory && (
            <p className="text-xs text-muted-foreground">Loading interview…</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm leading-6",
                m.role === "user" || m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-card border border-border",
              )}
            >
              {m.content}
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex gap-2">
            <Input
              placeholder="Your answer…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendIt();
                }
              }}
              disabled={loading}
            />
            <Button onClick={sendIt} disabled={loading || !input.trim()}>Send</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}