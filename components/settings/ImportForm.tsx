"use client";
import { useState } from "react";
import { Textarea, Button, Badge } from "@/components/ui";
import { Loader2, Check, Upload, Sparkles } from "lucide-react";

interface ImportFormProps {
  kind: "roadmap" | "schedule";
}

const PLACEHOLDER_ROADMAP = `{
  "schemaVersion": 1,
  "title": "Backend Engineering — Demo",
  "tracks": [
    {
      "title": "Foundations",
      "modules": [
        {
          "title": "Java & JVM",
          "tasks": [
            {
              "code": "JAVA-CONC-01",
              "title": "Thread lifecycle & JVM memory",
              "priority": "P1",
              "difficulty": "INTERMEDIATE",
              "estimatedMinutes": 60,
              "whyThisMatters": "Concurrency issues are #1 source of backend incidents.",
              "concepts": ["JMM", "happens-before", "volatile"],
              "failureScenarios": [
                {"id": "FS-01", "title": "Lost update", "body": "Two threads update without sync."}
              ],
              "interviewQuestions": ["Explain happens-before in 60 seconds."],
              "tags": ["java", "concurrency"]
            }
          ]
        }
      ]
    }
  ]
}`;

export function ImportForm({ kind }: ImportFormProps) {
  const [text, setText] = useState(kind === "roadmap" ? PLACEHOLDER_ROADMAP : "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ preview?: any; imported?: any; error?: string } | null>(null);

  async function dryRun() {
    setBusy(true);
    setResult(null);
    try {
      const obj = JSON.parse(text);
      const r = await fetch(`/api/${kind}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: obj, dryRun: true }),
      });
      const j = await r.json();
      setResult(r.ok ? { preview: j.preview } : { error: j.error ?? "Invalid" });
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Invalid JSON" });
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    setResult(null);
    try {
      const obj = JSON.parse(text);
      const r = await fetch(`/api/${kind}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: obj, dryRun: false }),
      });
      const j = await r.json();
      setResult(r.ok ? { imported: j } : { error: j.error ?? "Failed" });
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Invalid JSON" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        className="h-64 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={kind === "roadmap" ? PLACEHOLDER_ROADMAP : "Schedule JSON..."}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={dryRun} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Preview
        </Button>
        <Button onClick={doImport} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Confirm import
        </Button>
        {result?.preview && (
          <Badge>
            Preview: {Object.entries(result.preview).map(([k, v]) => `${k}=${v}`).join(", ")}
          </Badge>
        )}
        {result?.imported && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3 w-3" /> Imported roadmap {result.imported.roadmapId}.
          </span>
        )}
        {result?.error && (
          <span className="text-xs text-red-600">{result.error}</span>
        )}
      </div>
    </div>
  );
}