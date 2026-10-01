import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
import { SRS_DEFAULTS, REVIEW_RATINGS } from "@/config/domain";

export default function FlashcardSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spaced repetition defaults</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          SM-2 inspired schedule. Implemented as a pure function in <code>lib/srs/scheduler.ts</code>.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {Object.entries(SRS_DEFAULTS).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-1.5">
            <span className="text-xs font-mono text-muted-foreground">{k}</span>
            <span className="font-medium">{String(v)}</span>
          </div>
        ))}
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ratings</h3>
          <div className="flex flex-wrap gap-1">
            {REVIEW_RATINGS.map((r) => (
              <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono">{r}</span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}