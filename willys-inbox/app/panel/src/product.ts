import type { AppStateData, SearchHit } from "./types";

/** Product-shaped data for the shared card. */
export interface ProductCardData {
  code: string;
  name: string;
  price: number;
  unit?: string;
  savings: number;
  percentOff: number;
  labels?: string[];
  image?: string | null;
  comparePrice?: number;
  aisle?: string;
}

export function dealToCard(d: {
  code: string;
  name: string;
  price: number;
  unit?: string;
  savings: number;
  percentOff: number;
  labels?: string[];
  image?: string | null;
  comparePrice?: number;
  aisle?: string;
}): ProductCardData {
  return d;
}

export function searchHitToCard(r: SearchHit): ProductCardData {
  return {
    code: r.code,
    name: r.name,
    price: r.price,
    unit: r.unit,
    savings: r.savings,
    percentOff: r.percentOff,
    labels: r.labels,
    image: r.image,
  };
}

/**
 * Registry-state lookups so card actions can reflect (and toggle) whether a
 * product is already a staple / watched. Matches on willysCode first, then
 * normalized name.
 */
export function registryLookups(state: AppStateData): {
  byCode: Map<string, string>;
  byName: Map<string, string>;
} {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const item of state.items) {
    if (item.willysCode) byCode.set(item.willysCode, item.key);
    byName.set(item.name.toLowerCase(), item.key);
  }
  return { byCode, byName };
}

export function findRegistryKey(
  lookups: { byCode: Map<string, string>; byName: Map<string, string> },
  hit: { code: string; name: string },
): string | null {
  return lookups.byCode.get(hit.code) ?? lookups.byName.get(hit.name.toLowerCase()) ?? null;
}
