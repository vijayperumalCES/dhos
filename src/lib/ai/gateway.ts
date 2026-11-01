import "server-only";

import { draftRequirements, narrateAnalysis } from "./builtin";
import { extractJson } from "./guard";
import type { AgentKey } from "./registry";
import type { Signal } from "./signals";

/**
 * Model gateway: one interface over the configured providers. Credentials come from platform
 * environment variables on the server and are never stored in the database or sent to a browser.
 * Models receive no tools: the orchestrator decides what is read, so a prompt-injected instruction
 * has nothing to call.
 */
export type LocalInput =
  | { kind: "analysis"; style: "analysis" | "brief"; scopeLabel: string; projectCount: number; cleanProjects: number; signals: Signal[]; limitations: string[]; today: string }
  | { kind: "requirements"; text: string };

export type StructuredRequest = {
  agent: AgentKey;
  /** Operator-editable system prompt (trusted configuration). */
  system: string;
  /** User message holding fenced untrusted data. */
  user: string;
  /** Same content, structured, for the rule-based provider. */
  local: LocalInput;
  model: string | null;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

export type StructuredResponse = { json: unknown; inputTokens: number; outputTokens: number; model: string };

export interface ModelProvider {
  readonly id: "builtin" | "anthropic";
  generateStructured(req: StructuredRequest): Promise<StructuredResponse>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export const builtinProvider: ModelProvider = {
  id: "builtin",
  async generateStructured(req) {
    const json = req.local.kind === "requirements" ? draftRequirements(req.local.text) : narrateAnalysis(req.local);
    return { json, inputTokens: 0, outputTokens: 0, model: "builtin-rules" };
  },
};

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
const RETRIES = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createAnthropicProvider(apiKey: string, baseUrl = "https://api.anthropic.com"): ModelProvider {
  return {
    id: "anthropic",
    async generateStructured(req) {
      const model = req.model ?? DEFAULT_ANTHROPIC_MODEL;
      const deadline = Date.now() + req.timeoutMs;
      let lastError = new ProviderError("The model provider did not respond.", true);

      for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        try {
          const res = await fetch(`${baseUrl}/v1/messages`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model,
              max_tokens: req.maxTokens,
              temperature: req.temperature,
              system: req.system,
              messages: [{ role: "user", content: req.user }],
            }),
            signal: AbortSignal.timeout(remaining),
          });
          if (!res.ok) {
            // The body of an error can echo request content; log the status only.
            const retryable = res.status === 429 || res.status >= 500;
            lastError = new ProviderError(`The model provider returned HTTP ${res.status}.`, retryable);
            if (!retryable) throw lastError;
          } else {
            const body = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
            const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
            return {
              json: extractJson(text),
              inputTokens: body.usage?.input_tokens ?? 0,
              outputTokens: body.usage?.output_tokens ?? 0,
              model,
            };
          }
        } catch (e) {
          if (e instanceof ProviderError && !e.retryable) throw e;
          if (e instanceof SyntaxError || (e instanceof Error && e.message.startsWith("The model reply"))) throw new ProviderError(e.message, false);
          lastError = e instanceof ProviderError ? e : new ProviderError("The model provider could not be reached or timed out.", true);
        }
        if (attempt < RETRIES) await sleep(Math.min(500 * 2 ** attempt, Math.max(0, deadline - Date.now())));
      }
      throw lastError;
    },
  };
}

/** Resolves the provider an organization chose. Missing credentials fail the run with a clear message. */
export function resolveProvider(id: string): ModelProvider {
  if (id === "builtin") return builtinProvider;
  if (id === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new ProviderError("The Anthropic provider is selected but ANTHROPIC_API_KEY is not configured on the server.", false);
    return createAnthropicProvider(key, process.env.ANTHROPIC_BASE_URL || undefined);
  }
  throw new ProviderError(`Unknown provider "${id}".`, false);
}

export function estimateCost(inputTokens: number, outputTokens: number, inputPrice: number | null, outputPrice: number | null): number | null {
  if (inputPrice === null || outputPrice === null) return null;
  return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
}
