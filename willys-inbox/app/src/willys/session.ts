import { WillysApi } from "./vendor/willys-api.js";
import type { Product, SearchResult } from "./vendor/types.js";
import { log } from "../log.js";

const LOG = log.child("willys");

export interface StoreInfo {
  id: string;
  name: string;
  address?: string;
  city?: string;
}

/**
 * Willys client: session wrapper around the vendored lib with automatic
 * re-login, store switching (via axfood store cookies), and the extra
 * endpoints we need (store list, campaigns, basket-type enriched search).
 *
 * Endpoint notes (verified against willys.se web app 2026-09):
 *  - GET  /axfood/rest/v2/store                 -> store list (storeId/name/address)
 *  - POST /axfood/rest/v2/store/activate?storeId=...&activelySelected=true
 *  - GET  /axfood/rest/v2/search/campaigns?page&size -> campaign products
 *    (fields: priceValue, savingsAmount (numeric), potentialPromotions[].campaignType
 *     GENERAL | LOYALTY (Willys plus member price))
 *  - GET  /search/clean?q=&size=&page=          -> search results
 *  - productBasketType.code used for aisle hints
 */
export class WillysSession extends WillysApi {
  private username: string;
  private password: string;
  private storeId: string;
  private loggedIn = false;
  private lastLoginAt = 0;
  private loginPromise: Promise<void> | null = null;

  constructor(username: string, password: string, storeId = "") {
    super();
    this.username = username;
    this.password = password;
    this.storeId = storeId;
  }

  get currentStoreId(): string {
    return this.storeId;
  }

  async ensureLoggedIn(): Promise<void> {
    if (this.loggedIn) return;
    if (!this.loginPromise) {
      this.loginPromise = this.doLogin().finally(() => {
        this.loginPromise = null;
      });
    }
    return this.loginPromise;
  }

  private async doLogin(): Promise<void> {
    const customer = await super.login(this.username, this.password);
    this.loggedIn = true;
    this.lastLoginAt = Date.now();
    const homeStore = customer.homeStoreId ?? customer.storeId;
    if (!this.storeId) this.storeId = String(homeStore ?? "");
    LOG.info(`logged in as ${customer.firstName ?? customer.name}, store=${this.storeId}`);
  }

  /** Request that re-authenticates once on 401/403 then retries. */
  private async authed<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureLoggedIn();
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/status 40[13]/.test(msg) || /session/i.test(msg)) {
        LOG.warn(`session expired, re-logging in (${msg.slice(0, 80)})`);
        this.loggedIn = false;
        await this.ensureLoggedIn();
        return fn();
      }
      throw e;
    }
  }

  /** Public variant of the protected raw request, with auth wrapper. */
  async raw(path: string, init: RequestInit = {}): Promise<Response> {
    return this.authed(() => this.request(path, init));
  }

  async rawNoAuth(path: string, init: RequestInit = {}): Promise<Response> {
    return this.request(path, init);
  }

  async searchValidated(query: string, size = 30): Promise<SearchResult> {
    return this.authed(() => super.search(query, 0, size));
  }

  override async getCategories(storeId?: string) {
    return this.authed(() => super.getCategories(storeId ?? this.storeId));
  }

  override async browseCategory(path: string, page = 0, size = 30, sort = ""): Promise<SearchResult> {
    return this.authed(() => super.browseCategory(path, page, size, sort));
  }

  override async getCart() {
    return this.authed(() => super.getCart());
  }

  override async addToCart(products: Array<{ code: string; qty: number }>) {
    return this.authed(() => super.addToCart(products));
  }

  override async search(query: string, page = 0, size = 30): Promise<SearchResult> {
    return this.searchValidated(query, size);
  }

  // ---- extension endpoints (verified against willys.se 2026-09) ----

  /** GET /axfood/rest/v2/store — full store list (257 stores). */
  async getStores(): Promise<StoreInfo[]> {
    type RawStore = {
      storeId: number | string;
      name: string;
      address?: { line1?: string; town?: string } | null;
    };
    const res = await this.rawNoAuth("/axfood/rest/v2/store");
    if (!res.ok) throw new Error(`getStores failed: ${res.status}`);
    const list = (await res.json()) as RawStore[];
    return (list ?? [])
      .filter((s) => s.name)
      .map((s) => ({
        id: String(s.storeId),
        name: s.name,
        address: s.address?.line1 ?? undefined,
        city: s.address?.town ?? undefined,
      }));
  }

  /** GET /axfood/rest/v2/store/active — diagnostics: which store the session uses. */
  async getActiveStore(): Promise<{ id: string; name: string } | null> {
    const res = await this.raw("/axfood/rest/v2/store/active");
    if (!res.ok) return null;
    const s = (await res.json()) as { storeId?: number | string; name?: string };
    return { id: String(s.storeId ?? ""), name: s.name ?? "" };
  }

  /** POST /axfood/rest/v2/store/activate?storeId=...&activelySelected=true — switch store. */
  async selectStore(storeId: string): Promise<void> {
    const params = new URLSearchParams({
      storeId,
      activelySelected: "true",
      forceAsPickingStore: "true",
    });
    const res = await this.raw(`/axfood/rest/v2/store/activate?${params}`, {
      method: "POST",
    });
    if (!res.ok) {
      LOG.warn(`store activate returned ${res.status}; session may keep home store`);
    }
    this.storeId = storeId;
  }

  /** Product lookup by exact code (panel deep-links use this). */
  async getProduct(code: string): Promise<Product | null> {
    const res = await this.raw(`/p/${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { product?: Product } | Product;
    const product = (data as { product?: Product }).product ?? data as Product;
    return product;
  }

  /** LOW-level: paged browse across a category with sort=novelty|campaign. */
  async browseAll(
    categoryPath: string,
    opts: { size?: number; maxPages?: number; sort?: string } = {},
  ): Promise<Product[]> {
    const size = opts.size ?? 60;
    const maxPages = opts.maxPages ?? 12;
    const out: Product[] = [];
    for (let page = 0; page < maxPages; page++) {
      const res = await this.authed(() =>
        super.browseCategory(categoryPath, page, size, opts.sort ?? ""),
      );
      const items = res.results ?? [];
      out.push(...items);
      const total = res.pagination?.totalNumberOfResults ?? 0;
      if (out.length >= total || items.length === 0) break;
      await new Promise((r) => setTimeout(r, 350));
    }
    return out;
  }
}
