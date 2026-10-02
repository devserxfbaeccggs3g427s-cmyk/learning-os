/**
 * Reusable SSE consumer for `/api/ai/chat`.
 *
 * Goals:
 *  - Coalesce many upstream deltas into ≤1 React update per animation frame
 *    so we never trigger more renders than the browser can paint.
 *  - Expose a stable `text` (the latest accumulated assistant content) and a
 *    `done` flag so callers can swap from raw text → <MarkdownRenderer>.
 *  - Surface `error`, `conversationId`, `usage` for the caller to persist.
 */
"use client";
import { useCallback, useRef, useState } from "react";

export interface StreamUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export type StreamPhase = "idle" | "thinking" | "streaming" | "done" | "error";

export interface StreamState {
  text: string;
  done: boolean;
  error: { kind: string; message: string } | null;
  conversationId: string | null;
  usage: StreamUsage | null;
  /** Higher-level status than `loading` + `error`. */
  phase: StreamPhase;
}

export interface UseStreamedChatResult extends StreamState {
  /** Start a new stream. Aborts any in-flight request. */
  send: (params: {
    userId: string;
    mode?: "TUTOR" | "INTERVIEW" | "FAILURE_DRILL" | "DEBUG_DRILL" | "KNOWLEDGE_GAP" | "GLOBAL";
    prompt: string;
    conversationId?: string | null;
    taskId?: string | null;
    contextOverride?: string | null;
    /** "stream" (default): show each delta as it arrives. */
    /** "wait": accumulate silently until done to keep the UI lag-free. */
    renderMode?: "stream" | "wait";
  }) => Promise<void>;
  /** Clear state for a fresh conversation. */
  reset: () => void;
  /** True between send() and done/error. */
  loading: boolean;
}

const INITIAL: StreamState = {
  text: "",
  done: false,
  error: null,
  conversationId: null,
  usage: null,
  phase: "idle",
};

export function useStreamedChat(): UseStreamedChatResult {
  const [state, setState] = useState<StreamState>(INITIAL);
  const [loading, setLoading] = useState(false);
  // Persisted across renders so `send()` knows whether to surface deltas.
  const modeRef = useRef<"stream" | "wait">("stream");

  // Latest accumulator — written from RAF flush, never from a setState.
  const accRef = useRef("");
  // The "rendered" text — the last value we actually committed to React state.
  const renderedRef = useRef("");
  // Pending text waiting to be flushed on the next animation frame.
  const pendingRef = useRef<string | null>(null);
  // The animation frame handle so we can cancel if a new stream supersedes it.
  const rafRef = useRef<number | null>(null);
  // Tracks whether we've seen our first upstream delta (thinking → streaming).
  const streamedRef = useRef(false);
  // Abort controller for the active fetch.
  const abortRef = useRef<AbortController | null>(null);
  // The conversationId from the server (may differ from request if it was null).
  const convIdRef = useRef<string | null>(null);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next == null) return;
      renderedRef.current = next;
      setState((s) => ({ ...s, text: next }));
    });
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    abortRef.current = null;
    accRef.current = "";
    renderedRef.current = "";
    pendingRef.current = null;
    streamedRef.current = false;
    convIdRef.current = null;
    setState(INITIAL);
    setLoading(false);
  }, []);

  const send = useCallback(
    async (params: {
      userId: string;
      mode?: "TUTOR" | "INTERVIEW" | "FAILURE_DRILL" | "DEBUG_DRILL" | "KNOWLEDGE_GAP" | "GLOBAL";
      prompt: string;
      conversationId?: string | null;
      taskId?: string | null;
      contextOverride?: string | null;
      /** "stream" (default): show each delta as it arrives. */
      /** "wait": accumulate silently until done to keep the UI lag-free. */
      renderMode?: "stream" | "wait";
    }) => {
      // Cancel any previous run.
      if (abortRef.current) abortRef.current.abort();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      modeRef.current = params.renderMode ?? "stream";

      accRef.current = "";
      renderedRef.current = "";
      pendingRef.current = null;
      streamedRef.current = false;
      convIdRef.current = params.conversationId ?? null;

      setState({ ...INITIAL, conversationId: convIdRef.current, phase: "thinking" });
      setLoading(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let r: Response;
      try {
        r = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: params.userId,
            mode: params.mode ?? "TUTOR",
            prompt: params.prompt,
            conversationId: params.conversationId ?? null,
            taskId: params.taskId ?? null,
            contextOverride: params.contextOverride ?? null,
          }),
          signal: ctrl.signal,
        });
      } catch (err) {
        setLoading(false);
        setState((s) => ({
          ...s,
          done: true,
          phase: "error",
          error: { kind: "network", message: err instanceof Error ? err.message : "Network error" },
        }));
        return;
      }

      if (!r.ok || !r.body) {
        setLoading(false);
        setState((s) => ({
          ...s,
          done: true,
          phase: "error",
          error: { kind: "http", message: `HTTP ${r.status}` },
        }));
        return;
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      let finalUsage: StreamUsage | null = null;

      const flushNow = () => {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const next = pendingRef.current ?? accRef.current;
        pendingRef.current = null;
        renderedRef.current = next;
        setState((s) => ({ ...s, text: next }));
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const ev of events) {
            const m = ev.match(/^data: (.*)$/);
            if (!m) continue;
            let obj: { type?: string; text?: string; conversationId?: string; usage?: StreamUsage; kind?: string; message?: string };
            try {
              obj = JSON.parse(m[1]!);
            } catch {
              continue;
            }
            if (obj.type === "delta" && typeof obj.text === "string") {
              accRef.current += obj.text;
              if (modeRef.current === "stream") {
                pendingRef.current = accRef.current;
                // First delta → switch from thinking to streaming.
                if (!streamedRef.current) {
                  streamedRef.current = true;
                  setState((s) => ({ ...s, phase: "streaming" }));
                }
                scheduleFlush();
              }
            } else if (obj.type === "done") {
              if (obj.conversationId) convIdRef.current = obj.conversationId;
              if (obj.usage) finalUsage = obj.usage;
            } else if (obj.type === "error") {
              const msg = obj.message ?? "AI request failed";
              accRef.current = `⚠️ ${msg}${obj.kind ? ` (${obj.kind})` : ""}`;
              pendingRef.current = accRef.current;
            }
          }
        }
      } catch (err) {
        if (ctrl.signal.aborted) return; // user navigated / reset
        flushNow();
        setLoading(false);
        setState((s) => ({
          ...s,
          done: true,
          phase: "error",
          error: { kind: "stream", message: err instanceof Error ? err.message : "Stream error" },
        }));
        return;
      }

      // Drain any remaining buffered deltas before final commit.
      if (modeRef.current === "stream") {
        flushNow();
      } else {
        // Wait mode: commit the full accumulator once, on completion.
        renderedRef.current = accRef.current;
        setState((s) => ({ ...s, text: accRef.current, phase: "streaming" }));
      }
      setLoading(false);
      setState((s) => ({
        ...s,
        done: true,
        phase: "done",
        conversationId: convIdRef.current,
        usage: finalUsage ?? s.usage,
      }));
    },
    [scheduleFlush],
  );

  return { ...state, loading, send, reset };
}