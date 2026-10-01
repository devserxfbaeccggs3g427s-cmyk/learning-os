import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, PageHeaderSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-8">
        <PageHeaderSkeleton />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </AppShell>
  );
}