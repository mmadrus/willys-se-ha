import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import type { AppState, PurchaseEvent, ItemEntry } from "./model.js";
import { emptyState } from "./model.js";
import { log } from "../log.js";

const STATE_FILE = "willys-state.json";
const AUDIT_FILE = "events.jsonl";

/**
 * JSON-file backed state store with atomic writes. Small dataset volume;
 * all aggregation is done in memory. The store keeps a single authoritative
 * AppState plus an append-only audit log of purchase events.
 */
export class Storage {
  private state: AppState;
  private readonly dir: string;
  private readonly statePath: string;
  private readonly auditPath: string;
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    this.dir = dataDir;
    mkdirSync(dataDir, { recursive: true });
    this.statePath = join(dataDir, STATE_FILE);
    this.auditPath = join(dataDir, AUDIT_FILE);
    this.state = this.loadState();
  }

  private loadState(): AppState {
    if (!existsSync(this.statePath)) {
      return this.migrate(emptyState());
    }
    try {
      const raw = JSON.parse(readFileSync(this.statePath, "utf8")) as Partial<AppState>;
      const base = emptyState();
      return this.migrate({
        ...base,
        ...raw,
        items: raw.items ?? {},
        stats: raw.stats ?? {},
        suggestions: raw.suggestions ?? {},
        staples: raw.staples ?? {},
        watchlist: raw.watchlist ?? {},
        basketAisleHints: raw.basketAisleHints ?? {},
      });
    } catch (e) {
      log.error("storage: failed to load state, starting fresh", e);
      const backup = `${this.statePath}.corrupt-${Date.now()}`;
      try { renameSync(this.statePath, backup); } catch { /* best effort */ }
      return this.migrate(emptyState());
    }
  }

  private migrate(s: AppState): AppState {
    if (!s.firstRunAt) s.firstRunAt = Date.now();
    return s;
  }

  get data(): AppState {
    return this.state;
  }

  /** Mutate state within fn, then persist (debounced). */
  update(fn: (s: AppState) => void): void {
    fn(this.state);
    this.schedulePersist();
  }

  /** Persist immediately (used before process exit or after big writes). */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.persistNow();
  }

  private schedulePersist(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persistNow();
    }, 500);
  }

  private persistNow(): void {
    if (!this.dirty) return;
    try {
      const tmp = `${this.statePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state), "utf8");
      renameSync(tmp, this.statePath);
      this.dirty = false;
    } catch (e) {
      log.error("storage: persist failed", e);
    }
  }

  /** Append-only audit trail for the learner (debugging + future models). */
  recordEvent(ev: PurchaseEvent | { kind: string; [k: string]: unknown }): void {
    try {
      appendFileSync(this.auditPath, JSON.stringify(ev) + "\n", "utf8");
    } catch (e) {
      log.warn("storage: audit append failed", e);
    }
  }

  // ---- convenience helpers ----

  upsertItem(partial: Partial<ItemEntry> & { key: string; name: string }): ItemEntry {
    const now = Date.now();
    const existing = this.data.items[partial.key];
    const item: ItemEntry = {
      key: partial.key,
      name: partial.name.trim() || partial.key,
      willysCode: partial.willysCode ?? existing?.willysCode,
      searchQuery: partial.searchQuery ?? existing?.searchQuery,
      aisle: partial.aisle ?? existing?.aisle ?? "other",
      aliases: partial.aliases ?? existing?.aliases,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.update((s) => {
      s.items[item.key] = item;
    });
    return item;
  }

  deleteItem(key: string): void {
    this.update((s) => {
      delete s.items[key];
      delete s.stats[key];
      delete s.staples[key];
      delete s.watchlist[key];
      for (const [id, sug] of Object.entries(s.suggestions)) {
        if (sug.key === key) delete s.suggestions[id];
      }
    });
  }
}
