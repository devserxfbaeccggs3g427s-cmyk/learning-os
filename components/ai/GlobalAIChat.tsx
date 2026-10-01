"use client";
import { useState } from "react";
import { Card, CardContent, Input, Button } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown/Renderer";
import { Send, Loader2 } from "lucide-react";

interface GlobalAIChatProps { userId: string }

interface Msg { role: "user" | "assistant"; content: string; streaming?: boolean }

export function GlobalAIChat({ userId }: GlobalAIChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    const r = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, mode: "GLOBAL", prompt: input }),
    });
    if (!r.body) { setLoading(false); return; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
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
          }
        } catch {}
      }
    }
    setMessages((cur) => {
      const copy = [...cur];
      const idx = copy.findIndex((m) => m.streaming);
      if (idx >= 0) copy[idx] = { role: "assistant", content: acc };
      return copy;
    });
    setLoading(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/10 p-4 scroll-thin">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask anything across your roadmap.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card"
              }`}
            >
              {m.role === "assistant" ? <MarkdownRenderer source={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
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
    </div>
  );
}