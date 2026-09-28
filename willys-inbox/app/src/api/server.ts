import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { WillysApp } from "../app.js";
import type { AppConfig } from "../config.js";
import { log } from "../log.js";

const LOG = log.child("api");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function createServer(app: WillysApp, port: number) {
  // Panel lives at /app/panel in the add-on container (dist of server is
  // /app/server) and at <repo>/app/panel/dist in local dev runs.
  const up = fileURLToPath(new URL("../..", import.meta.url));
  const candidates = [
    process.env.WILLYS_PANEL_DIR ? join(process.cwd(), process.env.WILLYS_PANEL_DIR) : "",
    join(up, "panel"),
    join(up, "panel", "dist"),
  ].filter(Boolean);
  const panelDir = candidates.find((c) => existsSync(join(c, "index.html"))) ?? candidates[0];
  LOG.debug(`panel dir: ${panelDir}`);

  const server = createHttpServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Ingress support: HA forwards requests with X-Ingress-Path set to the
      // proxied prefix; strip it so routes are stable under both modes.
      const ingressPath = (req.headers["x-ingress-path"] as string | undefined) ?? "";
      let url = req.url ?? "/";
      if (ingressPath && url.startsWith(ingressPath)) url = url.slice(ingressPath.length) || "/";
      let parsed: URL;
      try {
        parsed = new URL(url, "http://local");
      } catch {
        res.writeHead(400);
        res.end("bad request");
        return;
      }
      const path = parsed.pathname;

      if (path.startsWith("/api/")) {
        await handleApi(req, res, path, parsed.searchParams, app);
        return;
      }
      serveStatic(res, panelDir, path === "/" ? "/index.html" : path);
    } catch (e) {
      LOG.error(`request failed: ${e instanceof Error ? e.stack : e}`);
      json(res, 500, { error: "internal" });
    }
  }

  // Caller invokes server.listen(port) (keeps the factory testable).
  return server;
}

function serveStatic(res: ServerResponse, root: string, rel: string): void {
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, safe);
  if (!existsSync(file) || !statSync(file).isFile()) {
    file = join(root, "index.html"); // SPA fallback
  }
  try {
    const data = readFileSync(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      "Cache-Control": file.endsWith(".html") ? "no-cache" : "max-age=3600",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("panel not built");
  }
}

type Handler = (req: IncomingMessage, res: ServerResponse, params: URLSearchParams) => Promise<void>;

const routes: Array<{ method: string; prefix: RegExp; handler: Handler }> = [];
let currentApp: WillysApp;

function route(method: string, pattern: string, handler: Handler): void {
  const regex = new RegExp(
    "^" + pattern.replace(/:[^/]+/g, "([^/]+)").replace(/\//g, "\\/") + "$",
  );
  routes.push({ method, prefix: regex, handler });
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  search: URLSearchParams,
  app: WillysApp,
): Promise<void> {
  currentApp = app;
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = path.match(r.prefix);
    if (m) {
      // expose params via symbol-keyed bag
      (req as IncomingMessage & { routeParams?: string[] }).routeParams = m.slice(1);
      await r.handler(req, res, search);
      return;
    }
  }
  json(res, 404, { error: "not found" });
}

