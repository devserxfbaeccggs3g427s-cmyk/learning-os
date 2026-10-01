/**
 * Centralized application configuration.
 *
 * EVERY value that has even a small chance of changing should live here
 * (or under /config). Domain code must read from this file instead of
 * hard-coding values.
 *
 * Values that originate from the environment are normalized through Zod.
 * Anything user-tunable lives in the Setting table and is loaded via
 * `getEffectiveConfig()` at runtime.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // Postgres connection (Supabase transaction pooler recommended, port 6543).
  // Falls back to other names so existing local setups keep working.
  LEARNING_OS_POSTGRES_URL: z.string().optional(),
  LEARNING_OS_SUPABASE_DATABASE_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  APP_ENCRYPTION_KEY: z.string().min(16).default("dev-encryption-key-change-me-please-32b"),
  APP_TRUSTED_ORIGINS: z.string().default("http://localhost:3000"),

  AI_DEFAULT_PROVIDER: z.string().default("openrouter"),
  AI_DEFAULT_MODEL: z.string().default("minimax/minimax-m3"),
  AI_DEFAULT_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  AI_DEFAULT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  AI_DEFAULT_MAX_TOKENS: z.coerce.number().int().positive().default(128000),

  FEATURE_PWA: z.coerce.boolean().default(true),
  FEATURE_GLOBAL_AI: z.coerce.boolean().default(true),
  FEATURE_DEBUG_DRILL: z.coerce.boolean().default(true),
  FEATURE_FAILURE_DRILL: z.coerce.boolean().default(true),
  FEATURE_COST_TRACKING: z.coerce.boolean().default(true),
  FEATURE_KNOWLEDGE_GAP: z.coerce.boolean().default(true),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppEnv = z.infer<typeof EnvSchema>;

function readEnv(): AppEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Surface early so misconfigurations are loud, not silent.
    throw new Error(
      "Invalid environment configuration: " + JSON.stringify(parsed.error.flatten(), null, 2),
    );
  }
  return parsed.data;
}

export const env: AppEnv = readEnv();

/**
 * Feature flags resolved from environment. Database-level overrides (via
 * `ApplicationSetting`) take precedence in `getEffectiveFeatureFlags()`.
 */
export const featureFlags = {
  pwa: env.FEATURE_PWA,
  globalAI: env.FEATURE_GLOBAL_AI,
  debugDrill: env.FEATURE_DEBUG_DRILL,
  failureDrill: env.FEATURE_FAILURE_DRILL,
  costTracking: env.FEATURE_COST_TRACKING,
  knowledgeGap: env.FEATURE_KNOWLEDGE_GAP,
} as const;

/**
 * AI defaults. These are server-side fallbacks used when the user has not
 * configured their own provider/model in Settings.
 */
export const aiDefaults = {
  provider: env.AI_DEFAULT_PROVIDER,
  model: env.AI_DEFAULT_MODEL,
  baseUrl: env.AI_DEFAULT_BASE_URL,
  temperature: env.AI_DEFAULT_TEMPERATURE,
  maxTokens: env.AI_DEFAULT_MAX_TOKENS,
} as const;

/**
 * Domain configuration that is unlikely to be user-tunable but should still
 * live in code rather than scattered hard-coded values.
 */
export const domainConfig = {
  defaultTimezone: "Asia/Ho_Chi_Minh",
  pomodoroMinutes: 25,
  reviewBlockMinutes: 15,
  defaultDailyStudyMinutes: 150,
  schedulerBufferPercent: 0.15,
} as const;