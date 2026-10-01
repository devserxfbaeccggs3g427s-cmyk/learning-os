import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { getDefaultUser } from "@/lib/ai/service";
import { CalendarDays } from "lucide-react";
import { getStudyDate, getRealToday, isStudyDateOverridden } from "@/lib/utils/study-date";
import { cn } from "@/lib/utils/cn";
import { getCalendarRange } from "@/lib/db/queries/schedule";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage() {
  const user = await getDefaultUser();
  const today = new Date((await getStudyDate()) + "T00:00:00Z");
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 21);

  const startStr = fmtDate(start);
  const endStr = fmtDate(end);

  // One round-trip per shape (schedules + filtered blocks). No 2000-row
  // studyBlocks scan, no N+1.
  const entries = await getCalendarRange(user.id, startStr, endStr);

  const blocksByDate = new Map<string, typeof entries[number]["blocks"]>();
  for (const e of entries) {
    blocksByDate.set(e.schedule.date, e.blocks);
  }

  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }
  const overridden = await isStudyDateOverridden();
  const realToday = getRealToday();

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6 text-primary" /> Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            4 weeks view {overridden ? `(đang highlight ${fmtDate(today)}; real hôm nay ${realToday})` : ""}.
            Use Today page&apos;s &quot;Đổi ngày&quot; để xem lịch ngày khác.
          </p>
        </header>
        <div className="grid gap-2 sm:grid-cols-7">
          {days.map((d) => {
            const key = fmtDate(d);
            const dayBlocks = blocksByDate.get(key) ?? [];
            const isStudyDate = fmtDate(today) === key;
            const isRealToday = realToday === key;
            return (
              <Card key={key} className={cn(isStudyDate ? "border-primary/60 ring-2 ring-primary/20" : "")}>
                <CardHeader className="px-3 py-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className="flex items-center gap-1">
                      {isRealToday && !isStudyDate && (
                        <span className="rounded-full bg-muted px-1.5 text-[9px]">today</span>
                      )}
                      <span className="font-mono">{d.getUTCDate()}</span>
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 px-3 py-1">
                  {dayBlocks.length === 0 && (
                    <p className="text-[10px] italic text-muted-foreground">no blocks</p>
                  )}
                  {dayBlocks.slice(0, 4).map((b) => (
                    <div key={b.id} className="truncate rounded bg-muted/50 px-1.5 py-1 text-[10px]">
                      <span className="font-mono">{Math.floor(b.startMinute / 60)}:00</span>{" "}
                      {b.title}
                    </div>
                  ))}
                  {dayBlocks.length > 4 && (
                    <Badge>+{dayBlocks.length - 4} more</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
