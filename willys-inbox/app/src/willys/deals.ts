import type { WillysSession } from "./session.js";
import type { DealItem } from "../engine/model.js";
import { percentOffFor } from "../engine/deals.js";
import { log } from "../log.js";
import { nowIso, sleep } from "../util.js";

const LOG = log.child("deals");

/** Fallback category paths if the campaigns API is unavailable. */
const CAMPAIGN_PATHS = ["erbjudanden", "kampanjer"];

export interface DealsFetchResult {
  items: DealItem[];
  storeId: string;
  fetchedAt: number;
  usedPath: string;
}

export interface RawCampaignProduct {
  code: string;
  name: string;
  priceValue: number;
  savingsAmount: number | string | null;
  displayVolume?: string;
  comparePrice?: string;
  comparePriceUnit?: string;
  labels?: string[];
  outOfStock?: boolean;
  image?: { url: string } | null;
  potentialPromotions?: unknown;
}

/**
 * Enumerate discounted items. Primary source: the official campaigns API
 * (GET /axfood/rest/v2/search/campaigns) which honors the session's active
 * store. Fallback: browsing the "erbjudanden" category.
 */
export async function fetchDeals(session: WillysSession): Promise<DealsFetchResult> {
  const storeId = session.currentStoreId;
  try {
    const items = await fetchCampaignsApi(session);
    if (items.length > 0) {
      return { items, storeId, fetchedAt: Date.now(), usedPath: "campaigns-api" };
    }
  } catch (e) {
    LOG.warn(`campaigns api failed: ${e instanceof Error ? e.message : e}`);
  }
  return fetchViaCategory(session, storeId);
}

/** GET /axfood/rest/v2/search/campaigns — paged, ~220 items currently. */
export async function fetchCampaignsApi(session: WillysSession, pageSize = 100, maxPages = 6): Promise<DealItem[]> {
  const out: DealItem[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await session.raw(`/axfood/rest/v2/search/campaigns?page=${page}&size=${pageSize}`);
    if (!res.ok) throw new Error(`campaigns ${res.status}`);
    const data = (await res.json()) as { results?: RawCampaignProduct[]; pagination?: { totalNumberOfResults?: number } };
    const results = data.results ?? [];
    for (const p of results) out.push(toDealItem(p));
    const total = data.pagination?.totalNumberOfResults ?? results.length;
    if (out.length >= total || results.length === 0) break;
    await sleep(300);
  }
  LOG.info(`campaigns api: ${out.length} campaign products`);
  return out;
}

async function fetchViaCategory(session: WillysSession, storeId: string): Promise<DealsFetchResult> {
  for (const path of CAMPAIGN_PATHS) {
    try {
      const products = await session.browseAll(path, { size: 100, maxPages: 4 });
      const withDiscount = products.filter((p) => percentOffFor(p).savings > 0);
      if (withDiscount.length > 0) {
        LOG.info(`campaign path '${path}': ${withDiscount.length} discounted`);
        return {
          items: withDiscount.map((p) => toDealItem(p)),
          storeId,
          fetchedAt: Date.now(),
          usedPath: path,
        };
      }
    } catch (e) {
      LOG.warn(`campaign path '${path}' failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  LOG.warn("no campaign source worked");
  return { items: [], storeId, fetchedAt: Date.now(), usedPath: "none" };
}

export function toDealItem(p: RawCampaignProduct): DealItem {
  const calc = percentOffFor({ priceValue: p.priceValue, savingsAmount: p.savingsAmount });
  const labels = [...(p.labels ?? [])];
  const promos = Array.isArray(p.potentialPromotions)
    ? (p.potentialPromotions as Array<{ campaignType?: string } | null>)
    : [];
  const loyalty = promos.some((promo) => promo?.campaignType === "LOYALTY");
  if (loyalty) labels.push("Willys plus");
  return {
    code: p.code,
    name: p.name,
    price: p.priceValue,
    comparePrice: calc.compare,
    savings: calc.savings,
    percentOff: calc.percent,
    unit: p.displayVolume,
    compareUnit: p.comparePriceUnit,
    labels,
    outOfStock: Boolean(p.outOfStock),
    image: p.image?.url ?? null,
  };
}

export function dealsLogline(res: DealsFetchResult): string {
  return `${nowIso()} store=${res.storeId} path=${res.usedPath} items=${res.items.length}`;
}
