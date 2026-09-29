export type AisleAutoMode = "suggest" | "auto" | "never";

export interface ItemEntry {
  key: string;               // normalized key id
  name: string;              // display name
  willysCode?: string;       // exact product code when known
  searchQuery?: string;      // search term used to resolve product
  aisle: string;             // aisle section id
  aliases?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AisleSection {
  id: string;
  name: string;
  order: number;             // 0 = earliest stop in walk order
}

export interface StapleEntry {
  key: string;
  active: boolean;
  qty: number;
  skipIfBoughtWithinDays?: number;
}

export interface ItemStats {
  key: string;
  purchases: number[];       // purchase timestamps (ms), ascending
  addedCount: number;
  dismissedCount: number;
  lastDismissedAt?: number;
  mode: AisleAutoMode;       // suggestion mode for this item
  manualIntervalDays?: number;
  lastAddedAt?: number;
}

export type SuggestionReason = "due" | "deal";
export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "expired" | "auto";

export interface Suggestion {
  id: string;
  key: string;
  name: string;
  reason: SuggestionReason;
  intervalDays?: number;
  confidence: number;
  dueAt?: number;
  dealPercentOff?: number;
  dealPrice?: number;
  createdAt: number;
  status: SuggestionStatus;
  decidedAt?: number;
  notifiedAt?: number;
}

export interface DealItem {
  code: string;
  name: string;
  price: number;             // sale price (kr)
  comparePrice: number;      // before-campaign price when known
  savings: number;           // explicit campaign savings amount (kr)
  percentOff: number;        // computed savings percent
  unit?: string;             // displayVolume-ish info, e.g. "1 kg"
  compareUnit?: string;
  categoryPath?: string;
  labels: string[];
  outOfStock: boolean;
  image?: string | null;
}

export interface DealCache {
  fetchedAt: number;
  storeId: string;
  items: DealItem[];
}

export interface WatchlistEntry {
  key: string;               // item key in registry
  note?: string;
}

export interface BasketAisleHint {
  basketType: string;        // productBasketType.code from Willys
  aisle: string;             // last manually chosen aisle for that basket type
}

export interface AppState {
  version: number;
  items: Record<string, ItemEntry>;
  aisles: AisleSection[];
  staples: Record<string, StapleEntry>;
  stats: Record<string, ItemStats>;
  suggestions: Record<string, Suggestion>;
  watchlist: Record<string, WatchlistEntry>;
  basketAisleHints: Record<string, string>;   // basketType -> aisle id
  dealCache: DealCache | null;
  priceSnapshot: Record<string, { price: number; at: number }>; // itemKey -> last known storage price
  lastComposeAt: number | null;
  lastAnnouncedDealCodes: string[];  // avoid re-notifying same deals forever
  aiMatchCache: Record<string, string>; // normalized todo name -> item key (LLM-verified)
  /** Panel-selected shopping list entity; wins over the todo_entity option. */
  todoEntityOverride: string | null;
  /** "ask" (default): deal hits become suggestions. "add": straight onto the list. */
  dealComposeMode: "ask" | "add";
  firstRunAt: number | null;
}

export function emptyState(): AppState {
  return {
    version: 1,
    items: {},
    aisles: [],
    staples: {},
    stats: {},
    suggestions: {},
    watchlist: {},
    basketAisleHints: {},
    dealCache: null,
    priceSnapshot: {},
    lastComposeAt: null,
    lastAnnouncedDealCodes: [],
    aiMatchCache: {},
    todoEntityOverride: null,
    dealComposeMode: "ask",
    firstRunAt: null,
  };
}

/** Purchase event recorded into the audit log (JSONL). */
export interface PurchaseEvent {
  at: number;
  key: string;
  name: string;
  willysCode?: string;
  source: "todo" | "panel" | "compose" | "search";
}
