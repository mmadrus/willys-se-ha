// Use plain relative URLs (no leading slash): they resolve against the
// document URL exactly like the ./assets/* references, which works under
// any mount path (direct /, HA Ingress, reverse proxies) and avoids
// WebKit rejecting pathname-derived absolute URLs.
interface ErrorBody {
  error?: string;
}

async function req<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
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
  search: (q: string) =>
    req<{ results: import("./types").SearchHit[] }>(
      "GET",
      `api/search?q=${encodeURIComponent(q)}`,
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
