async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  state: () => req("GET", "/api/state"),
  list: () => req("GET", "/api/list"),
  search: (q) => req("GET", `/api/search?q=${encodeURIComponent(q)}`),
  addItem: (payload) => req("POST", "/api/items", payload),
  patchItem: (key, patch) => req("PATCH", `/api/items/${encodeURIComponent(key)}`, patch),
  deleteItem: (key) => req("DELETE", `/api/items/${encodeURIComponent(key)}`),
  setStaple: (key, data) => req("POST", `/api/staples/${encodeURIComponent(key)}`, data),
  unsetStaple: (key) => req("DELETE", `/api/staples/${encodeURIComponent(key)}`),
  watch: (key) => req("POST", `/api/watchlist/${encodeURIComponent(key)}`),
  unwatch: (key) => req("DELETE", `/api/watchlist/${encodeURIComponent(key)}`),
  reorderAisles: (order, names) => req("POST", "/api/aisles/reorder", { order, name: names ?? {} }),
  compose: (includeDeals = true) => req("POST", "/api/compose", { includeDeals }),
  decide: (id, choice) => req("POST", `/api/decisions/${encodeURIComponent(id)}`, { choice }),
  refresh: () => req("POST", "/api/refresh"),
  stores: () => req("GET", "/api/stores"),
};
