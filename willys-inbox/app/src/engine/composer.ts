import type { AppState, Suggestion, SuggestionReason } from "./model.js";
import { aisleOrderIndex } from "./aisles.js";
import { predict, suggestionWindow, isSuppressedByDismissal, type Prediction } from "./predictor.js";
import { normalizeItem, nowIso } from "../util.js";

export interface TodoItemLite {
  uid: string;
  summary: string;
  status: "needs_action" | "completed";
}

export interface ComposeOptions {
  autoMode: "suggest" | "auto" | "off";
  autoConfidence: number;
  notificationLeadDays: number;
  includeDeals: boolean;
  /** "ask" (default): deal hits become suggestions; "add": straight onto the list */
  dealMode?: "ask" | "add";
  nowMs?: number;
}

export interface ComposedEntry {
  key: string;
  name: string;
  qty: number;
  reason: SuggestionReason | "staple";
  aisle: string;
  willysCode?: string;
  price?: number;
  percentOff?: number;
}

export interface ComposeResult {
  listEntries: ComposedEntry[];
  suggestions: Suggestion[];
  dealHits: ComposedEntry[];
  predictionsConsidered: Prediction[];
  /** How many candidates each source contributed (before dedupe/skips). */
  sources: { staples: number; due: number; deals: number };
  /** Set by the caller after attempting to add to the to-do entity. */
  added?: number;
}

/** If an existing pending todo matches item key or willys code, skip adding. */
export function hasPendingOnList(
  todos: TodoItemLite[],
  entry: { key: string; name: string; willysCode?: string },
): boolean {
  for (const t of todos) {
    if (t.status !== "needs_action") continue;
    const s = normalizeItem(t.summary);
    if (!s) continue;
    const k = normalizeItem(entry.name);
    if (entry.willysCode && /[\d]{9,}(_ST)?/.test(t.summary)) {
      if (t.summary.includes(entry.willysCode.replace(/_ST$/, ""))) return true;
    }
    if (s === k || s.includes(k) || k.includes(s)) return true;
  }
  return false;
}

export function composeRun(
  state: AppState,
  todos: TodoItemLite[],
  opts: ComposeOptions,
): ComposeResult {
  const now = opts.nowMs ?? Date.now();
  const listEntries: ComposedEntry[] = [];
  const suggestions: Suggestion[] = [];
  const dealHits: ComposedEntry[] = [];
  const predictionsConsidered: Prediction[] = [];
  const taken = new Set<string>();
  const sources = { staples: 0, due: 0, deals: 0 };

  const pendingFilter = (entry: { key: string; name: string; willysCode?: string }) =>
    hasPendingOnList(todos, entry);

  // 1. Staples
  for (const key of Object.keys(state.staples)) {
    const staple = state.staples[key];
    if (!staple.active) continue;
    const item = state.items[key];
    if (!item) continue;
    sources.staples++;
    if (staple.skipIfBoughtWithinDays) {
      const stats = state.stats[key];
      const last = lastPurchaseAt(stats);
      if (last && now - last < staple.skipIfBoughtWithinDays * 86_400_000) continue;
    }
    const entry: ComposedEntry = {
      key,
      name: item.name,
      qty: staple.qty || 1,
      reason: "staple",
      aisle: item.aisle,
      willysCode: item.willysCode,
    };
    if (pendingFilter(entry)) continue;
    taken.add(key);
    listEntries.push(entry);
  }

  // 2. Predictions (due items)
  for (const key of Object.keys(state.stats)) {
    const stats = state.stats[key];
    const item = state.items[key];
    if (!item) continue;
    if (taken.has(key)) continue;
    if (stats.mode === "never") continue;
    const pred = predict(stats);
    if (!pred) continue;
    predictionsConsidered.push(pred);
    const win = suggestionWindow(pred, now, opts.notificationLeadDays);
    if (!win.open || win.expired) continue;
    if (isSuppressedByDismissal(stats, now)) continue;
    sources.due++;
    if (pendingFilter({ key, name: item.name, willysCode: item.willysCode })) continue;

    const autoEligible =
      stats.mode === "auto" ||
      (opts.autoMode === "auto" && pred.confidence >= opts.autoConfidence);

    const entry: ComposedEntry = {
      key,
      name: item.name,
      qty: 1,
      reason: "due",
      aisle: item.aisle,
      willysCode: item.willysCode,
    };

    if (autoEligible) {
      taken.add(key);
      listEntries.push(entry);
    } else if (opts.autoMode !== "off") {
      taken.add(key);
      suggestions.push(makeSuggestion(item, "due", pred.confidence, {
        intervalDays: pred.intervalDays,
        dueInDays: win.daysRemaining,
      }, now));
    }
  }

  // 3. Watchlist deal hits ("buy while cheap")
  if (opts.includeDeals && state.dealCache) {
    for (const entry of state.dealCache.items) {
      const wlKey = findWatchlistKeyForDeal(state, entry);
      if (!wlKey || taken.has(wlKey)) continue;
      const item = state.items[wlKey];
      if (!item) continue;
      if (pendingFilter({ key: wlKey, name: item.name, willysCode: item.willysCode })) continue;
      sources.deals++;
      taken.add(wlKey);
      const hit: ComposedEntry = {
        key: wlKey,
        name: item.name,
        qty: 1,
        reason: "deal",
        aisle: item.aisle,
        willysCode: item.willysCode,
        price: entry.price,
        percentOff: entry.percentOff,
      };
      dealHits.push(hit);
      if (opts.dealMode === "add") {
        listEntries.push(hit);
      } else {
        suggestions.push(makeSuggestion(item, "deal", 0.6, {
          dealPercentOff: entry.percentOff,
          dealPrice: entry.price,
        }, now));
      }
    }
  }

  return {
    listEntries: sortEntries(state, listEntries),
    suggestions,
    dealHits,
    predictionsConsidered: predictionsConsidered.filter(Boolean).map((p) => p as Prediction),
    sources,
  };
}

