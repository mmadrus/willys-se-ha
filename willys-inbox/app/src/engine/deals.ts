import type { DealItem, AppState, ItemEntry } from "./model.js";
import { normalizeItem, round2 } from "../util.js";

export interface DealMatch {
  deal: DealItem;
  itemKey: string;
}

/**
 * Compute savings percent for a product from the campaign data.
 * percent = savings / (price + savings), since comparePrice in the
 * Willys data is a per-unit (kr/kg) price rather than the before-campaign price.
 */
export function percentOffFor(p: {
  priceValue: number;
  savingsAmount: string | number | null;
}): { savings: number; percent: number; compare: number } {
  const parseSave = typeof p.savingsAmount === "number"
    ? p.savingsAmount
    : safeMoney(p.savingsAmount);
  const savings = parseSave ?? 0;
  const compare = savings > 0 && p.priceValue > 0 ? p.priceValue + savings : 0;
  const base = compare > 0 ? compare : p.priceValue;
  const percent = base > 0 && savings > 0 ? (savings / base) * 100 : 0;
  return { savings: round2(savings), percent: round2(percent), compare: round2(compare) };
}

function safeMoney(v: string | null): number | null {
  if (!v) return null;
  const n = Number.parseFloat(v.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Rank deals: in-stock, priced, percentOff desc then savings desc. */
export function rankDeals(items: DealItem[], topN = 25): DealItem[] {
  return items
    .filter((d) => !d.outOfStock && d.price > 0 && (d.percentOff > 0 || d.savings > 0))
    .sort((a, b) => b.percentOff - a.percentOff || b.savings - a.savings || a.name.localeCompare(b.name))
    .slice(0, topN);
}

/** Token-overlap match of a deal name to a registry item search query/name. */
export function dealMatchesItem(deal: DealItem, item: ItemEntry): boolean {
  if (item.willysCode && deal.code === item.willysCode) return true;
  const q = normalizeItem(item.searchQuery ?? item.name);
  const d = normalizeItem(deal.name);
  if (!q) return false;
  const qTokens = q.split(" ").filter((t) => t.length > 2);
  if (!qTokens.length) return false;
  return qTokens.every((t) => d.includes(t));
}

export function matchWatchlist(state: AppState, deals: DealItem[]): DealMatch[] {
  const matches: DealMatch[] = [];
  for (const wlKey of Object.keys(state.watchlist)) {
    const item = state.items[wlKey];
    if (!item) continue;
    for (const deal of deals) {
      if (deal.outOfStock || deal.price <= 0) continue;
      if (dealMatchesItem(deal, item)) {
        matches.push({ deal, itemKey: wlKey });
        break;
      }
    }
  }
  return matches;
}

/** Compare-price sample store for watchlist price sensor. */
export function extractWatchPrice(item: ItemEntry, deals: DealItem[]): number | null {
  for (const deal of deals) {
    if (dealMatchesItem(deal, item)) return deal.price;
  }
  return null;
}
