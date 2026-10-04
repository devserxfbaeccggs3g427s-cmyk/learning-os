/**
 * SSE client for `/api/ai/frames/chat`.
 *
 * Deliberately a separate hook from `useStreamedChat`, even though the
 * wire format is the same. That hook hard-codes `mode`, `taskId` and
 * `contextOverride` into the request body — every one of those fields
 * is exactly what a frame must NOT send. A frame's body carries only a
 * frame id, a scope, and text.
 *
 * Scope is per-turn state here; persistence is the server's job.
 */
"use client";
import { useCallback, useRef, useState } from "react";
import { detectNoAnswer } from "@/lib/ai/frame/no-answer";
import type { FrameKnowledgeMode } from "@/lib/db/schema/aiFrames";

export interface FrameRetrievalTelemetry {
  candidates: number;
  hits: number;
  topScore: number;
}

export interface FrameStreamUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

/** What the server reports about the last completed turn. */
export interface FrameTurnResult {
  frameId: string;
  grounded: boolean;
  noAnswer: boolean;
  retrieval: FrameRetrievalTelemetry;
}

export type FrameStreamPhase = "idle" | "thinking" | "streaming" | "done" | "error";

export interface FrameStreamState {
  text: string;
  done: boolean;
  error: { kind: string; message: string } | null;
  phase: FrameStreamPhase;
  frameId: string | null;
  result: FrameTurnResult | null;
  usage: FrameStreamUsage | null;
}

export interface UseFrameChatResult extends FrameStreamState {
  loading: boolean;
  send: (params: {
    frameId: string | null;
    prompt: string;
    knowledgeMode: FrameKnowledgeMode;
    renderMode?: "stream" | "wait";
  }) => Promise<void>;
  reset: () => void;
}

const INITIAL: FrameStreamState = {
  text: "",
  done: false,
  error: null,
  phase: "idle",
  frameId: null,
  result: null,
  usage: null,
};

/** Same threshold the server used — kept in sync via the shared module. */
function noAnswerOf(reply: string): boolean {
  return detectNoAnswer(reply);
}

export function useFrameChat(): UseFrameChatResult {
  const [state, setState] = useState<FrameStreamState>(INITIAL);
  const [loading, setLoading] = useState(false);

  const accRef = useRef("");
  const renderedRef = useRef("");
  const pendingRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const modeRef = useRef<"stream" | "wait">("stream");

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
    abortRef.current?.abort();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    abortRef.current = null;
    accRef.current = "";
    renderedRef.current = "";
    pendingRef.current = null;
    streamedRef.current = false;
    setState(INITIAL);
    setLoading(false);
  }, []);

  const send = useCallback(
    async (params: {
      frameId: string | null;
      prompt: string;
      knowledgeMode: FrameKnowledgeMode;
      renderMode?: "stream" | "wait";
    }) => {
      abortRef.current?.abort();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      modeRef.current = params.renderMode ?? "stream";
      accRef.current = "";
      renderedRef.current = "";
      pendingRef.current = null;
      streamedRef.current = false;

      setState({ ...INITIAL, frameId: params.frameId, phase: "thinking" });
      setLoading(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let r: Response;
      try {
        r = await fetch("/api/ai/frames/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // No userId, no taskId, no conversationId: the server resolves
          // the user itself and a frame carries its own history.
          body: JSON.stringify({
            frameId: params.frameId,
            prompt: params.prompt,
            knowledgeMode: params.knowledgeMode,
            renderMode: params.renderMode ?? "stream",
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
        const detail = await r
          .json()
          .then((j: { error?: string }) => j.error ?? "")
          .catch(() => "");
        setLoading(false);
        setState((s) => ({
          ...s,
          done: true,
          phase: "error",
          error: { kind: "http", message: detail || `HTTP ${r.status}` },
        }));
        return;
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      let usage: FrameStreamUsage | null = null;
      let result: FrameTurnResult | null = null;
      let resolvedFrameId = params.frameId;

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
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const ev of events) {
            const m = ev.match(/^data: (.*)$/);
            if (!m) continue;
            let obj: {
              type?: string;
              text?: string;
              frameId?: string;
              usage?: FrameStreamUsage;
              grounded?: boolean;
              noAnswer?: boolean;
              retrieval?: FrameRetrievalTelemetry;
              kind?: string;
              message?: string;
            };
            try {
              obj = JSON.parse(m[1]!);
            } catch {
              continue;
            }
            if (obj.type === "delta" && typeof obj.text === "string") {
              accRef.current += obj.text;
              if (modeRef.current === "stream") {
                pendingRef.current = accRef.current;
                if (!streamedRef.current) {
                  streamedRef.current = true;
                  setState((s) => ({ ...s, phase: "streaming" }));
                }
                scheduleFlush();
              }
            } else if (obj.type === "done") {
              if (obj.frameId) resolvedFrameId = obj.frameId;
              if (obj.usage) usage = obj.usage;
              result = {
                // Fall back to the marker scan when the server's flag is
                // absent — older routes, or a proxy that drops fields.
                frameId: obj.frameId ?? params.frameId ?? "",
                grounded: obj.grounded ?? false,
                noAnswer: obj.noAnswer ?? noAnswerOf(accRef.current),
                retrieval: obj.retrieval ?? { candidates: 0, hits: 0, topScore: 0 },
              };
            } else if (obj.type === "error") {
              accRef.current = `⚠️ ${obj.message ?? "AI request failed"}${obj.kind ? ` (${obj.kind})` : ""}`;
              pendingRef.current = accRef.current;
              result = {
                frameId: resolvedFrameId ?? "",
                grounded: false,
                noAnswer: false,
                retrieval: { candidates: 0, hits: 0, topScore: 0 },
              };
            }
          }
        }
      } catch (err) {
        if (ctrl.signal.aborted) return;
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

      if (modeRef.current === "stream") {
        flushNow();
      } else {
        renderedRef.current = accRef.current;
        setState((s) => ({ ...s, text: accRef.current, phase: "streaming" }));
      }
      setLoading(false);
      setState((s) => ({
        ...s,
        done: true,
        phase: "done",
        frameId: resolvedFrameId,
        usage,
        result,
      }));
    },
    [scheduleFlush],
  );

  return { ...state, loading, send, reset };
}