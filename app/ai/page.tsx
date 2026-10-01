import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { GlobalAIChat } from "@/components/ai/GlobalAIChat";
import { getDefaultUser } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export default async function GlobalAIPage() {
  const user = await getDefaultUser();
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-4 lg:p-8">
        <Card className="h-[calc(100vh-160px)] overflow-hidden">
          <CardHeader>
            <CardTitle>Global AI Chat</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Cross-task queries. AI knows your roadmap, notes, and recent activity.
            </p>
          </CardHeader>
          <CardContent className="h-[calc(100%-100px)] overflow-hidden">
            <GlobalAIChat userId={user.id} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}