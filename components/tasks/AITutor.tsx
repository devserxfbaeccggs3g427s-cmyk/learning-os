"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from "@/components/ui";
import { ChatTranscript } from "@/components/ai/ChatTranscript";
import { ChatModeToggle } from "@/components/ai/ChatModeToggle";
import { PromptSuggestions } from "@/components/ai/PromptSuggestions";
import { Send, Loader2, MessageCircleQuestion, Sparkles, Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConversationList, type ConversationMessage } from "@/lib/ai/useConversationList";
import { useStreamedChat } from "@/lib/ai/useStreamedChat";
import { useChatMode } from "@/lib/ai/useChatMode";
import { usePromptSuggestions } from "@/lib/ai/usePromptSuggestions";
import { TUTOR_PROMPT_TOPICS } from "@/lib/ai/suggestions";

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

export function AITutor({ userId, taskId, taskTitle, note }: AITutorProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { list, refresh } = useConversationList({ userId, mode: "TUTOR", taskId });
  const stream = useStreamedChat();
  const [mode] = useChatMode();
  const suggestions = usePromptSuggestions({
    userId,
    mode: "TUTOR",
    taskId,
    fallbackTopics: TUTOR_PROMPT_TOPICS(taskTitle),
  });
  const thinking = stream.loading && !stream.text;

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

  function send(prompt: string) {
    if (!prompt.trim() || stream.loading) return;
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    stream.send({ userId, taskId, mode: "TUTOR", prompt, conversationId, renderMode: mode });
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
        <div className="min-h-0 flex-1 overflow-y-auto p-3 scroll-thin">
          {loadingHistory ? (
            <div className="rounded-md bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
              Loading conversation…
            </div>
          ) : (
            <ChatTranscript
              items={messages.map((m, i) => ({ id: i, role: m.role, content: m.content }))}
              streamingText={stream.text}
              thinking={thinking}
              className="space-y-2"
              emptyState={
                <div className="rounded-md bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
                  Ask anything. I'll keep them tied to your task and notes.
                </div>
              }
            />
          )}
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-center gap-2">
            <ChatModeToggle />
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
              disabled={stream.loading}
            />
            <Button onClick={() => send(input)} disabled={stream.loading || !input.trim()}>
              {stream.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>

      {/* Suggested questions by topic */}
      <div className="space-y-3">
        <PromptSuggestions
          topics={suggestions.topics}
          onSelect={(p) => send(p)}
          disabled={stream.loading}
          loading={suggestions.loading}
          error={suggestions.error}
          source={suggestions.source}
          onRefresh={suggestions.refresh}
          defaultOpenId={suggestions.topics[0]?.id}
          title="Prompt ideas"
          subtitle="Click any prompt to send it."
        />
        <div className="rounded-md border border-dashed border-border p-3 text-[10px] leading-relaxed text-muted-foreground">
          Conversations auto-save per task. <span className="font-mono">{note.length}</span> chars of notes available as context.
        </div>
      </div>
    </div>
  );
}