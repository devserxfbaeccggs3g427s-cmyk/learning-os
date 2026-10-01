"use client";

export const dynamic = "force-dynamic";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import { Loader2, Sprout, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SeedPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/seed", { method: "POST" });
      const j = await r.json();
      if (r.ok && j.ok) {
        setResult({ ok: true, message: "Sample roadmap + schedule inserted." });
        setTimeout(() => router.push("/roadmap"), 800);
      } else {
        setResult({ ok: false, message: j.error ?? j.message ?? "Failed" });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seed sample data</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Inserts a sample Backend Engineering roadmap with two tracks (Java Concurrency, Database
          Engineering), a handful of tasks with dependencies, and a populated Today schedule.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Idempotent — re-running on an existing roadmap is a no-op.</li>
          <li>Does not overwrite your notes or decks.</li>
          <li>Safe to use multiple times for testing.</li>
        </ul>
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
          Seed roadmap
        </Button>
        {result && (
          <Badge className={result.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}>
            {result.message}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}