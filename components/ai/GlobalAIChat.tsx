"use client";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, Input, Button } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { Send, Loader2, Plus, MessageSquare } from "lucide-react";
import { useConversationList, type ConversationMessage } from "@/lib/ai/useConversationList";
import { cn } from "@/lib/utils/cn";

interface GlobalAIChatProps { userId: string }

interface Msg { role: "user" | "assistant"; content: string; streaming?: boolean }

export function GlobalAIChat({ userId }: GlobalAIChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { list, refresh } = useConversationList({ userId, scope: "global", mode: "GLOBAL" });
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track whether the user is "at the bottom" so we only auto-scroll when
  // they're following along. If they scroll up to read history, don't yank
  // them back to the tail on every streaming delta.
  const stickToBottom = useRef(true);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distFromBottom < 80;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loadingHistory]);

  async function send() {
    if (!input.trim() || loading) return;
    const prompt = input;
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    setLoading(true);

    const r = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, mode: "GLOBAL", prompt, conversationId }),
    });
    if (!r.body) { setLoading(false); return; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
    let newConvId = conversationId;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      for (const l of chunk.split("\n\n")) {
        const m = l.match(/^data: (.*)$/);
        if (!m) continue;
        try {
          const obj = JSON.parse(m[1]!);
          if (obj.type === "delta" && typeof obj.text === "string") {
            acc += obj.text;
            setMessages((cur) => {
              const copy = [...cur];
              const last = copy[copy.length - 1];
              if (last?.streaming) copy[copy.length - 1] = { role: "assistant", content: acc, streaming: true };
              else copy.push({ role: "assistant", content: acc, streaming: true });
              return copy;
            });
          } else if (obj.type === "done") {
            if (obj.conversationId) newConvId = obj.conversationId;
          } else if (obj.type === "error") {
            const msg = `⚠️ ${obj.message ?? "AI request failed"}${obj.kind ? ` (${obj.kind})` : ""}`;
            acc = msg;
            setMessages((cur) => {
              const copy = [...cur];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") copy[copy.length - 1] = { role: "assistant", content: msg };
              else copy.push({ role: "assistant", content: msg });
              return copy;
            });
          }
        } catch {}
      }
    }
    if (newConvId && newConvId !== conversationId) {
      setConversationId(newConvId);
      refresh();
    }
    setLoading(false);
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
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/10 p-4 scroll-thin"
          >
            {messages.length === 0 && !loadingHistory && (
              <p className="text-sm text-muted-foreground">
                Ask anything across your roadmap.
              </p>
            )}
            {loadingHistory && (
              <p className="text-sm text-muted-foreground">Loading conversation…</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card",
                  )}
                >
                  {m.role === "assistant" ? <MarkdownRenderer source={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-border p-3">
            <Input
              placeholder="Ask anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              disabled={loading}
            />
            <Button onClick={send} disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}