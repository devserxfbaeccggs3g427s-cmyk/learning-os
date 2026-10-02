/**
 * OpenRouter provider. Compatible with the OpenAI Chat Completions API,
 * which is what OpenRouter exposes.
 *
 * Supports:
 *  - chat (non-streaming)
 *  - stream (Server-Sent Events)
 *  - generateStructured (response_format=json_object + Zod validation)
 *  - listModels (/models)
 */
import { z } from "zod";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  ModelInfo,
  StreamChunk,
  StructuredRequest,
  StructuredResponse,
} from "./provider";
import { AIProviderError } from "./provider";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

interface OpenRouterOptions {
  baseUrl?: string;
  apiKey?: string;
  /** Optional extra HTTP headers (e.g. OpenRouter app attribution). */
  extraHeaders?: Record<string, string>;
}

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
}

interface ChatCompletionChoice {
  /** Non-streaming response: full message. */
  message?: { role?: string; content?: string };
  /** Streaming chunk: incremental message content. */
  delta?: { role?: string; content?: string };
  finish_reason?: string;
}

interface ChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

interface ModelsListResponse {
  data?: Array<{
    id: string;
    name?: string;
    context_length?: number;
    pricing?: { prompt?: string | number; completion?: string | number };
  }>;
}

export class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter";
  readonly displayName = "OpenRouter";

  constructor(private readonly opts: OpenRouterOptions = {}) {}

  private base() {
    return (this.opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "content-type": "application/json",
      ...this.opts.extraHeaders,
    };
    if (this.opts.apiKey) h["authorization"] = `Bearer ${this.opts.apiKey}`;
    return h;
  }

  private classify(err: unknown): AIProviderError {
    const e = err as { status?: number; message?: string };
    const status = e?.status;
    if (status === 401 || status === 403) {
      return new AIProviderError("invalid_key", e?.message ?? "Invalid API key", this.id, err);
    }
    if (status === 429) {
      return new AIProviderError("rate_limited", "Rate limited", this.id, err);
    }
    if (status === 408) {
      return new AIProviderError("timeout", "Request timed out", this.id, err);
    }
    if (status && status >= 500) {
      return new AIProviderError("provider_failure", "Provider unavailable", this.id, err);
    }
    return new AIProviderError("provider_failure", e?.message ?? "Unknown error", this.id, err);
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    try {
      const res = await fetch(`${this.base()}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.4,
          max_tokens: req.maxTokens ?? 2000,
          stream: false,
          ...(req.options ?? {}),
        }),
        signal: req.signal,
      });
      if (!res.ok) throw Object.assign(new Error(await res.text()), { status: res.status });
      const json = (await res.json()) as ChatCompletionResponse;
      const text = json.choices?.[0]?.message?.content ?? "";
      return {
        text,
        provider: this.id,
        model: json.model ?? req.model,
        usage: json.usage
          ? {
              inputTokens: json.usage.prompt_tokens,
              outputTokens: json.usage.completion_tokens,
              costUsd: json.usage.cost,
            }
          : undefined,
        raw: json,
      };
    } catch (err) {
      throw this.classify(err);
    }
  }

  async stream(req: ChatRequest, onChunk: (c: StreamChunk) => void): Promise<ChatResponse> {
    let res: Response;
    try {
      res = await fetch(`${this.base()}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.4,
          max_tokens: req.maxTokens ?? 2000,
          stream: true,
          ...(req.options ?? {}),
        }),
        signal: req.signal,
      });
      if (!res.ok || !res.body) {
        throw Object.assign(new Error(await res.text()), { status: res.status });
      }
    } catch (err) {
      throw this.classify(err);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";
    let usage: ChatResponse["usage"] | undefined;
    let model = req.model;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          onChunk({ delta: "", done: true, usage });
          continue;
        }
        try {
          const json = JSON.parse(payload) as ChatCompletionResponse;
          if (json.model) model = json.model;
          const delta = json.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            acc += delta;
            onChunk({ delta });
          }
          if (json.usage) {
            usage = {
              inputTokens: json.usage.prompt_tokens,
              outputTokens: json.usage.completion_tokens,
              costUsd: json.usage.cost,
            };
          }
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
    return { text: acc, provider: this.id, model, usage };
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    // type-only re-assertion: see lib/ai/provider.ts for why.
    const json = z
      .object({
        schema: z.unknown(),
        strict: z.boolean().default(true),
        name: z.string().default("structured_output"),
      })
      .partial()
      .parse({});
    void json; // currently unused, kept for documentation.

    // Strategy: ask the model for JSON via response_format=json_object, then
    // validate against the Zod schema. If validation fails, throw
    // malformed_output so the caller can decide to repair / retry.
    const messages: ChatRequest["messages"] = [
      ...req.messages,
      {
        role: "user",
        content:
          "IMPORTANT: Respond with ONLY valid JSON that matches the requested schema. No prose, no markdown code fences.",
      },
    ];
    const res = await this.chat({
      ...req,
      messages,
      options: { response_format: { type: "json_object" } },
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text);
    } catch (err) {
      // try to recover from ```json``` fences
      const m = res.text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m?.[1]) {
        try {
          parsed = JSON.parse(m[1]);
        } catch {
          throw new AIProviderError("malformed_output", "Model returned invalid JSON", this.id, err);
        }
      } else {
        throw new AIProviderError(
          "malformed_output",
          "Model returned invalid JSON",
          this.id,
          err,
        );
      }
    }
    const result = req.schema.safeParse(parsed);
    if (!result.success) {
      throw new AIProviderError(
        "malformed_output",
        "Model output did not match schema: " + result.error.message,
        this.id,
      );
    }
    return { data: result.data, raw: res.text, provider: this.id, model: res.model, usage: res.usage };
  }

  async listModels(apiKey?: string, baseUrl?: string): Promise<ModelInfo[]> {
    const url = `${(baseUrl ?? this.opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")}/models`;
    const headers: Record<string, string> = {};
    if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
    const r = await fetch(url, { headers });
    if (!r.ok) {
      throw new AIProviderError(
        "provider_failure",
        `Failed to list models (${r.status})`,
        this.id,
      );
    }
    const json = (await r.json()) as ModelsListResponse;
    return (json.data ?? []).map((m) => ({
      id: m.id,
      displayName: m.name,
      contextWindow: m.context_length,
      pricing: m.pricing
        ? {
            inputPer1k: typeof m.pricing.prompt === "string" ? Number(m.pricing.prompt) : m.pricing.prompt,
            outputPer1k:
              typeof m.pricing.completion === "string" ? Number(m.pricing.completion) : m.pricing.completion,
          }
        : undefined,
    }));
  }

  async testConnection(
    apiKey?: string,
    baseUrl?: string,
  ): Promise<{ ok: boolean; message?: string }> {
    // OpenRouter's /models endpoint is public, so we make a tiny chat call
    // to verify the API key actually authenticates.
    if (!apiKey) {
      return { ok: false, message: "No API key provided." };
    }
    try {
      const url = `${(baseUrl ?? this.opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")}/chat/completions`;
      const r = await fetch(url, {
        method: "POST",
        headers: { ...this.headers(), authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });
      if (!r.ok) {
        const text = await r.text();
        if (r.status === 401 || r.status === 403) {
          return { ok: false, message: "Invalid API key." };
        }
        return { ok: false, message: `${r.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true, message: "Connection works." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  }
}