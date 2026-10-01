import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-8">
        <div className="space-y-2">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-[60vh] w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}