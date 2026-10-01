/**
 * AI provider abstraction.
 *
 * Business logic (FlashcardService, QuizService, TutorService, etc.) MUST go
 * through this interface and never touch a concrete provider directly.
 *
 * Adding OpenAI / Anthropic / a local provider is a matter of adding a new
 * class that implements AIProvider and registering it in `lib/ai/registry`.
 */
import type { z } from "zod";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** Provider-specific hints (e.g. response_format=json). */
  options?: Record<string, unknown>;
  /** AbortController signal so UI can cancel mid-stream. */
  signal?: AbortSignal;
}

export interface ChatResponse {
  text: string;
  provider: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
  raw?: unknown;
}

export interface StreamChunk {
  delta: string;
  done?: boolean;
  usage?: ChatResponse["usage"];
}

/**
 * Validation strategy for structured generation.
 *  - "schema": provider must respect JSON / tool-calling output.
 *  - "code": we ask for JSON in the prompt and validate ourselves.
 */
export type StructuredStrategy = "schema" | "code";

export interface StructuredRequest<T> {
  messages: ChatMessage[];
  model: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface StructuredResponse<T> {
  data: T;
  raw: string;
  provider: string;
  model: string;
  usage?: ChatResponse["usage"];
}

export interface ModelInfo {
  id: string;
  displayName?: string;
  contextWindow?: number;
  pricing?: { inputPer1k?: number; outputPer1k?: number };
}

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  /**
   * `chat` is non-streaming. Implementations may still stream internally,
   * but the contract returns the complete response.
   */
  chat(req: ChatRequest): Promise<ChatResponse>;
  stream(req: ChatRequest, onChunk: (chunk: StreamChunk) => void): Promise<ChatResponse>;
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResponse<T>>;
  listModels(apiKey?: string, baseUrl?: string): Promise<ModelInfo[]>;
  /** Cheap, optional sanity check that credentials work. */
  testConnection(apiKey?: string, baseUrl?: string): Promise<{ ok: boolean; message?: string }>;
}

export class AIProviderError extends Error {
  override readonly name = "AIProviderError";
  constructor(
    public readonly kind:
      | "invalid_key"
      | "rate_limited"
      | "model_unavailable"
      | "timeout"
      | "malformed_output"
      | "provider_failure",
    message: string,
    public readonly provider: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, AIProviderError.prototype);
    // already assigned via param property — nothing else to do.
  }
}