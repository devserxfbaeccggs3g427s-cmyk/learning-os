"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, Input, Button } from "@/components/ui";
import { ChatTranscript } from "./ChatTranscript";
import { ChatModeToggle } from "./ChatModeToggle";
import { Send, Loader2, Plus, MessageSquare } from "lucide-react";
import { useConversationList, type ConversationMessage } from "@/lib/ai/useConversationList";
import { useStreamedChat } from "@/lib/ai/useStreamedChat";
import { useChatMode } from "@/lib/ai/useChatMode";
import { cn } from "@/lib/utils/cn";

interface GlobalAIChatProps { userId: string }

interface Msg { role: "user" | "assistant"; content: string; streaming?: boolean }

export function GlobalAIChat({ userId }: GlobalAIChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { list, refresh } = useConversationList({ userId, scope: "global", mode: "GLOBAL" });
  const stream = useStreamedChat();
  const [mode] = useChatMode();

  // Show "thinking" dots while the request is in flight but no text yet.
  const thinking = stream.loading && !stream.text;

  // When the streamed message completes, freeze it into `messages` and reset
  // the stream. While `stream.text` is non-empty, ChatTranscript renders it
  // directly without re-parsing markdown.
  useEffect(() => {
    if (!stream.done) return;
    const finalText = stream.error
      ? `⚠️ ${stream.error.message} (${stream.error.kind})`
      : stream.text;
    if (finalText) {
      setMessages((cur) => {
        const copy = [...cur];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant" && last.streaming) {
          copy[copy.length - 1] = { role: "assistant", content: finalText };
        } else if (last?.role !== "assistant" || last.content !== finalText) {
          copy.push({ role: "assistant", content: finalText });
        }
        return copy;
      });
    }
    if (stream.conversationId && stream.conversationId !== conversationId) {
      setConversationId(stream.conversationId);
      refresh();
    }
    stream.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.done]);

  function send() {
    if (!input.trim() || stream.loading) return;
    const prompt = input;
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    stream.send({ userId, mode: "GLOBAL", prompt, conversationId, renderMode: mode });
  }

  async function openConversation(id: string) {
    setLoadingHistory(true);
    setConversationId(id);
    setMessages([]);
    try {
      const q = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const r = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}${q}`);
      if (!r.ok) return;
      const j = await r.json();
      const msgs: Msg[] = (j.messages ?? []).map((m: ConversationMessage) => ({
        role: m.role === "USER" ? "user" : m.role === "ASSISTANT" ? "assistant" : "assistant",
        content: m.content,
      }));
      setMessages(msgs);
    } finally {
      setLoadingHistory(false);
    }
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setInput("");
  }

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[260px_1fr]">
      {/* Sidebar — conversation history */}
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <Button size="sm" onClick={startNewChat} className="w-full shrink-0">
            <Plus className="h-4 w-4" /> New chat
          </Button>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto scroll-thin">
            {list.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No conversations yet — send a message to start.
              </p>
            )}
            {list.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent",
                  c.id === conversationId && "bg-accent",
                )}
              >
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2 flex-1 leading-snug">{c.title}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chat pane */}
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-0 p-0">
          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 scroll-thin">
            {loadingHistory ? (
              <p className="p-4 text-sm text-muted-foreground">Loading conversation…</p>
            ) : (
              <ChatTranscript
                items={messages.map((m, i) => ({ id: i, role: m.role, content: m.content }))}
                streamingText={stream.text}
                thinking={thinking}
                className="space-y-3 p-4"
                emptyState={
                  <p className="text-sm text-muted-foreground">
                    Ask anything across your roadmap.
                  </p>
                }
              />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-border p-3">
            <ChatModeToggle />
            <Input
              placeholder="Ask anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              disabled={stream.loading}
            />
            <Button onClick={send} disabled={stream.loading || !input.trim()}>
              {stream.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}