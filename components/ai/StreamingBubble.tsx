"use client";
import { memo } from "react";

interface StreamingBubbleProps {
  text: string;
  className?: string;
}

function StreamingBubbleInner({ text, className }: StreamingBubbleProps) {
  return (
    <div className={className}>
      <div className="whitespace-pre-wrap">
        {text}
        <span
          aria-hidden
          className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse bg-current align-baseline opacity-60"
        />
      </div>
    </div>
  );
}

export const StreamingBubble = memo(StreamingBubbleInner);