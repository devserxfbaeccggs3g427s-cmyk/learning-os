import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui";
import { getDefaultUser } from "@/lib/ai/service";
import { CalendarDays } from "lucide-react";
import { getStudyDate, getRealToday, isStudyDateOverridden } from "@/lib/utils/study-date";
import { getCalendarRange } from "@/lib/db/queries/schedule";
import { CalendarGrid, type CalendarDay } from "@/components/calendar/CalendarGrid";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage() {
  const user = await getDefaultUser();
  const studyDate = await getStudyDate();
  const today = new Date(studyDate + "T00:00:00Z");
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 21);

  const startStr = fmtDate(start);
  const endStr = fmtDate(end);

  // One round-trip per shape (schedules + filtered blocks + tasks + note
  // flags). No 2000-row studyBlocks scan, no N+1.
  const entries = await getCalendarRange(user.id, startStr, endStr);

  // Days are generated for the whole window, not just days that have a
  // schedule row — an empty column is a valid drop target, and hiding it
  // would make "move this to Tuesday" impossible for an unscheduled day.
  const blocksByDate = new Map<string, CalendarDay["blocks"]>();
  const objectiveByDate = new Map<string, string | null>();
  for (const e of entries) {
    blocksByDate.set(e.schedule.date, e.blocks);
    objectiveByDate.set(e.schedule.date, e.schedule.objective);
  }

  const days: CalendarDay[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = fmtDate(d);
    days.push({
      date: key,
      objective: objectiveByDate.get(key) ?? null,
      blocks: blocksByDate.get(key) ?? [],
    });
  }
  const overridden = await isStudyDateOverridden();
  const realToday = getRealToday();

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-8">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6 text-primary" /> Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            Click một block để xem chi tiết và ghi note · kéo block sang ngày/giờ khác để dời lịch.
            {overridden && (
              <Badge className="ml-2 bg-amber-500/10 text-amber-700">
                đang highlight {studyDate} · real hôm nay {realToday}
              </Badge>
            )}
          </p>
        </header>

        <CalendarGrid userId={user.id} days={days} today={studyDate} realToday={realToday} />
      </div>
    </AppShell>
  );
}
