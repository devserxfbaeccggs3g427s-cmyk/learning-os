import { AppShell } from "@/components/layout/AppShell";
import { CardSkeleton, PageHeaderSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
        <PageHeaderSkeleton />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
    </AppShell>
  );
}