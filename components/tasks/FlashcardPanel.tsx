"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Badge } from "@/components/ui";
import { BrainCircuit, Plus, Loader2, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

interface FlashcardPanelProps {
  userId: string;
  taskId: string;
  initialDecks: Array<{ id: string; title: string; cardCount: number; difficulty: string; focus: string; generatedBy: string | null }>;
}

export function FlashcardPanel({ userId, taskId, initialDecks }: FlashcardPanelProps) {
  const [decks, setDecks] = useState(initialDecks);
  const [busy, setBusy] = useState(false);
  const [openDeck, setOpenDeck] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    const r = await fetch("/api/ai/generate-flashcards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        taskId,
        title: "Generated " + new Date().toISOString().slice(0, 16),
        count: 10,
        difficulty: "MEDIUM",
        focus: "MIXED",
        source: "NOTES_ONLY",
      }),
    });
    setBusy(false);
    if (r.ok) {
      const j = await r.json();
      const fresh = await fetch(`/api/tasks/${taskId}/flashcards`, { cache: "no-store" });
      if (fresh.ok) {
        const d = await fresh.json();
        setDecks(d.decks ?? []);
      }
      return j;
    }
    const err = await r.json().catch(() => ({ error: "Unknown error" }));
    alert(`Generation failed: ${err.error ?? "Unknown error"}`);
  }

  if (openDeck) {
    return <DeckReview deckId={openDeck} onBack={() => setOpenDeck(null)} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Generate flashcards</CardTitle>
          <Button onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            New deck
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Decks are independent. Generating a new deck does NOT replace existing decks.
          Source: task notes. Difficulty: medium. Focus: mixed. Cards: 10.
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {decks.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm italic text-muted-foreground">
              No decks yet. Generate one to start reviewing.
            </CardContent>
          </Card>
        )}
        {decks.map((d) => (
          <Card key={d.id} className="cursor-pointer hover:border-primary/40" onClick={() => setOpenDeck(d.id)}>
            <CardHeader>
              <CardTitle className="text-base">{d.title}</CardTitle>
              <div className="flex flex-wrap gap-1">
                <Badge>{d.cardCount} cards</Badge>
                <Badge>{d.difficulty}</Badge>
                <Badge>{d.focus}</Badge>
              </div>
              {d.generatedBy && (
                <p className="text-[10px] text-muted-foreground">by {d.generatedBy}</p>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DeckReview({ deckId, onBack }: { deckId: string; onBack: () => void }) {
  const [cards, setCards] = useState<Array<{ id: string; front: string; back: string }> | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (!cards) {
    fetch(`/api/decks/${deckId}/cards`)
      .then((r) => r.json())
      .then((j) => setCards(j.cards ?? []));
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" /> Loading cards…
        </CardContent>
      </Card>
    );
  }
  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm italic text-muted-foreground">
          Deck is empty.
        </CardContent>
      </Card>
    );
  }
  const card = cards[index]!;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Reviewing deck</CardTitle>
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="h-3 w-3" /> Back</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-center text-xs text-muted-foreground">
          Card {index + 1} / {cards.length}
        </div>
        <div
          className="mx-auto flex min-h-[200px] max-w-2xl items-center justify-center rounded-lg border border-border bg-muted/20 p-6 text-center text-lg font-medium"
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? card.back : card.front}
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => { setRevealed(true); }}>Reveal</Button>
        </div>
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              setIndex(Math.max(0, index - 1));
              setRevealed(false);
            }}
            disabled={index === 0}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button
            onClick={() => {
              fetch(`/api/decks/${deckId}/cards/${card.id}/review`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ rating: "GOOD" }),
              });
              setIndex(Math.min(cards.length - 1, index + 1));
              setRevealed(false);
            }}
            disabled={!revealed || index === cards.length - 1}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}