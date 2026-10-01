import { AppShell } from "@/components/layout/AppShell";
import { CalendarSkeleton, PageHeaderSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
        <PageHeaderSkeleton />
        <CalendarSkeleton />
      </div>
    </AppShell>
  );
}