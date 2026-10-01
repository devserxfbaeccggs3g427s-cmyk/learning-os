import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_helpers";
import { users } from "./users";

/**
 * Generic key/value application settings. Keys are namespaced strings like
 * `theme`, `ai.provider`, `ai.models.openrouter` etc.
 *
 * Setting is a row per (userId, key). Sensitive values (e.g. encrypted API
 * keys) are stored in `aiConfigurations` instead.
 */
export const applicationSettings = sqliteTable(
  "application_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(), // JSON-encoded
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    userKeyIdx: uniqueIndex("settings_user_key_unique").on(t.userId, t.key),
  }),
);

/**
 * Persisted AI provider configurations. The API key (if any) is stored as
 * an encrypted ciphertext; the rest is plain JSON.
 *
 * We may have multiple configurations per provider (e.g. different models)
 * and exactly one *default* per provider per user.
 */
export const aiConfigurations = sqliteTable(
  "ai_configurations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // openrouter | openai | anthropic | local
    label: text("label").notNull(), // human friendly label e.g. "OpenRouter: gpt-4o-mini"
    baseUrl: text("base_url"),
    model: text("model").notNull(),
    temperature: text("temperature").notNull().default("0.4"),
    maxTokens: integer("max_tokens").notNull().default(2000),
    streaming: integer("streaming", { mode: "boolean" }).notNull().default(true),
    /** AES-GCM ciphertext (base64) of the API key, or null. */
    apiKeyCiphertext: text("api_key_ciphertext"),
    /** AES-GCM IV (base64). */
    apiKeyIv: text("api_key_iv"),
    /** Last 4 chars of the API key, for display only. */
    apiKeyLast4: text("api_key_last4"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    userProviderIdx: uniqueIndex("ai_config_user_provider_unique").on(t.userId, t.provider, t.label),
  }),
);

/**
 * PromptTemplate overrides. We ship default templates in code; users can
 * override them via Settings. A NULL user means it's a system default.
 */
export const promptTemplates = sqliteTable(
  "prompt_templates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: text("version").notNull().default("1.0.0"),
    systemPrompt: text("system_prompt").notNull(),
    userTemplate: text("user_template"),
    config: text("config"), // JSON: {temperature, maxTokens, ...}
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    userNameVersionIdx: uniqueIndex("prompt_template_unique").on(t.userId, t.name, t.version),
  }),
);

export type ApplicationSettingRow = typeof applicationSettings.$inferSelect;
export type AIConfigurationRow = typeof aiConfigurations.$inferSelect;
export type PromptTemplateRow = typeof promptTemplates.$inferSelect;