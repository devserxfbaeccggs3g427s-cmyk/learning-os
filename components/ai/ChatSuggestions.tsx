"use client";
import { useState } from "react";
import { MessageCircleQuestion, RefreshCw, AlertCircle, Sparkles, Wand2, ArrowRight, Loader2 } from "lucide-react";
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

interface ChatSuggestionsProps {
  topics: PromptTopic[];
  /** Called with the full prompt string when a suggestion card is clicked. */
  onSelect: (prompt: string) => void;
  /** Disable all interaction (e.g. while a stream is loading). */
  disabled?: boolean;
  className?: string;
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
 * Flatten topic-organized prompts into a list and cap at 3 cards.
 * If topics contain more, we keep the first prompt of the first 3 topics
 * (or first 3 prompts of a single topic).
 */
function flatten(topics: PromptTopic[], max: number): { topic: PromptTopic; item: PromptItem }[] {
  const out: { topic: PromptTopic; item: PromptItem }[] = [];
  for (const t of topics) {
    for (const p of t.prompts) {
      if (out.length >= max) return out;
      out.push({ topic: t, item: p });
    }
  }
  return out;
}

const sourceLabelMap: Record<NonNullable<ChatSuggestionsProps["source"]>, { label: string; icon: React.ReactNode }> = {
  fresh: { label: "Personalized by AI", icon: <Sparkles className="h-3 w-3 text-primary" /> },
  cache: { label: "From cache", icon: <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> },
  fallback: { label: "Generic starter set", icon: <Wand2 className="h-3 w-3" /> },
};

/**
 * Inline chat suggestions. Renders up to 3 horizontal cards above the chat
 * composer. Designed to live INSIDE the chat card (not as a sidebar).
 *
 * Visibility is controlled by the caller — typical rule: show when chat is
 * empty OR when the AI finished a response; hide while streaming.
 */
export function ChatSuggestions({
  topics,
  onSelect,
  disabled,
  className,
  loading,
  error,
  source,
  onRefresh,
}: ChatSuggestionsProps) {
  const cards = flatten(topics, 3);
  const [hovered, setHovered] = useState<number | null>(null);
  const sourceInfo = source ? sourceLabelMap[source] : null;

  if (cards.length === 0) return null;

  return (
    <div className={cn("shrink-0 border-b border-border bg-muted/20 px-5 py-4", className)}>
      {/* Status row */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <MessageCircleQuestion className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">Suggested for you</span>
          {sourceInfo && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px]">
              {sourceInfo.icon}
              {sourceInfo.label}
            </span>
          )}
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={disabled || loading}
            aria-label="Regenerate suggestions"
            title="Regenerate from AI"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {/* Cards grid */}
      <div className="grid gap-2.5 sm:grid-cols-3">
        {cards.map(({ topic, item }, i) => {
          const isHovered = hovered === i;
          return (
            <button
              key={`${topic.id}-${i}`}
              type="button"
              onClick={() => onSelect(item.prompt)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((h) => (h === i ? null : h))}
              disabled={disabled}
              title={item.prompt}
              className={cn(
                "group flex h-full flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-all",
                "hover:border-primary/50 hover:bg-accent hover:shadow-sm",
                "disabled:cursor-not-allowed disabled:opacity-50",
                isHovered ? "border-primary/50 shadow-sm" : "border-border/70",
              )}
            >
              {topic.title && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {topic.title}
                </span>
              )}
              <span className="flex-1 text-sm font-medium leading-snug">
                {item.label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium text-primary transition-opacity",
                  isHovered ? "opacity-100" : "opacity-0",
                )}
              >
                Ask <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}