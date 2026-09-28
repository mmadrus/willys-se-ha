import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fetchWithTimeout } from "../util.js";
import { log } from "../log.js";

const LOG = log.child("ai");

export type AiProvider =
  | "opencode"
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "custom";

export interface AiProviderPreset {
  id: AiProvider;
  label: string;
  baseUrl: string;
  defaultModel: string;
}

/** Known providers. All use OpenAI-compatible chat/completions except Anthropic. */
export const AI_PROVIDERS: Record<AiProvider, AiProviderPreset> = {
  opencode: {
    id: "opencode",
    label: "OpenCode Zen",
    baseUrl: "https://opencode.ai/zen/v1",
    defaultModel: "gpt-5.4-nano",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.4-nano",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4.5",
  },
  google: {
    id: "google",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.5-flash-lite",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-5.4-nano",
  },
  custom: {
    id: "custom",
    label: "Annan (OpenAI-kompatibel)",
    baseUrl: "",
    defaultModel: "",
  },
};

export function isAiProvider(v: unknown): v is AiProvider {
  return typeof v === "string" && v in AI_PROVIDERS;
}

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  /** Empty = provider preset default */
  baseUrl: string;
  /** Empty = provider preset default */
  model: string;
}

export function loadAiConfig(dataDir: string): AiConfig {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, "ai-config.json"), "utf8")) as Partial<AiConfig>;
    return {
      provider: isAiProvider(raw.provider) ? raw.provider : "opencode",
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
      baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl.trim().replace(/\/+$/, "") : "",
      model: typeof raw.model === "string" ? raw.model.trim() : "",
    };
  } catch {
    return { provider: "opencode", apiKey: "", baseUrl: "", model: "" };
  }
}

export function saveAiConfig(dataDir: string, cfg: AiConfig): void {
  const tmp = join(dataDir, "ai-config.json.tmp");
  writeFileSync(tmp, JSON.stringify(cfg), "utf8");
  renameSync(tmp, join(dataDir, "ai-config.json"));
}

/** Resolve effective base URL / model, filling provider presets for blanks. */
export function effectiveAi(cfg: AiConfig): { baseUrl: string; model: string } {
  const preset = AI_PROVIDERS[cfg.provider];
  return {
    baseUrl: (cfg.baseUrl || preset.baseUrl).replace(/\/+$/, ""),
    model: cfg.model || preset.defaultModel,
  };
}

export function aiConfigured(cfg: AiConfig): boolean {
  return cfg.apiKey.length > 0 && effectiveAi(cfg).baseUrl.length > 0 && effectiveAi(cfg).model.length > 0;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

interface AnthropicErrorResponse {
  error?: { message?: string };
}

/** Chat completion across providers (OpenAI-compatible + Anthropic native). */
export async function chatCompletion(
  cfg: AiConfig,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { baseUrl, model } = effectiveAi(cfg);
  const maxTokens = opts.maxTokens ?? 300;
  const temperature = opts.temperature ?? 0;

  if (cfg.provider === "anthropic") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const rest = messages.filter((m) => m.role !== "system");
    const res = await fetchWithTimeout(
      `${baseUrl}/messages`,
      {
        method: "POST",
        headers: {
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages: rest }),
      },
      opts.timeoutMs ?? 20_000,
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      let msg = `AI ${res.status}: ${t.slice(0, 160)}`;
      try {
        const body = JSON.parse(t) as AnthropicErrorResponse;
        if (body.error?.message) msg = `AI ${res.status}: ${body.error.message.slice(0, 160)}`;
      } catch {
        /* keep raw */
      }
      throw new Error(msg);
    }
    const data = (await res.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    if (!text) throw new Error("AI returned no content");
    return text;
  }

  // OpenAI-compatible (OpenCode Zen, OpenAI, Google's OpenAI endpoint, OpenRouter, custom)
  const res = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    },
    opts.timeoutMs ?? 20_000,
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = (await res.json()) as OpenAiChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned no content");
  return content;
}

/** Extract the first JSON array/object from a possibly chatty LLM answer. */
export function extractJson<T>(text: string): T | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  const end = text.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch (e) {
    LOG.warn("json extract failed", text.slice(0, 120));
    return null;
  }
}

export interface ParsedItem {
  name: string;
  qty: number;
}

/** Parse a free-text shopping phrase into structured items. */
export async function nlParseItems(cfg: AiConfig, text: string): Promise<ParsedItem[]> {
  const answer = await chatCompletion(cfg, [
    {
      role: "system",
      content:
        "Du är en assistent som läser en svensk inköpsfras och returnerar en JSON-array " +
        'med varor: [{"name":"<varunamn>","qty":<antal>}]. Endast JSON, inga förklaringar. ' +
        "Håll varunamnen korta och generiska (t.ex. 'Mjölk', 'Bröd').",
    },
    { role: "user", content: text },
  ], { maxTokens: 200 });
  const parsed = extractJson<ParsedItem[]>(answer);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((p) => p && typeof p.name === "string" && p.name.trim())
    .map((p) => ({ name: p.name.trim().slice(0, 60), qty: Math.min(50, Math.max(1, Number(p.qty) || 1)) }))
    .slice(0, 20);
}

/** Ask the model to match a checked-off todo line to one of the known items. */
export async function matchPurchaseKey(
  cfg: AiConfig,
  todoName: string,
  candidates: Array<{ key: string; name: string }>,
): Promise<string | null> {
  const answer = await chatCompletion(cfg, [
    {
      role: "system",
      content:
        "Du matchar en incheckad inköpsrad mot en lista av kända varor. Svara ENDAST med " +
        'nyckeln (key) för den bästa matchningen som JSON: {"key":"..."}. Om ingen passar: {"key":null}.',
    },
    {
      role: "user",
      content: `Incheckad rad: "${todoName}"\nKända varor: ${JSON.stringify(candidates.slice(0, 60))}`,
    },
  ], { maxTokens: 60 });
  const parsed = extractJson<{ key: string | null }>(answer);
  if (!parsed || typeof parsed.key !== "string") return null;
  const found = candidates.find((c) => c.key === parsed.key);
  return found ? found.key : null;
}

/** Cheap connectivity test. */
export async function aiTest(cfg: AiConfig): Promise<{ ok: boolean; model: string; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  try {
    await chatCompletion(cfg, [
      { role: "user", content: "Svara med exakt: OK" },
    ], { maxTokens: 5, timeoutMs: 15_000 });
    return { ok: true, model: effectiveAi(cfg).model, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, model: effectiveAi(cfg).model, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}
