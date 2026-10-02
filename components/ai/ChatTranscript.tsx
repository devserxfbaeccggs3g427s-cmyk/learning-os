"use client";
import { useLayoutEffect, useRef } from "react";
import { MessageBubble, type MessageBubbleProps } from "./MessageBubble";
import { StreamingBubble } from "./StreamingBubble";
import { ThinkingDots } from "./ThinkingDots";

export interface ChatTranscriptItem {
  id: string | number;
  role: "user" | "assistant" | "assistant-stream";
  content: string;
}

interface ChatTranscriptProps {
  items: ChatTranscriptItem[];
  streamingText: string;
  /** While true, render thinking dots regardless of `streamingText`. */
  thinking?: boolean;
  className?: string;
  contentClassName?: string;
  /** Pixel distance from bottom that still counts as "stick to bottom". */
  stickThreshold?: number;
  /** Max width class for both bubbles. */
  bubbleMaxWidthClass?: string;
  /** Rendered when there are no items and no streaming text. */
  emptyState?: React.ReactNode;
}

/**
 * Scrollable chat transcript.
 *
 * Why this is split from the parent:
 *  - When `streamingText` changes (every animation frame during streaming),
 *    React would normally re-render the whole chat pane including the
 *    sidebar / input bar / etc. By isolating the transcript, only this
 *    component re-renders, and inside it only `<StreamingBubble>` (which is
 *    `React.memo`-ed) actually re-mounts.
 *  - Auto-scroll uses `useLayoutEffect` so it runs *after* DOM mutations
 *    but *before* the browser paints — combined with rAF-batched state
 *    updates from `useStreamedChat`, this collapses to one layout+ paint
 *    per frame, eliminating the jitter from a post-paint `useEffect`.
 */
export function ChatTranscript({
  items,
  streamingText,
  thinking,
  className,
  contentClassName = "space-y-3",
  stickThreshold = 80,
  bubbleMaxWidthClass,
  emptyState,
}: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user has scrolled away from the bottom. We only
  // force-scroll while they're following along.
  const stickToBottom = useRef(true);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distFromBottom < stickThreshold;
  }

  // useLayoutEffect runs synchronously after DOM update and before paint,
  // so the browser performs a single layout + paint per streaming update.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [items, streamingText, thinking]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={className}
    >
      {items.length === 0 && !streamingText && !thinking && emptyState}
      {items.map((m) => (
        <MessageBubble
          key={m.id}
          role={m.role}
          content={m.content}
          maxWidthClass={bubbleMaxWidthClass}
        />
      ))}
      {(thinking || streamingText) && (
        <div className="flex justify-start">
          <div
            className={
              bubbleMaxWidthClass
                ? `${bubbleMaxWidthClass} rounded-lg border border-border bg-card px-3 py-2 text-sm`
                : "max-w-[85%] rounded-lg border border-border bg-card px-3 py-2 text-sm"
            }
          >
            {streamingText ? <StreamingBubble text={streamingText} /> : <ThinkingDots />}
          </div>
        </div>
      )}
    </div>
  );
}