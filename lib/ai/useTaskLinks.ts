"use client";
import { useEffect, useState } from "react";

export type TaskLinks = Record<string, { id: string; title: string }>;

/**
 * Fetches the small code → {id, title} map and caches it for the session.
 *
 * The map is tiny (a couple KB) so we cache it in module scope: every
 * component in the chat window shares the same fetch + result.
 */
let _cache: TaskLinks | null = null;
let _inflight: Promise<TaskLinks> | null = null;
const _listeners = new Set<(m: TaskLinks) => void>();

async function fetchOnce(): Promise<TaskLinks> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    const r = await fetch("/api/ai/task-links", { cache: "no-store" });
    if (!r.ok) return {};
    const j = (await r.json()) as TaskLinks;
    _cache = j;
    for (const cb of _listeners) cb(j);
    return j;
  })();
  return _inflight;
}

/** Eager-load. Call from a top-level component so the map is ready by the
 *  time the first AI message finishes streaming. */
export function preloadTaskLinks(): void {
  void fetchOnce();
}

export function getCachedTaskLinks(): TaskLinks {
  return _cache ?? {};
}

export function useTaskLinks(): TaskLinks {
  const [state, setState] = useState<TaskLinks>(_cache ?? {});
  useEffect(() => {
    if (_cache) return;
    let active = true;
    fetchOnce().then((m) => {
      if (active) setState(m);
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}