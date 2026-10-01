/**
 * Provider registry. To add a new provider:
 *   1. Implement AIProvider in lib/ai/<name>.ts.
 *   2. Register it here.
 * Business code asks the registry for a provider by ID; it never `new`s
 * providers directly.
 */
import { OpenRouterProvider } from "./openrouter";
import type { AIProvider } from "./provider";

const FACTORIES: Record<string, (opts: { apiKey?: string; baseUrl?: string }) => AIProvider> = {
  openrouter: (opts) => new OpenRouterProvider({ apiKey: opts.apiKey, baseUrl: opts.baseUrl }),
};

export function getProvider(
  providerId: string,
  opts: { apiKey?: string; baseUrl?: string } = {},
): AIProvider {
  const factory = FACTORIES[providerId];
  if (!factory) {
    throw new Error(`Unknown AI provider "${providerId}". Registered: ${Object.keys(FACTORIES).join(", ")}`);
  }
  return factory(opts);
}

export function listRegisteredProviders(): string[] {
  return Object.keys(FACTORIES);
}