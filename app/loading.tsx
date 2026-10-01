import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, PageHeaderSkeleton, CardSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
        <PageHeaderSkeleton />
        <div className="space-y-3">
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </div>
    </AppShell>
  );
}