import type { AppState } from "./model.js";

export interface AisleDef {
  id: string;
  name: string;
}

/** Default supermarket walk order (Willys-ish). The panel can reorder/rename. */
export const DEFAULT_AISLES: AisleDef[] = [
  { id: "gront", name: "Frukt & Grönt" },
  { id: "brod", name: "Bröd" },
  { id: "mejeri", name: "Mejeri & Ägg" },
  { id: "chark", name: "Chark & Pålägg" },
  { id: "kot", name: "Kött & Fågel" },
  { id: "fisk", name: "Fisk & Skaldjur" },
  { id: "vegetariskt", name: "Vegetariskt" },
  { id: "skafferi", name: "Skafferi" },
  { id: "frost", name: "Fryst" },
  { id: "dryck", name: "Drycker" },
  { id: "gott", name: "Godis & Snacks" },
  { id: "hemma", name: "Hem & Städ" },
  { id: "personlig", name: "Personlig vård" },
  { id: "andra", name: "Övrigt" },
];

export const FALLBACK_AISLE = "andra";

/** Naive Swedish keyword guesser for auto-aisle on new items. */
const KEYWORDS: Record<string, RegExp> = {
  gront: /banana|bananer|äpple|apelsin|citron|lime|tomat|gurka|lök|potatis|moröt|paprika|sallad|grön|morot|grapes|druv|shallot|broccoli|blomkol|cucumber|fruit|grönt|vitlök|ingefä/i,
  brod: /bröd|baguette|knäcke|frall|lavas|pita/i,
  mejeri: /mjölk|ost|smör|yoghurt|yogurt|fil|grädde|ägg|kefir|kvarg|cottage|keso|crème|creme|tjälk|halvfab/i,
  chark: /skinka|salami|leverpastej|kaviar|kallrök|medwurst|salta|pålägg|majonnäs|senap|ketchup|remoulad|äggpastej/i,
  kot: /kött|fläsk|nöt|färs|kyckl|korv|_entrecote|grill|choriz|oxfile|oxsvå|lamm/i,
  fisk: /fisk|lax|torsk|räkor|räkan|tonfisk|skaldj|kräft|sill|strömming/i,
  vegetariskt: /vegan|vegetar|halloumi|falafel|tofu|soja|bönbaserad/i,
  skafferi: /pasta|ris|mjöl|socker|salt|olja|bönor|kikär|linser|konserver|krossade|nudl|gryn|pärl|havre|flingor|kaffe|te\b/i,
  frost: /fryst|frozen|glass|piazza|gratäng fryst/i,
  dryck: /läsk|juice|mineral|vatten|dryck|öler|vin|cider|saft|kolonial?|te /i,
  gott: /godis|choklad|chips|snacks|kex|nötter|lacrit|lakrits|kaka|kladdkaka/i,
  hemma: /disk|tvätt|tvål|ren|skura|skull|soppåse|aluminium|plastpås|servett|innan?/i,
  personlig: /tand|schampo|balsam|deodorant|rakhyv|plåster|kameror|hårspray/i,
};

export function guessAisle(name: string): string {
  for (const [aisleId, re] of Object.entries(KEYWORDS)) {
    if (re.test(name)) return aisleId;
  }
  return FALLBACK_AISLE;
}

/** Ensure the store's aisle list exists and covers the fallback. */
export function ensureDefaultAisles(state: AppState): void {
  state.aisles = state.aisles ?? [];
  const have = new Set(state.aisles.map((a) => a.id));
  DEFAULT_AISLES.forEach((def, i) => {
    if (!have.has(def.id)) {
      state.aisles.push({ ...def, order: i });
    }
  });
  state.aisles.sort((a, b) => a.order - b.order);
}

/** Resolve aisle index for ordering; unknown aisles are pushed last. */
export function aisleOrderIndex(state: AppState, aisleId: string | undefined): number {
  if (!aisleId) return 1000;
  const found = state.aisles.find((a) => a.id === aisleId);
  return found ? found.order : 1000;
}

export function aisleName(state: AppState, aisleId: string | undefined): string {
  if (!aisleId) return "";
  return state.aisles.find((a) => a.id === aisleId)?.name ?? aisleId;
}

/** Suggest an aisle for a product name using keywords + past manual hints. */
export function suggestAisleFor(
  state: AppState,
  productName: string,
  basketType?: string,
): string {
  if (basketType && state.basketAisleHints[basketType]) {
    return state.basketAisleHints[basketType];
  }
  return guessAisle(productName);
}
