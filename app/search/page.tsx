import Link from "next/link";
import { eq, like, or, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks, taskNotes, blockNotes, studyBlocks, schedules, flashcardDecks, quizzes, aiConversations } from "@/lib/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { Search as SearchIcon, ListTree, BookOpen, ListChecks, BrainCircuit, MessageCircleQuestion } from "lucide-react";

export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  if (!query) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl p-4 lg:p-8 space-y-4">
          <header>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <SearchIcon className="h-6 w-6 text-primary" /> Search
            </h1>
            <p className="text-sm text-muted-foreground">Use <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">?</kbd> + <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">/</kbd> as the search prefix.</p>
          </header>
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Type a query in the address: <code>?q=...</code> or use the input on this page.
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  // search tasks
  const taskResults = await db
    .select()
    .from(tasks)
    .where(or(like(tasks.title, `%${query}%`), like(tasks.code, `%${query}%`), like(tasks.description, `%${query}%`)))
    .limit(20);

  // Notes come from two tables: block notes (the primary store — written
  // during a study session on a specific day) and the older task-level note.
  // Searching only task_notes would miss everything the user has written
  // since notes moved onto blocks.
  const [noteResults, blockNoteResults] = await Promise.all([
    db.select().from(taskNotes).where(like(taskNotes.content, `%${query}%`)).limit(10),
    db
      .select({
        id: blockNotes.id,
        content: blockNotes.content,
        date: schedules.date,
        taskId: studyBlocks.taskId,
        blockTitle: studyBlocks.title,
      })
      .from(blockNotes)
      .innerJoin(studyBlocks, eq(studyBlocks.id, blockNotes.blockId))
      .innerJoin(schedules, eq(schedules.id, studyBlocks.scheduleId))
      .where(like(blockNotes.content, `%${query}%`))
      .limit(10),
  ]);
  const deckResults = await db.select().from(flashcardDecks).where(like(flashcardDecks.title, `%${query}%`)).limit(10);
  const quizResults = await db.select().from(quizzes).where(like(quizzes.title, `%${query}%`)).limit(10);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <SearchIcon className="h-6 w-6 text-primary" /> Search
          </h1>
          <p className="text-sm text-muted-foreground">Results for "{query}"</p>
        </header>

        <SearchInput initialQuery={query} />

        <ResultGroup title="Tasks" icon={<ListTree className="h-4 w-4" />} empty="No tasks.">
          {taskResults.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-3 rounded-md border border-border bg-card p-3 hover:bg-accent">
              <span className="font-mono text-xs text-muted-foreground">{t.code ?? ""}</span>
              <span className="flex-1 text-sm">{t.title}</span>
              <Badge>{t.status}</Badge>
            </Link>
          ))}
        </ResultGroup>

        <ResultGroup title="Notes" icon={<BookOpen className="h-4 w-4" />} empty="No notes.">
          {blockNoteResults.map((n) => (
            <Link
              key={n.id}
              href={n.taskId ? `/tasks/${n.taskId}` : "/calendar"}
              className="block rounded-md border border-border bg-card p-3 text-sm hover:bg-accent"
            >
              <span className="font-mono text-[10px] text-muted-foreground">
                {n.date} · {n.blockTitle}
              </span>
              <span className="line-clamp-2 mt-0.5 whitespace-pre-wrap text-muted-foreground">{n.content.slice(0, 200)}…</span>
              <span className="mt-1 inline-block text-xs text-primary">
                {n.taskId ? "Open task →" : "Open calendar →"}
              </span>
            </Link>
          ))}
          {noteResults.map((n) => (
            <Link key={n.id} href={`/tasks/${n.taskId}`} className="block rounded-md border border-border bg-card p-3 text-sm hover:bg-accent">
              <span className="text-[10px] text-muted-foreground">task note</span>
              <span className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">{n.content.slice(0, 200)}…</span>
              <span className="mt-1 inline-block text-xs text-primary">Open task →</span>
            </Link>
          ))}
        </ResultGroup>

        <ResultGroup title="Flashcard decks" icon={<BrainCircuit className="h-4 w-4" />} empty="No decks.">
          {deckResults.map((d) => (
            <Link key={d.id} href={`/tasks/${d.taskId}`} className="flex items-center gap-3 rounded-md border border-border bg-card p-3 hover:bg-accent">
              <span className="flex-1 text-sm">{d.title}</span>
              <Badge>{d.cardCount} cards</Badge>
            </Link>
          ))}
        </ResultGroup>

        <ResultGroup title="Quizzes" icon={<ListChecks className="h-4 w-4" />} empty="No quizzes.">
          {quizResults.map((q) => (
            <Link key={q.id} href={`/tasks/${q.taskId}`} className="flex items-center gap-3 rounded-md border border-border bg-card p-3 hover:bg-accent">
              <span className="flex-1 text-sm">{q.title}</span>
              <Badge>{q.questionCount} Q</Badge>
            </Link>
          ))}
        </ResultGroup>
      </div>
    </AppShell>
  );
}

function SearchInput({ initialQuery }: { initialQuery: string }) {
  return (
    <form method="get">
      <input
        name="q"
        defaultValue={initialQuery}
        placeholder="Search tasks, notes, decks, quizzes…"
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
        autoFocus
      />
    </form>
  );
}

function ResultGroup({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const count = Array.isArray(children) ? children.length : (children ? 1 : 0);
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title} <Badge>{count}</Badge>
      </h2>
      <div className="space-y-2">
        {count === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-xs italic text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}