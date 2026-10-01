"use client";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { Send, Loader2, MessageCircleQuestion, Sparkles, Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConversationList, type ConversationMessage } from "@/lib/ai/useConversationList";

interface AITutorProps {
  userId: string;
  taskId: string;
  taskTitle: string;
  note: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const QUICK = [
  { label: "Explain this", prompt: "Explain this task to me from scratch." },
  { label: "Why it matters", prompt: "Why does this matter in production?" },
  { label: "Internals", prompt: "Walk me through the internals." },
  { label: "Failure mode", prompt: "What is the most common production failure mode for this?" },
  { label: "Example", prompt: "Show me a concrete code example." },
  { label: "Interview Q", prompt: "Ask me one interview question on this task." },
];

export function AITutor({ userId, taskId, taskTitle, note }: AITutorProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const { list, refresh } = useConversationList({ userId, mode: "TUTOR", taskId });

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

  async function send(prompt: string) {
    if (!prompt.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    setLoading(true);

    const r = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, taskId, mode: "TUTOR", prompt, conversationId }),
    });
    if (!r.body) {
      setLoading(false);
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
    let newConvId = conversationId;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      const lines = chunk.split("\n\n");
      for (const l of lines) {
        const m = l.match(/^data: (.*)$/);
        if (!m) continue;
        try {
          const obj = JSON.parse(m[1]!);
          if (obj.type === "delta" && typeof obj.text === "string") {
            acc += obj.text;
            setMessages((cur) => {
              const copy = [...cur];
              const last = copy[copy.length - 1];
              if (last?.streaming) {
                copy[copy.length - 1] = { role: "assistant", content: acc, streaming: true };
              } else {
                copy.push({ role: "assistant", content: acc, streaming: true });
              }
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
        } catch {
          /* ignore parse */
        }
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
      const msgs: ChatMsg[] = (j.messages ?? []).map((m: ConversationMessage) => ({
        role: m.role === "USER" ? "user" : "assistant",
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
    <div className="grid gap-3 lg:grid-cols-[260px_1fr_280px]">
      {/* History sidebar */}
      <Card className="flex h-[60vh] min-h-0 flex-col overflow-hidden lg:h-[calc(100vh-200px)]">
        <CardHeader className="shrink-0 border-b border-border p-3">
          <Button size="sm" onClick={startNewChat} className="w-full">
            <Plus className="h-4 w-4" /> New chat
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 gap-1 overflow-y-auto p-2 scroll-thin">
          {list.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No saved conversations for this task yet.
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
        </CardContent>
      </Card>

      {/* Chat pane */}
      <Card className="flex h-[60vh] min-h-0 flex-col overflow-hidden lg:h-[calc(100vh-200px)]">
        <CardHeader className="shrink-0 border-b border-border">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Tutor · {taskTitle}
          </CardTitle>
        </CardHeader>
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 scroll-thin"
        >
          {messages.length === 0 && !loadingHistory && (
            <div className="rounded-md bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
              Ask anything. I'll keep them tied to your task and notes.
            </div>
          )}
          {loadingHistory && (
            <div className="rounded-md bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
              Loading conversation…
            </div>
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
                {m.role === "assistant" ? (
                  <MarkdownRenderer source={m.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex gap-2">
            <Input
              placeholder="Ask the tutor…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              disabled={loading}
            />
            <Button onClick={() => send(input)} disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>

      {/* Quick actions */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {QUICK.map((q) => (
            <button
              key={q.label}
              onClick={() => send(q.prompt)}
              disabled={loading}
              className="rounded-md border border-border bg-background p-2 text-left text-xs hover:bg-accent disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
          <div className="mt-2 text-[10px] text-muted-foreground">
            Conversations auto-save per task. <span className="font-mono">{note.length}</span> chars of notes available as context.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}