/**
 * Language directive prepended to every conversational AI system prompt.
 *
 * Rule: always respond in the user's configured default language, regardless
 * of the language the user types their question in. Only switch language if
 * the user explicitly asks for one (e.g. "trả lời bằng tiếng Anh", "answer in
 * English", "日本語で答えて").
 *
 * Resolution order:
 *   1. Per-user setting  `applicationSettings[ai.outputLanguage]` (set via UI)
 *   2. Env var           `AI_DEFAULT_LANGUAGE` (server-wide)
 *   3. Hardcoded         "Vietnamese"
 *
 * To avoid leaking the directive into model JSON outputs, this directive is
 * only applied to conversational prompts — generators that emit JSON go
 * through `lib/ai/openrouter.ts#generateStructured` and never see this text.
 */
import { readSetting } from "@/lib/ai/service";

export const DEFAULT_LANGUAGE = "Vietnamese";
export const LANGUAGE_SETTING_KEY = "ai.outputLanguage";

export function getDefaultLanguageSync(): string {
  const fromEnv = process.env.AI_DEFAULT_LANGUAGE?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_LANGUAGE;
}

export async function getDefaultLanguage(userId: string): Promise<string> {
  const fromDb = await readSetting<string>(userId, LANGUAGE_SETTING_KEY);
  if (typeof fromDb === "string" && fromDb.trim().length > 0) return fromDb.trim();
  return getDefaultLanguageSync();
}

export function buildLanguageDirective(lang: string): string {
  return `\n\n## Language rule\n- Respond in ${lang} by default, even when the user writes in a different language.\n- Switch language ONLY when the user explicitly requests it (e.g. "trả lời bằng tiếng Anh", "answer in English", "用中文回答"). In that case, mirror the requested language for the whole reply.\n- Keep technical terms (API names, library names, code, command-line flags) in their canonical English form; translate prose around them.`;
}

export function applyLanguageDirective(systemPrompt: string, lang: string): string {
  return `${systemPrompt}${buildLanguageDirective(lang)}`;
}