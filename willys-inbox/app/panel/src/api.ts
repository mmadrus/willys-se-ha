// Build an absolute API base. The document URL under Ingress can end with
// "//" (ingress_entry joined onto the token path), which breaks relative
// URL resolution in WebKit ("The string did not match the expected
// pattern"). Collapsing duplicate slashes and using an absolute URL
// avoids the relative-resolution path entirely.
function apiUrlBase(): string {
  const path = window.location.pathname.replace(/\/{2,}/g, "/");
  const dir = path.endsWith("/") ? path : path + "/";
  return window.location.origin + dir;
}

const BASE = apiUrlBase();

interface ErrorBody {
  error?: string;
}

async function req<T = unknown>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = ((await res.json()) as ErrorBody).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface ItemPatch {
  name?: string;
  aisle?: string;
  willysCode?: string;
  searchQuery?: string;
  mode?: "suggest" | "auto" | "never";
  basketType?: string;
}

export interface ComposeResponse {
  added: number;
  suggested: number;
  entries: unknown[];
}

export const api = {
  state: () => req("GET", "api/state"),
  debug: () => req<import("./types").DebugInfo>("GET", "api/debug"),
  list: () => req<{ items: import("./types").TodoItem[] }>("GET", "api/list"),
  aiConfig: () =>
    req<{ configured: boolean; baseUrl: string; model: string; apiKeyHint: string }>("GET", "api/ai/config"),
  saveAiConfig: (patch: { apiKey?: string; baseUrl?: string; model?: string }) =>
    req<{ configured: boolean; baseUrl: string; model: string; apiKeyHint: string }>(
      "POST",
      "api/ai/config",
      patch,
    ),
  aiTest: () =>
    req<{ ok: boolean; model: string; latencyMs: number; error?: string }>("POST", "api/ai/test"),
  aiAdd: (text: string) =>
    req<{ added: Array<{ key: string; name: string; qty: number }> }>("POST", "api/ai/add", { text }),
  search: (q: string, signal?: AbortSignal) =>
    req<{ results: import("./types").SearchHit[] }>(
      "GET",
      `api/search?q=${encodeURIComponent(q)}`,
      undefined,
      signal,
    ),
  addItem: (payload: import("./types").AddItemPayload) =>
    req<{ key: string; aisle: string }>("POST", "api/items", payload),
  patchItem: (key: string, patch: ItemPatch) =>
    req("PATCH", `api/items/${encodeURIComponent(key)}`, patch),
  deleteItem: (key: string) => req("DELETE", `api/items/${encodeURIComponent(key)}`),
  setStaple: (key: string, data: { active?: boolean; qty?: number; skipIfBoughtWithinDays?: number }) =>
    req("POST", `api/staples/${encodeURIComponent(key)}`, data),
  unsetStaple: (key: string) => req("DELETE", `api/staples/${encodeURIComponent(key)}`),
  watch: (key: string) => req("POST", `api/watchlist/${encodeURIComponent(key)}`),
  unwatch: (key: string) => req("DELETE", `api/watchlist/${encodeURIComponent(key)}`),
  reorderAisles: (order: string[], names?: Record<string, string>) =>
    req("POST", "api/aisles/reorder", { order, name: names ?? {} }),
  compose: (includeDeals = true) =>
    req<ComposeResponse>("POST", "api/compose", { includeDeals }),
  decide: (id: string, choice: "add" | "pass" | "never") =>
    req("POST", `api/decisions/${encodeURIComponent(id)}`, { choice }),
  refresh: () => req("POST", "api/refresh"),
  stores: () => req<{ stores: import("./types").StoreInfo[] }>("GET", "api/stores"),
};
