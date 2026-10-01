import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
import { domainConfig } from "@/config/app";
import { STUDY_BLOCK_TYPES } from "@/config/domain";

export default function StudySettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Study defaults</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit <code>config/app.ts</code> and <code>config/domain.ts</code> to change.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Field label="Timezone" value={domainConfig.defaultTimezone} />
        <Field label="Pomodoro length" value={`${domainConfig.pomodoroMinutes} min`} />
        <Field label="Review block length" value={`${domainConfig.reviewBlockMinutes} min`} />
        <Field label="Default daily study" value={`${domainConfig.defaultDailyStudyMinutes} min`} />
        <Field label="Scheduler buffer" value={`${Math.round(domainConfig.schedulerBufferPercent * 100)}%`} />
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Block types</h3>
          <div className="flex flex-wrap gap-1">
            {STUDY_BLOCK_TYPES.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono">{t}</span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}