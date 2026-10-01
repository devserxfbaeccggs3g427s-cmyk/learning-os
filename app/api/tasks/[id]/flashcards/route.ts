import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flashcardDecks } from "@/lib/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decks = await db
    .select()
    .from(flashcardDecks)
    .where(eq(flashcardDecks.taskId, id))
    .orderBy(desc(flashcardDecks.createdAt));
  return NextResponse.json({
    decks: decks.map((d) => ({
      id: d.id,
      title: d.title,
      cardCount: d.cardCount,
      difficulty: d.difficulty,
      focus: d.focus,
      generatedBy: d.generatedBy,
    })),
  });
}