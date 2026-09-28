/** Types mirroring the add-on's /api payloads (server: app/src). */

export interface AisleSection {
  id: string;
  name: string;
  order: number;
}

export interface ItemEntry {
  key: string;
  name: string;
  willysCode?: string;
  searchQuery?: string;
  aisle: string;
  aliases?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface StapleEntry {
  key: string;
  active: boolean;
  qty: number;
  skipIfBoughtWithinDays?: number;
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
  price: number;
  comparePrice: number;
  savings: number;
  percentOff: number;
  unit?: string;
  compareUnit?: string;
  labels: string[];
  outOfStock: boolean;
  image?: string | null;
}

export interface Prediction {
  key: string;
  name: string;
  mode: "suggest" | "auto" | "never";
  intervalDays: number;
  confidence: number;
  nextDueMs: number;
  lastPurchaseMs: number;
  suggestionsCount: number;
}

export type TodoStatus = "needs_action" | "completed";

export interface TodoItem {
  uid?: string;
  summary: string;
  status: TodoStatus;
  description?: string;
}

export interface AppStateData {
  aisles: AisleSection[];
  items: ItemEntry[];
  staples: StapleEntry[];
  watchlist: string[];
  suggestions: Suggestion[];
  deals: DealItem[];
  dealsUpdated: number | null;
  lastComposeAt: number | null;
  storeId: string;
  predictions: Prediction[];
}

export interface SearchHit {
  code: string;
  name: string;
  price: number;
  unit: string;
  savings: number;
  percentOff: number;
  labels: string[];
  outOfStock: boolean;
  basketType?: string;
  /** panel-local: aisle chosen in the search-result dropdown */
  _aisle?: string;
}

export interface StoreInfo {
  id: string;
  name: string;
  address?: string;
  city?: string;
}

export type DebugInfo = Record<string, unknown>;

export interface AddItemPayload {
  name: string;
  code?: string;
  query?: string;
  asStaple?: boolean;
  watch?: boolean;
  aisle?: string;
  basketType?: string;
}
