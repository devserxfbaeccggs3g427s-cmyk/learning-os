import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { AIConfigForm } from "@/components/settings/AIConfigForm";
import { getDefaultUser, resolveAIConfig } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export default async function AISettingsPage() {
  const user = await getDefaultUser();
  const cfg = await resolveAIConfig(user.id);
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure which AI provider powers your tutor and the generators. The API key is
          encrypted at rest with AES-256-GCM using <code>APP_ENCRYPTION_KEY</code>.
        </p>
      </CardHeader>
      <CardContent>
        <AIConfigForm
          userId={user.id}
          initial={{
            provider: cfg.provider,
            label: "default",
            model: cfg.model,
            baseUrl: cfg.baseUrl ?? "",
            temperature: cfg.temperature,
            maxTokens: cfg.maxTokens,
            streaming: cfg.streaming,
            hasKey: Boolean(cfg.apiKey),
          }}
        />
      </CardContent>
    </Card>
  );
}