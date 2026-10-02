"use client";
import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
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

function flatten(topics: PromptTopic[], max: number): { item: PromptItem }[] {
  const out: { item: PromptItem }[] = [];
  for (const t of topics) {
    for (const p of t.prompts) {
      if (out.length >= max) return out;
      out.push({ item: p });
    }
  }
  return out;
}

/**
 * Compact 3-pill chip strip rendered immediately above the composer — no
 * header text, no chrome. Just suggestions you can click.
 */
export function ChatSuggestions({
  topics,
  onSelect,
  disabled,
  className,
  loading,
  error,
  onRefresh,
}: ChatSuggestionsProps) {
  const cards = flatten(topics, 3);
  const [hovered, setHovered] = useState<number | null>(null);
  if (cards.length === 0) return null;

  return (
    <div className={cn("shrink-0 pt-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {cards.map(({ item }, idx) => {
          const isHovered = hovered === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelect(item.prompt)}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered((h) => (h === idx ? null : h))}
              onFocus={() => setHovered(idx)}
              onBlur={() => setHovered((h) => (h === idx ? null : h))}
              disabled={disabled}
              title={item.prompt}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
                "hover:bg-accent hover:text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
                isHovered ? "border-primary/40 bg-accent" : "border-border/70 bg-background",
              )}
            >
              <span className="truncate font-normal">{item.label}</span>
            </button>
          );
        })}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={disabled || loading}
            aria-label="Regenerate suggestions"
            title="Regenerate"
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all",
              "hover:bg-accent hover:text-foreground",
              "disabled:opacity-50",
              hovered === null ? "opacity-0" : "opacity-100",
            )}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
        )}
        {error && hovered === null && (
          <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}