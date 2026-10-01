import Link from "next/link";
import { eq, and, lte, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flashcards, flashcardDecks, reviewHistory, tasks } from "@/lib/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { getDefaultUser } from "@/lib/ai/service";
import { BrainCircuit } from "lucide-react";

export default async function ReviewPage() {
  const user = await getDefaultUser();
  const allCards = await db.select().from(flashcards).limit(1000);
  const now = new Date().toISOString();
  const due = allCards.filter((c) => c.dueAt !== null && c.dueAt <= now);
  const learning = allCards.filter((c) => c.repetitions > 0 && c.repetitions < 3);
  const newCards = allCards.filter((c) => c.repetitions === 0);
  const mastered = allCards.filter((c) => c.repetitions >= 3);

  // get decks for task links
  const decks = await db.select().from(flashcardDecks);
  const taskRows = await db.select().from(tasks);
  const taskById = new Map(taskRows.map((t) => [t.id, t]));

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BrainCircuit className="h-6 w-6 text-primary" /> Review
          </h1>
          <p className="text-sm text-muted-foreground">Spaced repetition across all decks.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Due now" value={due.length} tone="amber" />
          <StatCard label="New" value={newCards.length} tone="muted" />
          <StatCard label="Learning" value={learning.length} tone="blue" />
          <StatCard label="Mastered" value={mastered.length} tone="emerald" />
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Decks</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {decks.length === 0 && (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  No decks yet. Open a task and generate flashcards.
                </CardContent>
              </Card>
            )}
            {decks.map((d) => {
              const t = taskById.get(d.taskId);
              return (
                <Card key={d.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{d.title}</CardTitle>
                    {t && (
                      <Link href={`/tasks/${t.id}`} className="text-xs text-muted-foreground hover:underline">
                        {t.code ?? ""} · {t.title}
                      </Link>
                    )}
                    <div className="flex gap-1 pt-1">
                      <Badge>{d.cardCount} cards</Badge>
                      <Badge>{d.difficulty}</Badge>
                      <Badge>{d.focus}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/tasks/${d.taskId}`}>Open task →</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "amber" | "blue" | "emerald" | "muted" }) {
  const toneClass = {
    amber: "text-amber-600 bg-amber-500/10",
    blue: "text-blue-600 bg-blue-500/10",
    emerald: "text-emerald-600 bg-emerald-500/10",
    muted: "text-muted-foreground bg-muted/30",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-2 flex items-end justify-between">
          <div className="text-3xl font-bold">{value}</div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${toneClass}`}>{tone}</span>
        </div>
      </CardContent>
    </Card>
  );
}