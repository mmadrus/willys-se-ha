import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fetchWithTimeout } from "../util.js";
import { log } from "../log.js";

const LOG = log.child("ai");

export interface AiConfig {
  apiKey: string;
  baseUrl: string; // OpenAI-compatible base, e.g. https://opencode.ai/zen/v1
  model: string;
}

export const AI_DEFAULTS: AiConfig = {
  apiKey: "",
  baseUrl: "https://opencode.ai/zen/v1",
  model: "gpt-5.4-nano",
};

export function loadAiConfig(dataDir: string): AiConfig {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, "ai-config.json"), "utf8")) as Partial<AiConfig>;
    return {
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
      baseUrl: typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim().replace(/\/+$/, "") : AI_DEFAULTS.baseUrl,
      model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : AI_DEFAULTS.model,
    };
  } catch {
    return { ...AI_DEFAULTS };
  }
}

export function saveAiConfig(dataDir: string, cfg: AiConfig): void {
  const tmp = join(dataDir, "ai-config.json.tmp");
  writeFileSync(tmp, JSON.stringify(cfg), "utf8");
  renameSync(tmp, join(dataDir, "ai-config.json"));
}

export function aiConfigured(cfg: AiConfig): boolean {
  return cfg.apiKey.length > 0 && cfg.baseUrl.length > 0 && cfg.model.length > 0;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Minimal OpenAI-compatible chat completion call (OpenCode Zen works). */
export async function chatCompletion(
  cfg: AiConfig,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const res = await fetchWithTimeout(
    `${cfg.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 300,
      }),
    },
    opts.timeoutMs ?? 20_000,
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = (await res.json()) as ChatResponse;
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
    return { ok: true, model: cfg.model, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, model: cfg.model, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}
