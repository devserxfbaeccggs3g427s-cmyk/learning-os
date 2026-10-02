"use client";

import { useEffect, useState } from "react";

const KEY = "ai-chat-mode";

export type ChatMode = "stream" | "wait";

export function useChatMode(): [ChatMode, (m: ChatMode) => void] {
  const [mode, setMode] = useState<ChatMode>("stream");

  // Read preference after mount to avoid SSR/hydration mismatch.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      if (v === "stream" || v === "wait") setMode(v);
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  function update(next: ChatMode) {
    setMode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }

  return [mode, update];
}