import type { AppConfig } from "../config.js";
import type { TodoItemLite } from "../engine/composer.js";
import { fetchWithTimeout } from "../util.js";

/**
 * Shopping-list (todo) operations against HA via the Supervisor core API.
 */
export class ShoppingListClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(private cfg: AppConfig) {
    this.baseUrl = `${cfg.supervisorUrl}/core/api`;
    this.headers = {
      Authorization: `Bearer ${cfg.supervisorToken}`,
      "Content-Type": "application/json",
    };
  }

  /** List all items on a todo entity. */
  async getItems(entityId: string): Promise<TodoItemLite[]> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/services/todo/get_items`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ entity_id: entityId }),
      }, 15000);
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{ items: TodoItemLite[] }>;
      return data[0]?.items ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Add items sequentially to preserve ordering (todo.add_item appends).
   * Returns number of actually-added items.
   */
  async addItemsSequential(entityId: string, summaries: string[]): Promise<number> {
    let added = 0;
    for (const summary of summaries) {
      const ok = await this.addItem(entityId, summary);
      if (ok) added++;
      await new Promise((r) => setTimeout(r, 120));
    }
    return added;
  }

  async addItem(entityId: string, summary: string, description?: string): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/services/todo/add_item`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          entity_id: entityId,
          item: summary,
          ...(description ? { description } : {}),
        }),
      }, 15000);
      const ok = res.ok;
      if (!ok) {
        const t = await res.text().catch(() => "");
        console.warn(`todo add failed: ${res.status} ${t.slice(0, 120)}`);
      }
      return ok;
    } catch (e) {
      console.warn(`todo add error: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  /** Clear completed items (housekeeping before a new compose run). */
  async clearCompleted(entityId: string): Promise<void> {
    await fetchWithTimeout(`${this.baseUrl}/services/todo/clear_completed_items`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ entity_id: entityId }),
    }, 15000).catch(() => undefined);
  }
}
