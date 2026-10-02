import { AppShell } from "@/components/layout/AppShell";
import { GlobalAIChat } from "@/components/ai/GlobalAIChat";
import { getDefaultUser } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export default async function GlobalAIPage() {
  const user = await getDefaultUser();
  return (
    <AppShell>
      <div className="mx-auto h-[calc(100vh-100px)] w-full max-w-[1600px] p-4 lg:p-6">
        <GlobalAIChat userId={user.id} />
      </div>
    </AppShell>
  );
}