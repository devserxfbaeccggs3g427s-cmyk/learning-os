import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, PageHeaderSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4 p-4 lg:p-8">
        <PageHeaderSkeleton />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </AppShell>
  );
}