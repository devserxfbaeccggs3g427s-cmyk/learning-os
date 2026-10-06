"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, TriangleAlert } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { useTaskLinks } from "@/lib/ai/useTaskLinks";
import { resolveTaskLinks } from "@/lib/ai/resolveTaskLinks";
import { copyPlainText } from "@/lib/utils/clipboard";

export interface MessageBubbleProps {
  role: "user" | "assistant" | "assistant-stream";
  content: string;
  className?: string;
  maxWidthClass?: string;
}

function MessageBubbleInner({ role, content, className, maxWidthClass = "max-w-[85%]" }: MessageBubbleProps) {
  const isUser = role === "user";
  const isCompleteAssistant = role === "assistant";
  const links = useTaskLinks();
  const resolved = useMemo(() => resolveTaskLinks(content, links), [content, links]);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "success" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyAttempt = useRef(0);

  const clearResetTimer = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
  }, []);

  const handleCopy = useCallback(async () => {
    clearResetTimer();
    const attempt = ++copyAttempt.current;
    setCopyState("copying");
    try {
      await copyPlainText(content);
      if (attempt !== copyAttempt.current) return;
      setCopyState("success");
    } catch {
      if (attempt !== copyAttempt.current) return;
      setCopyState("error");
    }
    resetTimer.current = setTimeout(() => setCopyState("idle"), 2_000);
  }, [clearResetTimer, content]);

  useEffect(() => {
    copyAttempt.current += 1;
    setCopyState("idle");
    return () => {
      copyAttempt.current += 1;
      clearResetTimer();
    };
  }, [clearResetTimer, content]);

  const copyLabel = copyState === "copying"
    ? "Copying…"
    : copyState === "success"
      ? "Copied"
      : copyState === "error"
        ? "Retry copy"
        : "Copy raw Markdown";
  const copyStatus = copyState === "success"
    ? "Raw Markdown copied to clipboard."
    : copyState === "error"
      ? "Could not copy raw Markdown. Try again."
      : "";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          maxWidthClass,
          "rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "border border-border bg-card",
          className,
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            <MarkdownRenderer source={resolved} />
            {isCompleteAssistant && content.length > 0 && (
              <div className="mt-2 flex items-center justify-end gap-2">
                <span
                  className={copyState === "error" ? "text-xs text-destructive" : "sr-only"}
                  role="status"
                  aria-live="polite"
                >
                  {copyStatus}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => void handleCopy()}
                  disabled={copyState === "copying"}
                  aria-label="Copy raw Markdown"
                  title="Copy raw Markdown"
                >
                  {copyState === "copying" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : copyState === "success" ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : copyState === "error" ? (
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copyLabel}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleInner);