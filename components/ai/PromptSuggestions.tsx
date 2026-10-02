"use client";
import { useState } from "react";
import { ChevronDown, MessageCircleQuestion, RefreshCw, AlertCircle, Sparkles, Wand2 } from "lucide-react";
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
 * Topic-grouped prompt suggestions. Each topic is a generous card with a
 * header that toggles open/closed. Expanded topics reveal full-width prompt
 * buttons with comfortable click targets and readable text.
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
    <div className={cn("flex h-full flex-col rounded-xl border border-border bg-card shadow-sm", className)}>
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold leading-tight">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageCircleQuestion className="h-4 w-4" />
            </span>
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={disabled || loading}
            aria-label="Regenerate suggestions"
            title="Regenerate from AI"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        )}
      </div>

      {/* Source / error chips */}
      {(sourceLabel || error) && (
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-border bg-muted/30 px-5 py-2.5">
          {sourceLabel && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {source === "fresh" ? (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              ) : source === "cache" ? (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {sourceLabel}
            </p>
          )}
          {error && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>
      )}

      {/* Topic list */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scroll-thin">
        {topics.map((t) => {
          const open = openId === t.id;
          return (
            <div key={t.id} className="overflow-hidden rounded-lg border border-border/80 bg-background">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : t.id)}
                disabled={disabled}
                aria-expanded={open}
                className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
              >
                <span className="text-sm font-semibold leading-tight">{t.title}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
                    open && "rotate-180",
                  )}
                />
              </button>
              {open && (
                <div className="space-y-2 border-t border-border bg-muted/20 px-3 py-3">
                  {t.description && (
                    <p className="px-1 pb-1 text-xs leading-relaxed text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                  {t.prompts.map((p, i) => (
                    <button
                      key={`${t.id}-${i}`}
                      type="button"
                      onClick={() => onSelect(p.prompt)}
                      disabled={disabled}
                      className="block w-full rounded-md px-4 py-2.5 text-left text-sm leading-relaxed transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      title={p.prompt}
                    >
                      <span className="block font-medium">{p.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}