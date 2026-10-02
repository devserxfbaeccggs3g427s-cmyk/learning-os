"use client";
import { memo, useMemo } from "react";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { cn } from "@/lib/utils/cn";
import { useTaskLinks } from "@/lib/ai/useTaskLinks";
import { resolveTaskLinks } from "@/lib/ai/resolveTaskLinks";

export interface MessageBubbleProps {
  role: "user" | "assistant" | "assistant-stream";
  content: string;
  className?: string;
  maxWidthClass?: string;
}

function MessageBubbleInner({ role, content, className, maxWidthClass = "max-w-[85%]" }: MessageBubbleProps) {
  const isUser = role === "user";
  const links = useTaskLinks();
  const resolved = useMemo(() => resolveTaskLinks(content, links), [content, links]);
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
          <MarkdownRenderer source={resolved} />
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleInner);