import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { AIConfigForm } from "@/components/settings/AIConfigForm";
import { LanguagePicker } from "@/components/settings/LanguagePicker";
import { getDefaultUser, resolveAIConfig, readSetting } from "@/lib/ai/service";
import { DEFAULT_LANGUAGE, LANGUAGE_SETTING_KEY } from "@/lib/ai/language";

export const dynamic = "force-dynamic";

export default async function AISettingsPage() {
  const user = await getDefaultUser();
  const cfg = await resolveAIConfig(user.id);
  const languageRow = await readSetting<string>(user.id, LANGUAGE_SETTING_KEY);
  const initialLanguage =
    typeof languageRow === "string" && languageRow.length > 0 ? languageRow : DEFAULT_LANGUAGE;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Output language</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the language the AI tutor replies in. Applies to all conversational modes
            (TUTOR / INTERVIEW / FAILURE_DRILL / DEBUG_DRILL / GLOBAL). Generator outputs
            (Flashcards / Quiz / JSON) are unaffected.
          </p>
        </CardHeader>
        <CardContent>
          <LanguagePicker
            initial={initialLanguage}
            envDefault={process.env.AI_DEFAULT_LANGUAGE ?? null}
            hardcoded={DEFAULT_LANGUAGE}
          />
        </CardContent>
      </Card>

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
    </div>
  );
}