"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, Button, Textarea } from "@/components/ui";
import { ChatTranscript } from "@/components/ai/ChatTranscript";
import { ChatModeToggle } from "@/components/ai/ChatModeToggle";
import { ChatSuggestions } from "@/components/ai/ChatSuggestions";
import { Send, Loader2, Sparkles, MessageSquare, Plus, Wand2 } from "lucide-react";
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

const MAX_TRANSCRIPT_CHARS = 2_000;

function buildChatContext(messages: ChatMsg[]): string {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastAssistant) return "";
  const userPart = lastUser ? `User: ${lastUser.content.trim()}\n\n` : "";
  const aiPart = `Assistant: ${lastAssistant.content.trim()}`;
  const joined = `${userPart}${aiPart}`;
  if (joined.length <= MAX_TRANSCRIPT_CHARS) return joined;
  return `…${joined.slice(-MAX_TRANSCRIPT_CHARS)}`;
}

export function AITutor({ userId, taskId, taskTitle, note }: AITutorProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { list, refresh } = useConversationList({ userId, mode: "TUTOR", taskId });
  const stream = useStreamedChat();
  const [mode] = useChatMode();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [aiResponseTick, setAiResponseTick] = useState(0);

  const chatScope = messages.length > 0 ? "has" : "empty";
  const chatContext = useMemo(() => buildChatContext(messages), [messages]);

  const suggestions = usePromptSuggestions({
    userId,
    mode: "TUTOR",
    taskId,
    fallbackTopics: TUTOR_PROMPT_TOPICS(taskTitle),
    useLocalStorage: true,
    refreshTrigger: aiResponseTick,
    chatContext,
    chatScope,
  });

  const thinking = stream.loading && !stream.text;
  const isStreaming = stream.loading || !!stream.text;

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
    setAiResponseTick((t) => t + 1);
    stream.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.done]);

  function send(prompt: string) {
    if (!prompt.trim() || stream.loading) return;
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    // Refresh suggestions so the empty→has transition fetches follow-ups
    // even before the first response lands.
    setAiResponseTick((t) => t + 1);
    stream.send({ userId, taskId, mode: "TUTOR", prompt, conversationId, renderMode: mode });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
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
      // Refresh suggestions to follow-ups for the newly-loaded conversation.
      setAiResponseTick((t) => t + 1);
    } finally {
      setLoadingHistory(false);
    }
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    // Re-fetch task-anchored starter suggestions since the chat is empty again.
    setAiResponseTick((t) => t + 1);
  }

  // Auto-grow the textarea up to ~5 lines.
  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* History sidebar */}
      <Card className="flex h-full flex-col border-border/80 shadow-sm">
        <div className="shrink-0 border-b border-border p-4">
          <Button size="lg" onClick={startNewChat} className="w-full">
            <Plus className="h-4 w-4" /> New chat
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 scroll-thin">
          {list.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No saved conversations for this task yet.
            </p>
          )}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
                c.id === conversationId && "bg-accent",
              )}
            >
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2 flex-1 leading-snug">{c.title}</span>
            </button>
          ))}
        </div>
        {/* Notes context hint */}
        <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">{note.length}</span> chars of notes available as context. Conversations auto-save per task.
          </p>
        </div>
      </Card>

      {/* Chat pane */}
      <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/80 shadow-sm">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold leading-tight">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="line-clamp-1 min-w-0 flex-1">AI Tutor · {taskTitle}</span>
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ask anything. Answers are grounded in your task notes and the roadmap.
          </p>
        </div>

        {/* Suggestions row — hidden while streaming */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 scroll-thin">
          {loadingHistory ? (
            <div className="rounded-md bg-muted/30 p-6 text-sm leading-6 text-muted-foreground">
              Loading conversation…
            </div>
          ) : (
            <ChatTranscript
              items={messages.map((m, i) => ({ id: i, role: m.role, content: m.content }))}
              streamingText={stream.text}
              thinking={thinking}
              className="space-y-4 p-6"
              bubbleMaxWidthClass="max-w-[78%]"
              emptyState={
                <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Wand2 className="h-7 w-7" />
                  </div>
                  <h3 className="text-base font-semibold">Ask anything about this task</h3>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    I'll tie every answer to your task and notes. Try one of the suggested prompts above, or type your own.
                  </p>
                </div>
              }
            />
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-border bg-card p-4 pt-3">
          {!isStreaming && (
            <ChatSuggestions
              topics={suggestions.topics}
              onSelect={(p) => send(p)}
              disabled={stream.loading}
              loading={suggestions.loading}
              error={suggestions.error}
              source={suggestions.source}
              onRefresh={suggestions.refresh}
              className="mb-2"
            />
          )}
          <div className="flex items-end gap-3">
            <div className="flex h-11 shrink-0 items-center">
              <ChatModeToggle />
            </div>
            <div className="flex-1">
              <Textarea
                ref={textareaRef}
                rows={1}
                placeholder="Ask the tutor… (Enter to send, Shift+Enter for newline)"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autosize(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                disabled={stream.loading}
                className="min-h-[44px] resize-none px-4 py-2.5 text-sm leading-relaxed"
              />
            </div>
            <Button
              size="lg"
              onClick={() => send(input)}
              disabled={stream.loading || !input.trim()}
              className="h-11 px-5"
            >
              {stream.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span className="ml-1.5 hidden sm:inline">Send</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}