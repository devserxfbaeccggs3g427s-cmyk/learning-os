import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, PageHeaderSkeleton, CardSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
        <PageHeaderSkeleton />
        <CardSkeleton lines={5} />
        <CardSkeleton lines={3} />
      </div>
    </AppShell>
  );
}