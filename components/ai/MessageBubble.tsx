"use client";
import { memo } from "react";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { cn } from "@/lib/utils/cn";

export interface MessageBubbleProps {
  role: "user" | "assistant" | "assistant-stream";
  content: string;
  className?: string;
  maxWidthClass?: string;
}

function MessageBubbleInner({ role, content, className, maxWidthClass = "max-w-[85%]" }: MessageBubbleProps) {
  const isUser = role === "user";
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
          <MarkdownRenderer source={content} />
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleInner);