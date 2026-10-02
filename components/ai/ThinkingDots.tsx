"use client";
import { memo } from "react";

/**
 * Animated "thinking" indicator — three dots that pulse in sequence.
 * Used while waiting for the first token from the model.
 */
function ThinkingDotsInner({ label = "Đang suy nghĩ…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span aria-hidden className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
      </span>
      <span>{label}</span>
    </div>
  );
}

export const ThinkingDots = memo(ThinkingDotsInner);