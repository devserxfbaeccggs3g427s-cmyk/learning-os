import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flashcards } from "@/lib/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cards = await db
    .select()
    .from(flashcards)
    .where(eq(flashcards.deckId, id))
    .orderBy(asc(flashcards.orderIndex));
  return NextResponse.json({
    cards: cards.map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      explanation: c.explanation,
      difficulty: c.difficulty,
      tags: Array.isArray(c.tags) ? c.tags : [],
    })),
  });
}