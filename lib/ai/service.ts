/**
 * Resolves the user's AI configuration from settings + environment defaults.
 * Centralizing this here means feature services never deal with database +
 * env directly; they just ask for a provider.
 */
import { cache } from "react";
import { eq, and } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/client";
import { aiConfigurations, applicationSettings, users } from "@/lib/db/schema";
import { decrypt } from "@/lib/security/crypto";
import { aiDefaults } from "@/config/app";
import { nowDate } from "@/lib/utils/time";
import { getProvider } from "./registry";
import type { AIProvider } from "./provider";

export interface ResolvedAIConfig {
  provider: string;
  model: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
  streaming: boolean;
}

/** Single-user app. Return the first user or create one on the fly.
 * Cached for 1h because the user row never changes during a session. */
async function _fetchDefaultUser() {
  const all = await db.select().from(users).limit(1);
  if (all.length > 0 && all[0]) return all[0];
  // Lazy create so the app works before a real onboarding step exists.
  const { ids } = await import("@/lib/utils/ids");
  const id = ids.user();
  await db.insert(users).values({ id });
  const created = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return created[0]!;
}

export const getDefaultUser = cache(async () => {
  return unstable_cache(_fetchDefaultUser, ["default-user"], {
    revalidate: 3600,
    tags: ["user"],
  })();
});

/**
 * Return the resolved AI config: stored default → env defaults.
 * Decrypts the API key for server-side use.
 */
export async function resolveAIConfig(userId: string): Promise<ResolvedAIConfig> {
  const stored = await db
    .select()
    .from(aiConfigurations)
    .where(and(eq(aiConfigurations.userId, userId), eq(aiConfigurations.isDefault, true)))
    .limit(1);
  if (stored[0]) {
    const cfg = stored[0];
    let apiKey: string | undefined;
    if (cfg.apiKeyCiphertext && cfg.apiKeyIv && cfg.apiKeyCiphertext.startsWith("v1:")) {
      try {
        // Stored format (save route): "v1:<ciphertextB64>.<authTagB64>"
        const body = cfg.apiKeyCiphertext.slice(3);
        const dot = body.lastIndexOf(".");
        if (dot < 0) throw new Error("malformed ciphertext: missing auth tag separator");
        apiKey = decrypt({
          iv: cfg.apiKeyIv,
          ciphertext: body.slice(0, dot),
          authTag: body.slice(dot + 1),
        });
      } catch {
        apiKey = "";
      }
    }
    return {
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg.baseUrl ?? undefined,
      temperature: Number(cfg.temperature),
      maxTokens: cfg.maxTokens,
      apiKey,
      streaming: cfg.streaming,
    };
  }
  return {
    provider: aiDefaults.provider,
    model: aiDefaults.model,
    baseUrl: aiDefaults.baseUrl,
    temperature: aiDefaults.temperature,
    maxTokens: aiDefaults.maxTokens,
    apiKey: process.env.SERVER_API_KEY_OPENROUTER,
    streaming: true,
  };
}

export async function getAIProvider(userId: string): Promise<AIProvider> {
  const cfg = await resolveAIConfig(userId);
  return getProvider(cfg.provider, { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
}

/** Read a single application setting by key (jsonb column). */
export async function readSetting<T = unknown>(
  userId: string,
  key: string,
  fallback?: T,
): Promise<T | undefined> {
  const row = await db
    .select()
    .from(applicationSettings)
    .where(and(eq(applicationSettings.userId, userId), eq(applicationSettings.key, key)))
    .limit(1);
  if (!row[0]) return fallback;
  return (row[0].value ?? fallback) as T | undefined;
}

export async function writeSetting(userId: string, key: string, value: unknown): Promise<void> {
  const { ids } = await import("@/lib/utils/ids");
  const stored = value ?? null;
  const existing = await db
    .select()
    .from(applicationSettings)
    .where(and(eq(applicationSettings.userId, userId), eq(applicationSettings.key, key)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(applicationSettings)
      .set({ value: stored, updatedAt: nowDate() })
      .where(eq(applicationSettings.id, existing[0].id));
  } else {
    await db.insert(applicationSettings).values({
      id: ids.setting(),
      userId,
      key,
      value: stored,
    });
  }
}