"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import { Trash2, AlertTriangle, Loader2, RefreshCw, FileX, ListX, ClipboardX, Database } from "lucide-react";

interface ClearScope {
  id: "progress" | "content" | "schedule" | "roadmap" | "all";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  warning: string;
}

const SCOPES: ClearScope[] = [
  {
    id: "progress",
    title: "Study progress",
    description: "Reset block statuses (Done/Skipped → PLANNED), clear quiz attempts, delete study sessions, recompute task progress to zero.",
    icon: RefreshCw,
    warning: "Xóa lịch sử study session và quiz attempts. Notes/decks/quizzes/roadmap KHÔNG bị ảnh hưởng.",
  },
  {
    id: "content",
    title: "User-generated content",
    description: "Delete notes, flashcard decks, quizzes, AI conversations, mastery records. Tasks/schedule/roadmap giữ nguyên.",
    icon: FileX,
    warning: "Xoá notes, flashcards, quizzes bạn đã tạo. AI chat history sẽ bị mất. Tasks/roadmap KHÔNG bị ảnh hưởng.",
  },
  {
    id: "schedule",
    title: "Imported schedule",
    description: "Delete all study blocks + schedules. Today page sẽ trống cho đến khi bạn import lại.",
    icon: ClipboardX,
    warning: "Xoá toàn bộ lịch học đã import (300 ngày × 1898 blocks). Tasks KHÔNG bị xoá nhưng sẽ mất liên kết với blocks.",
  },
  {
    id: "roadmap",
    title: "Imported roadmap",
    description: "Delete roadmap, tracks, modules, tasks. Notes/decks/quizzes cũng sẽ bị xoá vì chúng thuộc về tasks.",
    icon: ListX,
    warning: "Xoá toàn bộ roadmap (205 tasks, 18 tracks). Notes/flashcards/quizzes liên quan sẽ mất theo. Schedule blocks cũng vậy.",
  },
  {
    id: "all",
    title: "Reset everything",
    description: "Wipe toàn bộ roadmap, schedule, notes, decks, quizzes, AI history. Giữ lại user và settings.",
    icon: Database,
    warning: "Xoá TẤT CẢ dữ liệu. Sau thao tác này, Today/Roadmap/Calendar/AI sẽ trống. Bạn sẽ cần import lại.",
  },
];

export function ClearDataControls({ userId }: { userId: string }) {
  const [active, setActive] = useState<ClearScope["id"] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ scope: string; deleted: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!active || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: active, confirm: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Unknown error");
      setResult(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
      setActive(null);
      setConfirmed(false);
    }
  }

  return (
    <Card className="border-red-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700">
          <Trash2 className="h-4 w-4" />
          Clear data
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Chọn phạm vi dữ liệu muốn xoá. Mỗi thao tác yêu cầu 2 lần xác nhận.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {result && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
            <strong>Đã xoá xong scope "{result.scope}".</strong>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              {Object.entries(result.deleted).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="font-mono text-muted-foreground">{k}</span>
                  <span className="font-semibold">{v} rows</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {SCOPES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setActive(s.id);
                  setConfirmed(false);
                  setResult(null);
                  setError(null);
                }}
                disabled={busy}
                className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-left hover:bg-accent disabled:opacity-50"
              >
                <Icon className="mt-0.5 h-4 w-4 text-red-600" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {active && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <div className="flex-1 space-y-3">
                <div>
                  <strong className="text-amber-700">Cảnh báo:</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {SCOPES.find((s) => s.id === active)?.warning}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Tôi hiểu thao tác này không thể hoàn tác
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!confirmed || busy}
                    onClick={run}
                  >
                    {busy ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 h-3 w-3" />
                    )}
                    Xoá ngay
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActive(null);
                      setConfirmed(false);
                    }}
                    disabled={busy}
                  >
                    Huỷ
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Badge>Tip</Badge>
          <span className="ml-2">
            Thay vì xoá, bạn có thể dùng <code>npm run db:seed</code> sau khi xoá roadmap để insert
            sample mới, hoặc import lại JSON từ <code>data/roadmap-import.json</code>.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}