function params(req: IncomingMessage): string[] {
  return (req as IncomingMessage & { routeParams?: string[] }).routeParams ?? [];
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 512 * 1024) throw new Error("payload too large");
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(res: ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const ok = (res: ServerResponse, data: unknown = { ok: true }) => json(res, 200, data);

// ------------------------------------------------------------------- routes

route("GET", "/api/health", async (_req, res) => {
  ok(res, { ok: true, version: 1 });
});

route("GET", "/api/state", async (_req, res) => {
  const app = currentApp;
  const s = app.storage.data;
  const { predict } = await import("../engine/predictor.js");
  ok(res, {
    aisles: [...s.aisles].sort((a, b) => a.order - b.order),
    items: Object.values(s.items),
    staples: Object.values(s.staples),
    watchlist: Object.keys(s.watchlist),
    suggestions: Object.values(s.suggestions)
      .filter((x) => x.status === "pending" || Date.now() - (x.decidedAt ?? 0) < 7 * 86_400_000)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100),
    deals: (s.dealCache?.items ?? [])
      .filter((d) => !d.outOfStock && d.percentOff > 0)
      .sort((a, b) => b.percentOff - a.percentOff)
      .slice(0, 40),
    dealsUpdated: s.dealCache?.fetchedAt ?? null,
    lastComposeAt: s.lastComposeAt,
    storeId: app.session.currentStoreId,
    predictions: Object.values(s.stats)
      .map((st) => {
        const p = predict(st);
        return p ? { ...p, name: s.items[st.key]?.name ?? st.key, mode: st.mode } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.nextDueMs - b.nextDueMs)
      .slice(0, 40),
  });
});

route("GET", "/api/list", async (_req, res) => {
  const items = await currentApp.shoppingList.getItems("todo.shopping_list");
  ok(res, { items });
});

route("GET", "/api/search", async (req, res, search) => {
  const q = search.get("q")?.trim();
  if (!q) return ok(res, { results: [] });
  const results = await currentApp.searchProducts(q);
  ok(res, { results });
});

route("POST", "/api/items", async (req, res) => {
  const b = await body(req);
  const name = String(b.name ?? "").trim();
  if (!name) return json(res, 400, { error: "name required" });
  const created = currentApp.addFromSearch({
    name,
    code: b.code ? String(b.code) : undefined,
    query: b.query ? String(b.query) : undefined,
    asStaple: Boolean(b.asStaple),
    watch: Boolean(b.watch),
    aisle: b.aisle ? String(b.aisle) : undefined,
    basketHint: b.basketType ? String(b.basketType) : undefined,
  });
  ok(res, created);
});

route("PATCH", "/api/items/:key", async (req, res) => {
  const key = params(req)[0];
  const b = await body(req);
  const s = currentApp.storage.data.items[key];
  if (!s) return json(res, 404, { error: "no such item" });
  currentApp.storage.update((st) => {
    const item = st.items[key];
    if (typeof b.name === "string" && b.name.trim()) item.name = b.name.trim();
    if (typeof b.aisle === "string") item.aisle = b.aisle;
    if (typeof b.willysCode === "string") item.willysCode = b.willysCode;
    if (typeof b.searchQuery === "string") item.searchQuery = b.searchQuery;
    if (typeof b.basketType === "string" && typeof b.aisle === "string") {
      st.basketAisleHints[b.basketType] = b.aisle;
    }
    item.updatedAt = Date.now();
    if (typeof b.mode === "string" && ["suggest", "auto", "never"].includes(b.mode)) {
      const stats = (st.stats[key] ??= {
        key,
        purchases: [],
        addedCount: 0,
        dismissedCount: 0,
        mode: "suggest" as const,
      });
      stats.mode = b.mode as "suggest" | "auto" | "never";
    }
  });
  ok(res);
});

route("DELETE", "/api/items/:key", async (req, res) => {
  currentApp.storage.deleteItem(params(req)[0]);
  ok(res);
});

route("POST", "/api/staples/:key", async (req, res) => {
  const key = params(req)[0];
  const b = await body(req);
  currentApp.storage.update((s) => {
    const prev = s.staples[key];
    s.staples[key] = {
      key,
      active: typeof b.active === "boolean" ? b.active : prev?.active ?? true,
      qty: typeof b.qty === "number" ? Math.max(1, b.qty) : prev?.qty ?? 1,
      skipIfBoughtWithinDays: typeof b.skipIfBoughtWithinDays === "number" ? b.skipIfBoughtWithinDays : prev?.skipIfBoughtWithinDays,
    };
  });
  ok(res);
});

route("DELETE", "/api/staples/:key", async (req, res) => {
  const key = params(req)[0];
  currentApp.storage.update((s) => {
    delete s.staples[key];
  });
  ok(res);
});

route("POST", "/api/watchlist/:key", async (req, res) => {
  const key = params(req)[0];
  currentApp.storage.update((s) => {
    s.watchlist[key] = { key };
  });
  ok(res);
});

route("DELETE", "/api/watchlist/:key", async (req, res) => {
  const key = params(req)[0];
  currentApp.storage.update((s) => {
    delete s.watchlist[key];
  });
  ok(res);
});

route("POST", "/api/aisles/reorder", async (req, res) => {
  const b = await body(req);
  const order = Array.isArray(b.order) ? b.order.map(String) : [];
  if (!order.length) return json(res, 400, { error: "order[] required" });
  currentApp.storage.update((s) => {
    order.forEach((id, i) => {
      const aisle = s.aisles.find((a) => a.id === id);
      if (aisle) aisle.order = i;
    });
    if (typeof b.name === "object" && b.name !== null) {
      for (const [id, name] of Object.entries(b.name as Record<string, unknown>)) {
        const aisle = s.aisles.find((a) => a.id === id);
        if (aisle && typeof name === "string" && name.trim()) aisle.name = name.trim();
      }
    }
    s.aisles.sort((a, b2) => a.order - b2.order);
  });
  ok(res);
});

route("POST", "/api/compose", async (req, res) => {
  const b = await body(req);
  const result = await currentApp.composeNow(b.includeDeals !== false);
  ok(res, {
    added: result.listEntries.length,
    suggested: result.suggestions.length,
    entries: result.listEntries,
  });
});

route("POST", "/api/decisions/:id", async (req, res) => {
  const id = params(req)[0];
  const b = await body(req);
  const choice = String(b.choice ?? "");
  if (!["add", "pass", "never"].includes(choice)) {
    return json(res, 400, { error: "choice must be add|pass|never" });
  }
  await currentApp.handleDecision({ suggestionId: id, choice: choice as "add" | "pass" | "never" });
  ok(res);
});

route("POST", "/api/purchase", async (req, res) => {
  const b = await body(req);
  const name = String(b.name ?? "").trim();
  if (!name) return json(res, 400, { error: "name required" });
  currentApp.handlePurchase(name);
  ok(res);
});

route("GET", "/api/stores", async (_req, res) => {
  try {
    await currentApp.session.ensureLoggedIn();
    const stores = await currentApp.session.getStores();
    ok(res, { stores });
  } catch (e) {
    json(res, 502, { error: e instanceof Error ? e.message : "stores failed" });
  }
});

route("POST", "/api/refresh", async (_req, res) => {
  await currentApp.refreshDealsJob();
  ok(res);
});
