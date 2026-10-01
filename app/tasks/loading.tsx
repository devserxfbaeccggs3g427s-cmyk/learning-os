import { AppShell } from "@/components/layout/AppShell";
import { GridSkeleton, Skeleton, PageHeaderSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeaderSkeleton />
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
        <GridSkeleton count={9} />
      </div>
    </AppShell>
  );
}