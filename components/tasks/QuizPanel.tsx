"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import { ListChecks, Plus, Loader2, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface QuizPanelProps {
  userId: string;
  taskId: string;
  initialQuizzes: Array<{ id: string; title: string; questionCount: number; difficulty: string; focus: string; generatedBy: string | null }>;
}

interface QuizQuestion {
  id: string;
  questionType: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctAnswer: string[]; // ids
  explanation: string;
}

export function QuizPanel({ userId, taskId, initialQuizzes }: QuizPanelProps) {
  const [quizzes, setQuizzes] = useState(initialQuizzes);
  const [busy, setBusy] = useState(false);
  const [openQuiz, setOpenQuiz] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    const r = await fetch("/api/ai/generate-quiz", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        taskId,
        title: "Generated " + new Date().toISOString().slice(0, 16),
        count: 10,
        difficulty: "MIXED",
        focus: "MIXED",
        source: "NOTE_ONLY",
      }),
    });
    setBusy(false);
    if (r.ok) {
      const fresh = await fetch(`/api/tasks/${taskId}/quizzes`, { cache: "no-store" });
      if (fresh.ok) {
        const d = await fresh.json();
        setQuizzes(d.quizzes ?? []);
      }
    } else {
      const err = await r.json().catch(() => ({ error: "Unknown error" }));
      alert(`Generation failed: ${err.error ?? "Unknown error"}`);
    }
  }

  if (openQuiz) {
    return <QuizRunner quizId={openQuiz} onBack={() => setOpenQuiz(null)} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Generate quiz</CardTitle>
          <Button onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            New quiz
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Quizzes are independent. Generating a new one does NOT replace previous quizzes.
          Source: task notes. Difficulty: mixed. Focus: mixed. Questions: 10.
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quizzes.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm italic text-muted-foreground">
              No quizzes yet. Generate one to start practicing.
            </CardContent>
          </Card>
        )}
        {quizzes.map((q) => (
          <Card key={q.id} className="cursor-pointer hover:border-primary/40" onClick={() => setOpenQuiz(q.id)}>
            <CardHeader>
              <CardTitle className="text-base">{q.title}</CardTitle>
              <div className="flex flex-wrap gap-1">
                <Badge>{q.questionCount} questions</Badge>
                <Badge>{q.difficulty}</Badge>
                <Badge>{q.focus}</Badge>
              </div>
              {q.generatedBy && (
                <p className="text-[10px] text-muted-foreground">by {q.generatedBy}</p>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

function QuizRunner({ quizId, onBack }: { quizId: string; onBack: () => void }) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  if (!questions) {
    fetch(`/api/quizzes/${quizId}/questions`)
      .then((r) => r.json())
      .then((j) => setQuestions(j.questions ?? []));
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm italic text-muted-foreground">Quiz is empty.</CardContent>
      </Card>
    );
  }

  async function startAttempt() {
    const r = await fetch(`/api/quizzes/${quizId}/attempts`, { method: "POST" });
    if (r.ok) {
      const j = await r.json();
      setAttemptId(j.attemptId);
    }
  }
  if (!attemptId && !submitted) startAttempt();

  const q = questions[index]!;
  const correctIds = new Set(q.correctAnswer);

  async function submit() {
    const r = await fetch(`/api/quizzes/${quizId}/attempts/${attemptId}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: q.id, answer: picked }),
    });
    if (r.ok) {
      setSubmitted(true);
    }
  }

  function next() {
    if (index === questions!.length - 1) {
      fetch(`/api/quizzes/${quizId}/attempts/${attemptId}/submit`, { method: "POST" });
      alert("Submitted! See results in the Quiz History.");
      onBack();
      return;
    }
    setIndex(index + 1);
    setPicked([]);
    setSubmitted(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Question {index + 1} / {questions.length}</CardTitle>
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="h-3 w-3" /> Back</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium leading-6">{q.prompt}</p>
        <div className="space-y-2">
          {q.options.map((o) => {
            const selected = picked.includes(o.id);
            const isCorrect = correctIds.has(o.id);
            const showCorrect = submitted && isCorrect;
            const showWrong = submitted && selected && !isCorrect;
            return (
              <button
                key={o.id}
                disabled={submitted}
                onClick={() =>
                  setPicked(q.questionType === "MULTIPLE_CHOICE"
                    ? selected ? picked.filter((x) => x !== o.id) : [...picked, o.id]
                    : [o.id])
                }
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                  showCorrect && "border-emerald-500 bg-emerald-500/10",
                  showWrong && "border-red-500 bg-red-500/10",
                )}
              >
                <span>{o.text}</span>
                {showCorrect && <Check className="h-4 w-4 text-emerald-600" />}
                {showWrong && <X className="h-4 w-4 text-red-600" />}
              </button>
            );
          })}
        </div>
        {submitted && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6">
            <strong>Explanation: </strong>
            {q.explanation}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {!submitted && (
            <Button onClick={submit} disabled={picked.length === 0}>
              Submit
            </Button>
          )}
          {submitted && (
            <Button onClick={next}>
              {index === questions.length - 1 ? "Finish" : "Next"} <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}