function lastPurchaseAt(stats: { purchases: number[] } | undefined): number | null {
  if (!stats || !stats.purchases.length) return null;
  return stats.purchases[stats.purchases.length - 1];
}

function findWatchlistKeyForDeal(state: AppState, deal: { code: string; name: string }): string | null {
  const norm = normalizeItem(deal.name);
  for (const key of Object.keys(state.watchlist)) {
    const item = state.items[key];
    if (!item) continue;
    if (item.willysCode && deal.code === item.willysCode) return key;
    const q = normalizeItem(item.searchQuery ?? item.name);
    if (q && q.split(" ").every((t) => norm.includes(t) && t.length > 2)) return key;
  }
  return null;
}

export function makeSuggestion(
  item: { key: string; name: string },
  reason: SuggestionReason,
  confidence: number,
  extra: { intervalDays?: number; dueInDays?: number; dealPercentOff?: number; dealPrice?: number },
  nowMs: number = Date.now(),
): Suggestion {
  return {
    id: `${Date.now().toString(36)}${normalizeItem(item.key).replaceAll(" ", "")}`.slice(0, 24),
    key: item.key,
    name: item.name,
    reason,
    confidence: Math.round(confidence * 100) / 100,
    intervalDays: extra.intervalDays,
    dueAt: extra.dueInDays !== undefined ? nowMs + extra.dueInDays * 86_400_000 : undefined,
    dealPercentOff: extra.dealPercentOff,
    dealPrice: extra.dealPrice,
    createdAt: nowMs,
    status: "pending",
  };
}

/** Sort entries in store walk order (aisle order, then name). */
export function sortEntries(state: AppState, entries: ComposedEntry[]): ComposedEntry[] {
  return [...entries].sort((a, b) => {
    const ai = aisleOrderIndex(state, a.aisle);
    const bi = aisleOrderIndex(state, b.aisle);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name, "sv");
  });
}

export function describeReason(r: ComposedEntry["reason"]): string {
  if (r === "staple") return "Standardvar";
  if (r === "due") return "Behovs snart";
  if (r === "deal") return "Bra pris";
  return r;
}

export function composeLogLine(res: ComposeResult): string {
  return `${nowIso()} list=${res.listEntries.length} suggest=${res.suggestions.length} deals=${res.dealHits.length}`;
}
