"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ChevronDown, MessageCircleQuestion, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface PromptItem {
  label: string;
  prompt: string;
}

export interface PromptTopic {
  id: string;
  title: string;
  description?: string;
  prompts: PromptItem[];
}

interface PromptSuggestionsProps {
  topics: PromptTopic[];
  /** Called with the full prompt string when a suggestion is clicked. */
  onSelect: (prompt: string) => void;
  /** Disable all interaction (e.g. while a stream is loading). */
  disabled?: boolean;
  className?: string;
  /** Topic id to open by default. Falls back to the first topic. */
  defaultOpenId?: string;
  title?: string;
  subtitle?: string;
  /** True while AI is generating a fresh batch. */
  loading?: boolean;
  /** AI fetch error from the hook. */
  error?: string | null;
  /** Source of the current topics (fallback / cache / fresh). */
  source?: "fallback" | "cache" | "fresh";
  /** Re-fetch from the AI. Hidden when omitted. */
  onRefresh?: () => void;
}

/**
 * Topic-grouped prompt suggestions. Each topic is collapsed by default and
 * expands to reveal its starter questions. Clicking a question fires
 * `onSelect(prompt)` — callers typically send it straight to the chat.
 *
 * Used by both `GlobalAIChat` (cross-task) and `AITutor` (task-scoped).
 */
export function PromptSuggestions({
  topics,
  onSelect,
  disabled,
  className,
  defaultOpenId,
  title = "Suggested questions",
  subtitle = "Pick a topic to see starter prompts.",
  loading,
  error,
  source,
  onRefresh,
}: PromptSuggestionsProps) {
  const initial = defaultOpenId ?? topics[0]?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(initial);

  const sourceLabel =
    source === "fresh"
      ? "Personalized by AI"
      : source === "cache"
        ? "Cached today"
        : source === "fallback"
          ? "Generic starter set"
          : null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageCircleQuestion className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={disabled || loading}
              aria-label="Regenerate suggestions"
              title="Regenerate from AI"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          )}
        </div>
        {sourceLabel && (
          <p className="flex items-center gap-1 pt-1 text-[10px] text-muted-foreground">
            {source === "fresh" ? (
              <Sparkles className="h-3 w-3" />
            ) : source === "cache" ? (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ) : null}
            {sourceLabel}
          </p>
        )}
        {error && (
          <p className="flex items-center gap-1 pt-1 text-[10px] text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {topics.map((t) => {
          const open = openId === t.id;
          return (
            <div key={t.id} className="overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : t.id)}
                disabled={disabled}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                <span className="truncate">{t.title}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
              {open && (
                <div className="space-y-1.5 border-t border-border bg-muted/20 p-2">
                  {t.description && (
                    <p className="px-1 pb-1 text-[10px] leading-snug text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                  {t.prompts.map((p, i) => (
                    <button
                      key={`${t.id}-${i}`}
                      type="button"
                      onClick={() => onSelect(p.prompt)}
                      disabled={disabled}
                      className="block w-full rounded border border-border/60 bg-background px-2 py-1.5 text-left text-xs leading-snug hover:bg-accent disabled:opacity-50"
                      title={p.prompt}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}