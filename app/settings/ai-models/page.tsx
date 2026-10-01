import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getDefaultUser, resolveAIConfig } from "@/lib/ai/service";
import { getProvider } from "@/lib/ai/registry";
import { db } from "@/lib/db/client";
import { aiConfigurations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { mask } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";

export default async function AIModelsPage() {
  const user = await getDefaultUser();
  const cfg = await resolveAIConfig(user.id);
  const all = await db.select().from(aiConfigurations).where(eq(aiConfigurations.userId, user.id)).orderBy(desc(aiConfigurations.createdAt));

  let models: { id: string; contextWindow?: number }[] = [];
  if (cfg.apiKey) {
    try {
      const provider = getProvider(cfg.provider, { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
      const list = await provider.listModels(cfg.apiKey, cfg.baseUrl);
      models = list.slice(0, 50);
    } catch {
      /* show empty */
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Saved configurations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {all.length === 0 && <p className="text-sm text-muted-foreground">No configurations yet. Add one in Settings → AI provider.</p>}
          {all.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{c.provider} · {c.label}</div>
                <div className="text-xs text-muted-foreground">
                  model: {c.model} · temperature {c.temperature} · max_tokens {c.maxTokens} · key {c.apiKeyLast4 ? mask(c.apiKeyLast4) : "—"}
                </div>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                {c.isDefault ? "default" : "inactive"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available models ({cfg.provider})</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            First {models.length} from the provider. Click <Link href="/settings/ai" className="text-primary underline">Settings → AI</Link> to switch models.
          </p>
        </CardHeader>
        <CardContent className="max-h-[480px] overflow-y-auto">
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add an API key to load the model list.</p>
          ) : (
            <ul className="space-y-1">
              {models.map((m) => (
                <li key={m.id} className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
                  <span className="font-mono">{m.id}</span>
                  {m.contextWindow ? <span className="ml-2 text-muted-foreground">{m.contextWindow} ctx</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";