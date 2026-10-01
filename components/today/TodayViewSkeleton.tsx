import { Skeleton } from "@/components/ui";

/**
 * Skeleton matching the TodayView structure — header + progress bar +
 * timeline cards. Shown while the schedule + blocks query is in flight.
 */
export function TodayViewSkeleton({
  date,
  realToday,
  overridden,
}: {
  date: string;
  realToday: string;
  overridden: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-7 w-1/2" />
        {overridden && <Skeleton className="h-5 w-1/3" />}
        <Skeleton className="h-4 w-3/4" />
      </header>
      <div className="rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="mt-3 h-3 w-1/3" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-10 w-10 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      {/* dummy markers to keep tree-shakers from stripping the unused props */}
      <span className="hidden">{date}|{realToday}</span>
    </div>
  );
}