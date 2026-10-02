"use client";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import { ListChecks, Plus, Loader2, ChevronLeft, ChevronRight, Check, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface QuizPanelProps {
  userId: string;
  taskId: string;
  initialQuizzes: Array<{ id: string; title: string; questionCount: number; difficulty: string; focus: string; generatedBy: string | null }>;
}

interface QuizQuestion {
  id: string;
  questionType: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | string;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [lastIsCorrect, setLastIsCorrect] = useState<boolean | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const attemptInitRef = useRef(false);

  // Load questions once on mount / when quizId changes.
  useEffect(() => {
    let cancelled = false;
    setQuestions(null);
    setLoadError(null);
    setIndex(0);
    setPicked([]);
    setTextAnswer("");
    setSubmitted(false);
    setLastIsCorrect(null);
    setAttemptId(null);
    attemptInitRef.current = false;
    fetch(`/api/quizzes/${quizId}/questions`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (cancelled) return;
        const qs = Array.isArray(j.questions) ? j.questions : [];
        setQuestions(qs);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load questions");
      });
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  // Start an attempt once per question transition. Run after questions load.
  useEffect(() => {
    if (!questions || attemptInitRef.current) return;
    if (submitted || attemptId) return;
    attemptInitRef.current = true;
    let cancelled = false;
    fetch(`/api/quizzes/${quizId}/attempts`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!cancelled && j.attemptId) setAttemptId(j.attemptId);
      })
      .catch(() => {
        // Allow retry on next question if attempt creation failed.
        attemptInitRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [questions, attemptId, submitted, quizId]);

  if (loadError) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-destructive">Couldn't load quiz</CardTitle>
          <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="h-3 w-3" /> Back</Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{loadError}</CardContent>
      </Card>
    );
  }

  if (!questions) {
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Empty quiz</CardTitle>
          <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="h-3 w-3" /> Back</Button>
        </CardHeader>
        <CardContent className="text-sm italic text-muted-foreground">This quiz has no questions. Generate a new one.</CardContent>
      </Card>
    );
  }

  const q = questions[index]!;
  const isShortAnswer = q.questionType === "SHORT_ANSWER";
  const hasOptions = !isShortAnswer && Array.isArray(q.options) && q.options.length > 0;
  const correctIds = new Set(q.correctAnswer ?? []);
  const isMalformed = !isShortAnswer && !hasOptions;

  const canSubmit = (() => {
    if (submitted || submitting) return false;
    if (isShortAnswer) return textAnswer.trim().length > 0;
    return picked.length > 0;
  })();

  async function submit() {
    if (!attemptId || !q) return;
    setSubmitting(true);
    try {
      const body = isShortAnswer
        ? { questionId: q.id, answerText: textAnswer }
        : { questionId: q.id, answer: picked };
      const r = await fetch(`/api/quizzes/${quizId}/attempts/${attemptId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const j = await r.json();
        setLastIsCorrect(typeof j.isCorrect === "boolean" ? j.isCorrect : null);
        setSubmitted(true);
      } else {
        const err = await r.json().catch(() => ({}));
        alert(`Submit failed: ${err.error ?? r.status}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function next() {
    if (!attemptId || !questions) return;
    if (index === questions.length - 1) {
      await fetch(`/api/quizzes/${quizId}/attempts/${attemptId}/submit`, { method: "POST" });
      alert("Submitted! See results in the Quiz History.");
      onBack();
      return;
    }
    setIndex(index + 1);
    setPicked([]);
    setTextAnswer("");
    setSubmitted(false);
    setLastIsCorrect(null);
    attemptInitRef.current = false;
  }

  function togglePick(id: string) {
    if (submitted) return;
    if (q.questionType === "MULTIPLE_CHOICE") {
      setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      return;
    }
    // SINGLE_CHOICE / TRUE_FALSE: single pick.
    setPicked([id]);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Question {index + 1} / {questions.length}
          {q.questionType && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">{q.questionType.replace("_", " ")}</span>
          )}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="h-3 w-3" /> Back</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium leading-6">{q.prompt}</p>

        {isMalformed && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This question came back without answer options. Skip it or generate a new quiz.
            </span>
          </div>
        )}

        {isShortAnswer ? (
          <div className="space-y-2">
            <textarea
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              disabled={submitted}
              placeholder="Type your answer…"
              rows={3}
              className="w-full resize-none border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {submitted && (
              <p className={cn("text-xs", lastIsCorrect === true ? "text-emerald-600" : lastIsCorrect === false ? "text-red-600" : "text-muted-foreground")}>
                {lastIsCorrect === true
                  ? "✓ Marked free-form — review the explanation below."
                  : lastIsCorrect === false
                    ? "✗ Marked free-form — review the explanation below."
                    : "Free-form answer recorded."}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {hasOptions &&
              q.options.map((o) => {
                const selected = picked.includes(o.id);
                const isCorrect = correctIds.has(o.id);
                const showCorrect = submitted && isCorrect;
                const showWrong = submitted && selected && !isCorrect;
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={submitted}
                    onClick={() => togglePick(o.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                      showCorrect && "border-emerald-500 bg-emerald-500/10",
                      showWrong && "border-red-500 bg-red-500/10",
                      !o.text?.trim() && "italic text-muted-foreground",
                    )}
                  >
                    <span>{o.text?.trim() || "(empty option)"}</span>
                    {showCorrect && <Check className="h-4 w-4 text-emerald-600" />}
                    {showWrong && <X className="h-4 w-4 text-red-600" />}
                  </button>
                );
              })}
          </div>
        )}

        {submitted && q.explanation && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6">
            <strong>Explanation: </strong>
            {q.explanation}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {!submitted && (
            <Button onClick={submit} disabled={!canSubmit || isMalformed}>
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
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