"use client";
import { memo } from "react";
import { useChatMode, type ChatMode } from "@/lib/ai/useChatMode";
import { cn } from "@/lib/utils/cn";
import { Zap, Loader2 } from "lucide-react";

function ChatModeToggleInner() {
  const [mode, setMode] = useChatMode();
  return (
    <div className="inline-flex shrink-0 items-center rounded-md border border-border bg-background p-0.5 text-[10px]">
      <button
        type="button"
        onClick={() => setMode("stream")}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1",
          mode === "stream" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={mode === "stream"}
        title="Hiện từng phần khi AI trả lời"
      >
        <Zap className="h-3 w-3" /> Stream
      </button>
      <button
        type="button"
        onClick={() => setMode("wait")}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1",
          mode === "wait" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={mode === "wait"}
        title="Chờ AI hoàn thành rồi mới hiện (mượt hơn)"
      >
        <Loader2 className="h-3 w-3" /> Wait
      </button>
    </div>
  );
}

export const ChatModeToggle = memo(ChatModeToggleInner);
export type { ChatMode };