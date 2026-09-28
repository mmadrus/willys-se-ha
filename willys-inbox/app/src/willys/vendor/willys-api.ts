// Vendored from https://github.com/ErikHellman/willys-agent (MIT, Erik Hellman)
// Local modification: private members made `protected` (subclassing support).

import { encryptCredential } from "./crypto.js";
import type {
  Customer,
  SearchResult,
  Category,
  Cart,
} from "./types.js";

const BASE_URL = "https://www.willys.se";
const DEFAULT_STORE_ID = "2110";

export class WillysApi {
  protected cookies = new Map<string, string>();
  protected csrfToken: string | null = null;

  protected get baseUrl(): string {
    return BASE_URL;
  }

  protected get defaultStoreId(): string {
    return DEFAULT_STORE_ID;
  }

  /**
   * Make an HTTP request with cookie and CSRF token management.
   */
  protected async request(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");

    // Attach cookies
    if (this.cookies.size > 0) {
      const cookieStr = Array.from(this.cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      headers.set("Cookie", cookieStr);
    }

    // Attach CSRF token for mutating requests
    if (
      options.method &&
      options.method !== "GET" &&
      this.csrfToken
    ) {
      headers.set("X-CSRF-TOKEN", this.csrfToken);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      redirect: "manual",
    });

    this.parseCookies(response);
    return response;
  }

  /**
   * Parse Set-Cookie headers from a response and store them.
   */
  protected parseCookies(response: Response): void {
    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    for (const header of setCookieHeaders) {
      const parts = header.split(";")[0];
      const eqIdx = parts.indexOf("=");
      if (eqIdx > 0) {
        const name = parts.substring(0, eqIdx).trim();
        const value = parts.substring(eqIdx + 1).trim();
        this.cookies.set(name, value);
      }
    }
  }

  /**
   * Fetch a fresh CSRF token from the server.
   */
  async getCsrfToken(): Promise<string> {
    // First ensure we have a session
    if (!this.cookies.has("JSESSIONID")) {
      await this.request("/api/config");
    }

    const response = await this.request("/axfood/rest/csrf-token");
    if (!response.ok) {
      throw new Error(`Failed to get CSRF token: ${response.status}`);
    }
    const token = await response.json() as string;
    this.csrfToken = token;
    return token;
  }

  /**
   * Log in to Willys with username (personnummer) and password.
   * Credentials are encrypted client-side before sending.
   */
  async login(username: string, password: string): Promise<Customer> {
    // Ensure we have a CSRF token
    await this.getCsrfToken();

    // Encrypt credentials
    const encryptedUsername = encryptCredential(username);
    const encryptedPassword = encryptCredential(password);

    const body = {
      j_username: encryptedUsername.str,
      j_username_key: encryptedUsername.key,
      j_password: encryptedPassword.str,
      j_password_key: encryptedPassword.key,
      j_remember_me: true,
    };

    const response = await this.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Login typically returns 200 on success, may redirect
    if (response.status >= 400) {
      const text = await response.text();
      throw new Error(
        `Login failed with status ${response.status}: ${text.substring(0, 200)}`,
      );
    }

    // Follow redirect if needed
    const location = response.headers.get("location");
    if (location) {
      await this.request(location);
    }

    // Refresh CSRF token after login
    await this.getCsrfToken();

    return this.getCustomer();
  }

  /**
   * Log out from Willys.
   */
  async logout(): Promise<void> {
    await this.request("/logout");
    this.csrfToken = null;
  }

  /**
   * Get the currently logged-in customer's profile.
   */
  async getCustomer(): Promise<Customer> {
    const response = await this.request("/axfood/rest/customer");
    if (!response.ok) {
      throw new Error(`Failed to get customer: ${response.status}`);
    }
    return response.json() as Promise<Customer>;
  }

  /**
   * Search for products by text query.
   */
  async search(
    query: string,
    page = 0,
    size = 30,
  ): Promise<SearchResult> {
    const params = new URLSearchParams({
      q: query,
      size: size.toString(),
      page: page.toString(),
    });
    const response = await this.request(`/search/clean?${params}`);
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    return response.json() as Promise<SearchResult>;
  }

  /**
   * Get the full category tree.
   */
  async getCategories(storeId = DEFAULT_STORE_ID): Promise<Category> {
    const params = new URLSearchParams({
      storeId,
      deviceType: "OTHER",
    });
    const response = await this.request(`/leftMenu/categorytree?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to get categories: ${response.status}`);
    }
    return response.json() as Promise<Category>;
  }

  /**
   * Browse products in a specific category.
   * @param categoryPath - URL path like "frukt-och-gront/frukt/citrusfrukt"
   */
  async browseCategory(
    categoryPath: string,
    page = 0,
    size = 30,
    sort = "",
  ): Promise<SearchResult> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
      sort,
    });
    const response = await this.request(
      `/c/${categoryPath}?${params}`,
    );
    if (!response.ok) {
      throw new Error(`Browse category failed: ${response.status}`);
    }
    return response.json() as Promise<SearchResult>;
  }

  /**
   * Get the current shopping cart.
   */
  async getCart(): Promise<Cart> {
    const response = await this.request("/axfood/rest/cart");
    if (!response.ok) {
      throw new Error(`Failed to get cart: ${response.status}`);
    }
    return response.json() as Promise<Cart>;
  }

  /**
   * Add one or more products to the cart.
   */
  async addToCart(
    products: Array<{ code: string; qty: number }>,
  ): Promise<Cart> {
    if (!this.csrfToken) {
      await this.getCsrfToken();
    }

    const body = {
      products: products.map((p) => ({
        productCodePost: p.code,
        qty: p.qty,
        pickUnit: "pieces",
        hideDiscountToolTip: false,
        noReplacementFlag: false,
      })),
    };

    const response = await this.request("/axfood/rest/cart/addProducts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Add to cart failed: ${response.status} - ${text.substring(0, 200)}`,
      );
    }

    return this.getCart();
  }

  /**
   * Remove a product from the cart (sets quantity to 0).
   */
  async removeFromCart(productCode: string): Promise<Cart> {
    return this.addToCart([{ code: productCode, qty: 0 }]);
  }

  /**
   * Clear all products from the cart.
   */
  async clearCart(): Promise<void> {
    if (!this.csrfToken) {
      await this.getCsrfToken();
    }

    const response = await this.request("/axfood/rest/cart", {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`Clear cart failed: ${response.status}`);
    }
  }
}
