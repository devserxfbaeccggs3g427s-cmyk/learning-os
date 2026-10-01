"use client";
import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Input, Textarea } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { AITutor } from "./AITutor";
import { FlashcardPanel } from "./FlashcardPanel";
import { QuizPanel } from "./QuizPanel";
import { NoteEditor } from "./NoteEditor";
import { Save, BookOpen, Sparkles, Layers, ListChecks, FlaskConical, BrainCircuit, Microscope, ShieldAlert, MessageCircleQuestion, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

interface TaskWorkspaceProps {
  userId: string;
  task: {
    id: string;
    code: string | null;
    title: string;
    description: string | null;
    relatedProject: string | null;
    whyThisMatters: string | null;
    failureScenarios: string | null;
    interviewQuestions: string | null;
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

function renderJson(s: string): string {
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      return arr.map((x) => (typeof x === "string" ? `- ${x}` : `- **${x.title ?? ""}** — ${x.body ?? ""}`)).join("\n");
    }
  } catch {
    /* fall through */
  }
  return s;
}

function InterviewMode({ userId, taskId, taskTitle }: { userId: string; taskId: string; taskTitle: string }) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: "assistant", content: "Hi — I'm your interviewer for this task. Ready when you are. Tell me, at a high level, what does this task cover?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
      }),
    });
    if (!r.body) {
      setLoading(false);
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
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
          }
        } catch {}
      }
    }
    setMessages((cur) => {
      const copy = [...cur];
      const idx = copy.findIndex((m) => m.role === "assistant-stream");
      if (idx >= 0) copy[idx] = { role: "assistant", content: acc };
      return copy;
    });
    setLoading(false);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Interview · {taskTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">I ask one question at a time. Be specific. I'll evaluate, then dig deeper.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-3 scroll-thin">
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
          />
          <Button onClick={sendIt} disabled={loading || !input.trim()}>Send</Button>
        </div>
      </CardContent>
    </Card>
  );
}