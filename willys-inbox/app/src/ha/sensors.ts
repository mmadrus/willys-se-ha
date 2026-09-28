import type { SupervisorBridge } from "./supervisor.js";
import type { AppState, DealItem } from "../engine/model.js";
import type { Prediction } from "../engine/predictor.js";
import { rankDeals } from "../engine/deals.js";
import { aisleName } from "../engine/aisles.js";

/**
 * Push derived sensors into HA. Sensor entities are pushed via
 * POST /core/api/states/... (works with plain homeassistant_api access).
 */
export class SensorPublisher {
  constructor(private supervisor: SupervisorBridge) {}

  async publishDeals(state: AppState, topN = 12): Promise<void> {
    const deals: DealItem[] = state.dealCache?.items ?? [];
    const ranked = rankDeals(deals, topN);
    const attrs = {
      store_id: state.dealCache?.storeId ?? "",
      updated: state.dealCache ? new Date(state.dealCache.fetchedAt).toISOString() : "",
      total_tracked: deals.length,
      items: ranked.map((d) => ({
        name: d.name,
        price: d.price,
        savings: d.savings,
        percent_off: d.percentOff,
        unit: d.unit ?? "",
        code: d.code,
      })),
    };
    await this.supervisor.setState("sensor.willys_deals", {
      state: ranked.length ? `${ranked[0].percentOff.toFixed(0)}%` : "0%",
      unit: "%",
      icon: "mdi:tag-outline",
      attributes: attrs,
    });
  }

  async publishWatchlist(state: AppState, matches: Array<{ key: string; name: string; price: number | null }>): Promise<void> {
    const tracked = Object.keys(state.watchlist).length;
    const best = matches.filter((m) => m.price !== null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
    const attrs = {
      items: matches.map((m) => ({ key: m.key, name: m.name, price: m.price })),
      tracked: tracked,
    };
    await this.supervisor.setState("sensor.willys_watchlist", {
      state: best ? best.price : "unknown",
      unit: "kr",
      icon: "mdi:eye-outline",
      attributes: attrs,
    });
  }

  async publishPredictions(state: AppState, predictions: Array<Prediction & { name: string }>): Promise<void> {
    const dueSoon = predictions
      .filter((p) => p.confidence > 0)
      .sort((a, b) => a.nextDueMs - b.nextDueMs)
      .slice(0, 15);
    const attrs = {
      items: dueSoon.map((p) => ({
        name: p.name,
        due_in_days: Math.ceil((p.nextDueMs - Date.now()) / 86_400_000),
        every_days: p.intervalDays,
        confidence: p.confidence,
        aisle: aisleName(state, state.items[p.key]?.aisle),
      })),
    };
    await this.supervisor.setState("sensor.willys_predictions", {
      state: dueSoon.length,
      icon: "mdi:cart-heart",
      attributes: attrs,
    });
  }

  async publishStatus(opts: {
    storeId: string;
    loggedIn: boolean;
    listSize: number;
    suggestionsPending: number;
    lastComposeAt: number | null;
    lastError?: string;
  }): Promise<void> {
    await this.supervisor.setState("sensor.willys_inbox_status", {
      state: opts.lastError ? "error" : opts.loggedIn ? "ok" : "starting",
      icon: "mdi:cart-outline",
      attributes: {
        store_id: opts.storeId,
        logged_in: opts.loggedIn,
        list_size: opts.listSize,
        suggestions_pending: opts.suggestionsPending,
        last_compose: opts.lastComposeAt ? new Date(opts.lastComposeAt).toISOString() : "never",
        last_error: opts.lastError ?? "",
      },
    });
  }
}
