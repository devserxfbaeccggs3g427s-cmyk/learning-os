"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number | string;
}

export interface ConversationMessage {
  id: string;
  role: "SYSTEM" | "USER" | "ASSISTANT" | "TOOL" | string;
  content: string;
  createdAt: string;
  metadata?: unknown;
}

export interface UseConversationListArgs {
  userId?: string;
  mode?: string;
  taskId?: string | null;
  /** "global" → only conversations where taskId IS NULL (for /ai page). */
  scope?: "global" | "task";
}

export interface UseConversationListReturn {
  list: ConversationSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMessages: (id: string) => Promise<ConversationMessage[]>;
  remove: (id: string) => Promise<boolean>;
  deletingId: string | null;
  deleteError: string | null;
}

/**
 * Shared hook for fetching the list of AI conversations for a given
 * user/mode/task scope. Used by GlobalAIChat, AITutor, TaskWorkspace.
 */
export function useConversationList(args: UseConversationListArgs): UseConversationListReturn {
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const removedIds = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (args.userId) q.set("userId", args.userId);
      if (args.mode) q.set("mode", args.mode);
      if (args.taskId) q.set("taskId", args.taskId);
      if (args.scope) q.set("scope", args.scope);
      const r = await fetch(`/api/ai/conversations?${q.toString()}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const j = await r.json();
      setList((j.conversations ?? []).filter((c: ConversationSummary) => !removedIds.current.has(c.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [args.userId, args.mode, args.taskId, args.scope]);

  const loadMessages = useCallback(async (id: string): Promise<ConversationMessage[]> => {
    const q = args.userId ? `?userId=${encodeURIComponent(args.userId)}` : "";
    const r = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}${q}`);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error ?? `HTTP ${r.status}`);
    }
    const j = await r.json();
    return j.messages ?? [];
  }, [args.userId]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (deletingRef.current) return false;
    deletingRef.current = true;
    setDeletingId(id);
    setDeleteError(null);
    try {
      const r = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      removedIds.current.add(id);
      setList((cur) => cur.filter((c) => c.id !== id));
      return true;
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete conversation");
      return false;
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { list, loading, error, refresh, loadMessages, remove, deletingId, deleteError };
}