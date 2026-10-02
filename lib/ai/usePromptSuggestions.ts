"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PromptTopic } from "@/components/ai/ChatSuggestions";

export type SuggestionSource = "fallback" | "cache" | "fresh";

export interface UsePromptSuggestionsParams {
  userId: string;
  mode: "GLOBAL" | "TUTOR";
  /** taskId for TUTOR mode; undefined for GLOBAL. */
  taskId?: string | null;
  fallbackTopics: PromptTopic[];
  /** When true, persist into localStorage so cross-tab navigation is instant. */
  useLocalStorage?: boolean;
  /**
   * Bump this when you want a fresh fetch (bypass cache) — e.g. after each
   * AI response. Pass `stream.done` or a counter that increments on `done`.
   */
  refreshTrigger?: number | string;
  /** When true, no fetch happens. Caller still gets fallbackTopics. */
  disabled?: boolean;
}

export interface UsePromptSuggestionsResult {
  topics: PromptTopic[];
  loading: boolean;
  error: string | null;
  source: SuggestionSource;
  refresh: () => void;
}

const CACHE_VERSION = "v2";
const PREFIX = "ai-suggestions";

/** YYYY-MM-DD in local time — rotates the cache daily. */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cacheKey(userId: string, mode: string, taskId: string | null | undefined, day: string, useLocal: boolean): string {
  const store = useLocal ? "local" : "session";
  return `${PREFIX}:${CACHE_VERSION}:${store}:${userId}:${mode}:${taskId ?? "_global"}:${day}`;
}

interface CachedEntry {
  day: string;
  topics: PromptTopic[];
}

function pickStore(useLocal: boolean): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return useLocal ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readCache(key: string, useLocal: boolean): PromptTopic[] | null {
  const store = pickStore(useLocal);
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (parsed.day !== todayKey()) return null;
    if (!Array.isArray(parsed.topics)) return null;
    return parsed.topics;
  } catch {
    return null;
  }
}

function writeCache(key: string, topics: PromptTopic[], useLocal: boolean): void {
  const store = pickStore(useLocal);
  if (!store) return;
  try {
    const entry: CachedEntry = { day: todayKey(), topics };
    store.setItem(key, JSON.stringify(entry));
  } catch {
    // storage may be unavailable (private mode, quota); silently skip.
  }
}

/**
 * Load topic-organized prompt suggestions.
 *
 *  1. Show `fallbackTopics` immediately so the UI never looks empty.
 *  2. Hit storage (local or session) for today's cached AI suggestions → swap in.
 *  3. Fire-and-forget fetch to `/api/ai/suggestions` → on success, cache + swap.
 *  4. `refresh()` (or `refreshTrigger` change) bypasses the cache and re-fetches.
 *  5. For localStorage mode, suggestions persist across page loads and tabs.
 */
export function usePromptSuggestions(params: UsePromptSuggestionsParams): UsePromptSuggestionsResult {
  const { userId, mode, taskId, fallbackTopics, useLocalStorage = false, refreshTrigger, disabled } = params;
  const [topics, setTopics] = useState<PromptTopic[]>(fallbackTopics);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SuggestionSource>("fallback");

  const key = cacheKey(userId, mode, taskId, todayKey(), useLocalStorage);
  const abortRef = useRef<AbortController | null>(null);

  const fetchFresh = useCallback(
    async (bypassCache: boolean) => {
      if (disabled) return;
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (!bypassCache) {
        const cached = readCache(key, useLocalStorage);
        if (cached && cached.length > 0) {
          setTopics(cached);
          setSource("cache");
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/ai/suggestions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, mode, taskId: taskId ?? null }),
          signal: ctrl.signal,
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          if (r.status === 400 && /not configured/i.test(j.error ?? "")) {
            throw new Error("AI not configured — showing generic prompts. Add an API key in Settings → AI to personalize them.");
          }
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        const j = (await r.json()) as { topics: PromptTopic[] };
        if (!Array.isArray(j.topics) || j.topics.length === 0) {
          throw new Error("Empty suggestions payload");
        }
        if (ctrl.signal.aborted) return;
        setTopics(j.topics);
        setSource("fresh");
        writeCache(key, j.topics, useLocalStorage);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Failed to load suggestions";
        setError(msg);
        setSource("fallback");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [userId, mode, taskId, disabled, key, useLocalStorage],
  );

  // Initial load + re-load when scope key changes.
  useEffect(() => {
    fetchFresh(false);
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFresh]);

  // External refresh signal (e.g. after each AI response).
  useEffect(() => {
    if (refreshTrigger === undefined) return;
    fetchFresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const refresh = useCallback(() => {
    fetchFresh(true);
  }, [fetchFresh]);

  return { topics, loading, error, source, refresh };
}