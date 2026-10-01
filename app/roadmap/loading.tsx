import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, CardSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
        <CardSkeleton lines={2} />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-5 w-1/3" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}