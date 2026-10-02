"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PromptTopic } from "@/components/ai/PromptSuggestions";

export type SuggestionSource = "fallback" | "cache" | "fresh";

export interface UsePromptSuggestionsParams {
  userId: string;
  mode: "GLOBAL" | "TUTOR";
  /** taskId for TUTOR mode; undefined for GLOBAL. */
  taskId?: string | null;
  fallbackTopics: PromptTopic[];
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

const CACHE_VERSION = "v1";
const PREFIX = "ai-suggestions";

/** YYYY-MM-DD in local time — rotates the cache daily. */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cacheKey(userId: string, mode: string, taskId: string | null | undefined, day: string): string {
  return `${PREFIX}:${CACHE_VERSION}:${userId}:${mode}:${taskId ?? "_global"}:${day}`;
}

interface CachedEntry {
  day: string;
  topics: PromptTopic[];
}

function readCache(key: string): PromptTopic[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (parsed.day !== todayKey()) return null;
    if (!Array.isArray(parsed.topics)) return null;
    return parsed.topics;
  } catch {
    return null;
  }
}

function writeCache(key: string, topics: PromptTopic[]): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CachedEntry = { day: todayKey(), topics };
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // sessionStorage may be unavailable (private mode, quota); silently skip.
  }
}

/**
 * Load topic-organized prompt suggestions.
 *
 *  1. Show `fallbackTopics` immediately so the UI never looks empty.
 *  2. Hit `sessionStorage` for today's cached AI suggestions → swap in.
 *  3. Fire-and-forget fetch to `/api/ai/suggestions` → on success, cache + swap.
 *  4. `refresh()` bypasses the cache and re-fetches.
 */
export function usePromptSuggestions(params: UsePromptSuggestionsParams): UsePromptSuggestionsResult {
  const { userId, mode, taskId, fallbackTopics, disabled } = params;
  const [topics, setTopics] = useState<PromptTopic[]>(fallbackTopics);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SuggestionSource>("fallback");

  // Keep latest params in a ref so the effect's identity doesn't churn.
  const key = cacheKey(userId, mode, taskId, todayKey());
  const abortRef = useRef<AbortController | null>(null);

  const fetchFresh = useCallback(
    async (bypassCache: boolean) => {
      if (disabled) return;
      // Cancel any in-flight request.
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (!bypassCache) {
        const cached = readCache(key);
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
          // Don't alarm the user when AI just isn't configured — fallback
          // prompts are still visible. Surface a soft hint instead of a
          // generic "HTTP 500" message.
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
        writeCache(key, j.topics);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Failed to load suggestions";
        setError(msg);
        // Keep fallback visible.
        setSource("fallback");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [userId, mode, taskId, disabled, key],
  );

  // Initial load (and re-load when key changes — i.e. task/user/day rotates).
  useEffect(() => {
    fetchFresh(false);
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchFresh]);

  const refresh = useCallback(() => {
    fetchFresh(true);
  }, [fetchFresh]);

  return { topics, loading, error, source, refresh };
}