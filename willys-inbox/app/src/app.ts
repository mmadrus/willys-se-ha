import type { AppConfig } from "./config.js";
import { Storage } from "./engine/storage.js";
import { WillysSession } from "./willys/session.js";
import { fetchDeals } from "./willys/deals.js";
import { SupervisorBridge } from "./ha/supervisor.js";
import { ShoppingListClient } from "./ha/shoppinglist.js";
import { HaEventsBridge, type DecisionInput } from "./ha/events.js";
import { SensorPublisher } from "./ha/sensors.js";
import { ensureDefaultAisles, suggestAisleFor, DEFAULT_AISLES } from "./engine/aisles.js";
import { composeRun, type ComposeResult, type TodoItemLite } from "./engine/composer.js";
import { predict } from "./engine/predictor.js";
import { matchWatchlist } from "./engine/deals.js";
import { normalizeItem } from "./util.js";
import { log } from "./log.js";
import {
  AI_PROVIDERS,
  aiConfigured,
  aiTest,
  effectiveAi,
  loadAiConfig,
  matchPurchaseKey,
  nlParseItems,
  saveAiConfig,
  isAiProvider,
  type AiConfig,
  type AiConnector,
  type AiProvider,
} from "./ai/llm.js";

const LOG = log.child("app");
const DECISION_ENTITY = "input_text.willys_decision";
const COMMAND_ENTITY = "input_text.willys_command";

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
  image?: string | null;
}

export interface SearchResponse {
  results: SearchHit[];
  page: number;
  pages: number;
  total: number;
  brandName?: string;
}

export class WillysApp {
  readonly storage: Storage;
  readonly session: WillysSession;
  readonly supervisor: SupervisorBridge;
  readonly shoppingList: ShoppingListClient;
  readonly sensors: SensorPublisher;
  private events: HaEventsBridge | null = null;
  private lastError = "";
  ai: AiConfig;

  /** Effective shopping-list entity: panel override wins over the option. */
  get todoEntity(): string {
    return (
      this.storage.data.todoEntityOverride ||
      this.cfg.todoEntity ||
      "todo.shopping_list"
    );
  }

  constructor(readonly cfg: AppConfig) {
    this.storage = new Storage(cfg.dataDir);
    this.session = new WillysSession(cfg.willysUsername, cfg.willysPassword, cfg.storeId);
    this.supervisor = new SupervisorBridge(cfg);
    this.shoppingList = new ShoppingListClient(cfg);
    this.sensors = new SensorPublisher(this.supervisor);
    this.ai = loadAiConfig(cfg.dataDir);
  }

  async boot(): Promise<void> {
    ensureDefaultAisles(this.storage.data);
    await this.storage.flush();

    this.events = new HaEventsBridge(this.supervisor, this.shoppingList, {
      todoEntity: this.todoEntity,
      decisionEntity: DECISION_ENTITY,
      commandEntity: COMMAND_ENTITY,
      pollSeconds: this.cfg.eventsPollSeconds,
    });
    this.events.start(
      (name) => this.handlePurchase(name),
      (d) => void this.handleDecision(d),
      (c) => void this.handleCommand(c),
    );

    // Initial supervisor connectivity check (non-fatal in dev mode)
    LOG.info(
      `supervisor token: ${this.cfg.supervisorToken ? `present (len ${this.cfg.supervisorToken.length})` : "MISSING - reinstall add-on to grant API access"}`,
    );
    const ok = await this.supervisor.coreApiAvailable();
    if (!ok) LOG.warn("supervisor core API not usable - sensors/notify disabled until fixed");

    setInterval(() => void this.publishAllSensors(), 5 * 60_000);
    setInterval(() => void this.runPredictorCycle(), 2 * 60 * 60_000);
    setInterval(() => void this.scheduledCompose(), 30 * 60_000);
    setInterval(() => void this.refreshDealsJob(), this.cfg.dealsRefreshMinutes * 60_000);

    // initial runs (staggered to not hammer on boot)
    setTimeout(() => void this.refreshDealsJob().catch((e) => LOG.warn(`deals: ${e}`)), 5_000);
    setTimeout(() => void this.runPredictorCycle().catch((e) => LOG.warn(`predict: ${e}`)), 12_000);
    setTimeout(() => void this.publishAllSensors().catch((e) => LOG.warn(`sensors: ${e}`)), 3_000);
  }

  async shutdown(): Promise<void> {
    this.events?.stop();
    await this.storage.flush();
  }

  // ------------------------------------------------------------------ deals

  async refreshDealsJob(): Promise<void> {
    if (!this.cfg.willysUsername) {
      LOG.info("no credentials configured; skipping deals fetch");
      return;
    }
    try {
      await this.session.ensureLoggedIn();
      const wantedStore = this.storage.data.storeOverride || this.cfg.storeId || "";
      if (wantedStore && wantedStore !== this.session.currentStoreId) {
        await this.session.selectStore(wantedStore);
      }
      const result = await fetchDeals(this.session);
      this.storage.update((s) => {
        s.dealCache = { fetchedAt: result.fetchedAt, storeId: result.storeId, items: result.items };
      });
      this.lastError = "";
      await this.publishAllSensors();
      LOG.info(`deals refreshed: ${result.items.length} items (path=${result.usedPath})`);
    } catch (e) {
      this.lastError = `deals: ${e instanceof Error ? e.message : String(e)}`;
      LOG.error(this.lastError);
      await this.sensors.publishStatus({
        storeId: this.session.currentStoreId,
        loggedIn: false,
        listSize: 0,
        suggestionsPending: this.pendingSuggestions().length,
        lastComposeAt: this.storage.data.lastComposeAt,
        lastError: this.lastError,
      });
    }
  }

  // ------------------------------------------------------------- predictor

  async runPredictorCycle(): Promise<void> {
    const state = this.storage.data;
    const now = Date.now();

    // create pending suggestions for due items (panel + notification)
    const created: Array<{ id: string; name: string; confidence: number; dueInDays: number }> = [];
    this.storage.update((s) => {
      for (const key of Object.keys(s.stats)) {
        const stats = s.stats[key];
        const item = s.items[key];
        if (!item || stats.mode === "never") continue;
        const pred = predict(stats);
        if (!pred) continue;
        const openFrom = pred.nextDueMs - this.cfg.notificationLeadDays * 86_400_000;
        const closeTo = pred.nextDueMs + 5 * 86_400_000;
        if (now < openFrom || now > closeTo) continue;
        if (stats.lastDismissedAt && now - stats.lastDismissedAt < Math.max(3, pred.intervalDays * 1.5) * 86_400_000) continue;
        const alreadyPending = Object.values(s.suggestions).some(
          (sg) => sg.key === key && sg.status === "pending" && sg.reason === "due",
        );
        if (alreadyPending) continue;
        const id = `s${now.toString(36)}${normalizeItem(key).replaceAll(" ", "").slice(0, 8)}`;
        s.suggestions[id] = {
          id,
          key,
          name: item.name,
          reason: "due",
          intervalDays: pred.intervalDays,
          confidence: pred.confidence,
          dueAt: pred.nextDueMs,
          createdAt: now,
          status: "pending",
        };
        created.push({ id, name: item.name, confidence: pred.confidence, dueInDays: Math.ceil((pred.nextDueMs - now) / 86_400_000) });
      }
    });

    if (created.length) {
      LOG.info(`predictor created ${created.length} suggestion(s)`);
      await this.notifySuggestions(created);
    }
    await this.publishAllSensors();
  }

  private async notifySuggestions(items: Array<{ id: string; name: string; confidence: number; dueInDays: number; reason?: string }>): Promise<void> {
    const perItem = items.length <= this.cfg.digestThreshold;
    for (const it of items) {
      const isDeal = it.reason === "deal";
      const detail = isDeal
        ? "är nedsatt just nu"
        : `behövs ${it.dueInDays <= 0 ? "idag" : it.dueInDays === 1 ? "imorgon" : `om ${it.dueInDays} dagar`} (säkerhet ${(it.confidence * 100).toFixed(0)}%)`;
      if (perItem && this.cfg.notifyService) {
        await this.supervisor.notify(
          "My Willys List",
          `${it.name} ${detail}`,
          [
            { action: `WILLYS_${it.id}_ADD`, title: "Lägg i listan" },
            { action: `WILLYS_${it.id}_SKIP`, title: "Inte nu" },
            { action: `WILLYS_${it.id}_NEVER`, title: "Aldrig" },
          ],
        );
      }
    }
    if (!perItem) {
      const lines = items.map((i) => `• ${i.name}${i.reason === "deal" ? " (rea)" : ` (om ${i.dueInDays} d)`}`).join("\n");
      await this.supervisor.notify("My Willys List – handla snart", lines, [
        { action: "WILLYS_DIGEST_ADD", title: "Lägg till alla" },
      ]);
    } else if (!this.cfg.notifyService) {
      const lines = items.map((i) => `• ${i.name}${i.reason === "deal" ? " (rea)" : ` (om ${i.dueInDays} d)`}`).join("\n");
      await this.supervisor.notifyPersistent("My Willys List", `Att handla snart:\n${lines}\n\nÖppna panelen för att godkänna.`);
    }
  }

  // ---------------------------------------------------------------- compose

  async scheduledCompose(): Promise<void> {
    // Run only within the configured compose window (day-of-week + lead window)
    const now = new Date();
    if (this.cfg.composeDayOfWeek !== null && now.getDay() !== this.cfg.composeDayOfWeek) return;
    if (now.getHours() !== this.cfg.composeHour) return;
    await this.composeNow(false);
  }

  async composeNow(includeDeals = true): Promise<ComposeResult> {
    const todos = await this.shoppingList.getItems(this.todoEntity).catch((): TodoItemLite[] => []);
    const result = composeRun(this.storage.data, todos, {
      autoMode: this.cfg.autoAddMode,
      autoConfidence: this.cfg.autoAddConfidence,
      notificationLeadDays: this.cfg.notificationLeadDays,
      includeDeals,
      dealMode: this.storage.data.dealComposeMode === "add" ? "add" : "ask",
    });

    if (result.listEntries.length) {
      // Verify the target entity exists before attempting writes
      if (!(await this.todoEntityExists(this.todoEntity))) {
        const available = await this.listTodoEntities();
        this.lastError =
          `to-do entity ${this.todoEntity} not found. Available: ` +
          (available.map((t) => t.entity_id).join(", ") || "none") +
          ". Pick one in the panel settings.";
        LOG.error(this.lastError);
        result.added = 0;
        return result;
      }
      const summaries = result.listEntries.map((e) => e.name);
      const added = await this.shoppingList.addItemsSequential(this.todoEntity, summaries);
      result.added = added;
      LOG.info(`compose: added ${added}/${summaries.length} items to ${this.todoEntity}`);
      if (added === 0) {
        this.lastError = `could not add to ${this.todoEntity} - does the to-do entity exist?`;
        LOG.error(`${this.lastError}`);
      }
      for (const e of result.listEntries) {
        this.storage.update((s) => {
          const stats = (s.stats[e.key] ??= {
            key: e.key,
            purchases: [],
            addedCount: 0,
            dismissedCount: 0,
            mode: "suggest",
          });
          stats.addedCount++;
          stats.lastAddedAt = Date.now();
        });
        this.storage.recordEvent({ at: Date.now(), kind: "added", key: e.key, name: e.name, source: "compose", reason: e.reason });
      }
    } else {
      LOG.info(
        `compose: nothing to add (staples=${result.sources.staples}, due=${result.sources.due}, deals=${result.sources.deals})`,
      );
    }

    // merge new deal/due suggestions into pending store
    if (result.suggestions.length) {
      this.storage.update((s) => {
        for (const sug of result.suggestions) {
          const dupe = Object.values(s.suggestions).find(
            (x) => x.key === sug.key && x.status === "pending" && x.reason === sug.reason,
          );
          if (!dupe) s.suggestions[sug.id] = sug;
        }
      });
      await this.notifySuggestions(
        result.suggestions.map((s) => ({
          id: s.id,
          name: s.name,
          confidence: s.confidence,
          dueInDays: s.dueAt ? Math.ceil((s.dueAt - Date.now()) / 86_400_000) : 0,
          reason: s.reason,
        })),
      );
    }

    this.storage.update((s) => {
      s.lastComposeAt = Date.now();
    });
    await this.publishAllSensors();
    return result;
  }

  // ---------------------------------------------------------------- events

  /** Called when a todo item is checked off = purchase happened. */
  handlePurchase(nameOrKey: string): void {
    const key = this.resolveKey(nameOrKey);
    if (!this.storage.data.items[key]) {
      // No registry hit: audit it and let the AI try to match it to a known item
      this.storage.recordEvent({ at: Date.now(), kind: "purchase-unmatched", name: nameOrKey, source: "todo" });
      this.aiMatchPurchase(nameOrKey);
      return;
    }
    this.recordPurchase(key, nameOrKey, "exact");
  }

  private recordPurchase(key: string, todoName: string, matchedBy: string): void {
    const name = this.storage.data.items[key]?.name ?? todoName;
    this.storage.update((s) => {
      const stats = (s.stats[key] ??= {
        key,
        purchases: [],
        addedCount: 0,
        dismissedCount: 0,
        mode: "suggest",
      });
      stats.purchases.push(Date.now());
      if (stats.purchases.length > 200) stats.purchases = stats.purchases.slice(-200);
      for (const [id, sug] of Object.entries(s.suggestions)) {
        if (sug.key === key && sug.status === "pending") {
          sug.status = "accepted";
          sug.decidedAt = Date.now();
        }
      }
    });
    this.storage.recordEvent({ at: Date.now(), kind: "purchase", key, name, source: "todo", matchedBy });
    LOG.info(`purchase recorded: ${name} (${key}, ${matchedBy})`);
    void this.publishAllSensors();
  }

  /** Ask the AI to map a checked-off line to a known registry item. */
  private aiMatchPurchase(todoName: string): void {
    const items = this.storage.data.items;
    const cached = this.storage.data.aiMatchCache[normalizeItem(todoName)];
    if (cached && items[cached]) {
      this.recordPurchase(cached, todoName, "ai-cache");
      return;
    }
    if (!aiConfigured(this.ai)) {
      LOG.info(`unmatched purchase "${todoName}" (no AI configured)`);
      return;
    }
    const candidates = Object.values(items).map((i) => ({ key: i.key, name: i.name }));
    if (!candidates.length) return;
    matchPurchaseKey(this.ai, todoName, candidates)
      .then((aiKey) => {
        if (!aiKey) return;
        this.storage.update((s) => {
          s.aiMatchCache[normalizeItem(todoName)] = aiKey;
        });
        this.recordPurchase(aiKey, todoName, "ai");
      })
      .catch((e) => LOG.warn(`AI match failed: ${e instanceof Error ? e.message : e}`));
  }

  // --------------------------------------------------------------- ai

  getAiConfig(): {
    configured: boolean;
    providers: Array<{ id: AiProvider; label: string; baseUrl: string; defaultModel: string }>;
    connectors: Array<{
      id: string;
      provider: AiProvider;
      baseUrl: string;
      model: string;
      apiKeyHint: string;
    }>;
  } {
    return {
      configured: aiConfigured(this.ai),
      providers: Object.values(AI_PROVIDERS).map((p) => ({
        id: p.id,
        label: p.label,
        baseUrl: p.baseUrl,
        defaultModel: p.defaultModel,
      })),
      connectors: this.ai.connectors.map((c) => ({
        id: c.id,
        provider: c.provider,
        baseUrl: effectiveAi(c).baseUrl,
        model: effectiveAi(c).model,
        apiKeyHint: c.apiKey ? `${c.apiKey.slice(0, 3)}…${c.apiKey.slice(-4)}` : "",
      })),
    };
  }

  /** Add a new connector (id generated) or update an existing one by id. */
  upsertAiConnector(patch: {
    id?: string;
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }): AiConnector {
    let connector: AiConnector | undefined = patch.id
      ? this.ai.connectors.find((c) => c.id === patch.id)
      : undefined;
    if (!connector) {
      connector = {
        id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
        provider: "opencode",
        apiKey: "",
        baseUrl: "",
        model: "",
      };
      this.ai.connectors.push(connector);
    }
    if (typeof patch.provider === "string" && isAiProvider(patch.provider)) {
      if (patch.provider !== connector.provider) {
        connector.baseUrl = "";
        connector.model = "";
      }
      connector.provider = patch.provider;
    }
    if (typeof patch.apiKey === "string" && patch.apiKey.trim()) connector.apiKey = patch.apiKey.trim();
    if (typeof patch.baseUrl === "string") connector.baseUrl = patch.baseUrl.trim().replace(/\/+$/, "");
    if (typeof patch.model === "string") connector.model = patch.model.trim();
    saveAiConfig(this.cfg.dataDir, this.ai);
    LOG.info(
      `AI connector ${connector.id} saved (provider=${connector.provider}, model=${effectiveAi(connector).model})`,
    );
    return connector;
  }

  removeAiConnector(id: string): void {
    this.ai.connectors = this.ai.connectors.filter((c) => c.id !== id);
    saveAiConfig(this.cfg.dataDir, this.ai);
    LOG.info(`AI connector ${id} removed`);
  }

  reorderAiConnectors(ids: string[]): void {
    this.ai.connectors.sort((a, b) => {
      const ia = ids.indexOf(a.id);
      const ib = ids.indexOf(b.id);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    saveAiConfig(this.cfg.dataDir, this.ai);
    LOG.info(`AI connector order: ${ids.join(" -> ")}`);
  }

  async testAiConnector(id: string): Promise<{ ok: boolean; model: string; latencyMs: number; error?: string }> {
    const c = this.ai.connectors.find((x) => x.id === id);
    if (!c) return { ok: false, model: "?", latencyMs: 0, error: "okänd anslutning" };
    return aiTest(c);
  }

  /** Natural language: "2 liter mjölk och ett bröd" -> items on the list. */
  async aiAdd(text: string): Promise<Array<{ key: string; name: string; qty: number }>> {
    const parsed = await nlParseItems(this.ai, text);
    const added: Array<{ key: string; name: string; qty: number }> = [];
    for (const p of parsed) {
      const key = normalizeItem(p.name);
      if (!this.storage.data.items[key]) {
        this.storage.upsertItem({
          key,
          name: p.name,
          searchQuery: p.name,
          aisle: suggestAisleFor(this.storage.data, p.name),
        });
      }
      await this.shoppingList.addItem(this.todoEntity, p.qty > 1 ? `${p.qty}x ${p.name}` : p.name);
      this.storage.update((s) => {
        const stats = (s.stats[key] ??= {
          key,
          purchases: [],
          addedCount: 0,
          dismissedCount: 0,
          mode: "suggest",
        });
        stats.addedCount++;
        stats.lastAddedAt = Date.now();
      });
      this.storage.recordEvent({ at: Date.now(), kind: "added", key, name: p.name, source: "ai" });
      added.push({ key, name: p.name, qty: p.qty });
    }
    await this.publishAllSensors();
    return added;
  }

  async handleDecision(d: DecisionInput): Promise<void> {
    const state = this.storage.data;
    const sug = state.suggestions[d.suggestionId];
    if (!sug) {
      // digest action: add all pending "due" suggestions
      if (d.suggestionId === "digest" && d.choice === "add") {
        const pending = Object.values(state.suggestions).filter((s) => s.status === "pending");
        for (const p of pending) await this.applyDecision(p.key, "add", p.name);
      }
      return;
    }
    await this.applyDecision(sug.key, d.choice, sug.name);
    this.storage.update((s) => {
      const s2 = s.suggestions[d.suggestionId];
      if (s2) {
        s2.status = d.choice === "add" ? "accepted" : d.choice === "never" ? "expired" : "dismissed";
        s2.decidedAt = Date.now();
      }
    });
  }

  /** HA-side commands via input_text.willys_command (compose/refresh). */
  async handleCommand(c: { cmd: string }): Promise<void> {
    if (c.cmd === "compose") {
      await this.composeNow(true);
    } else if (c.cmd === "refresh") {
      await this.refreshDealsJob();
    }
  }

  // ------------------------------------------------- manual jobs

  /** Run a scheduled job on demand: deals | predict | compose. */
  async runJob(job: string): Promise<void> {
    if (job === "deals") {
      await this.refreshDealsJob();
    } else if (job === "predict") {
      await this.runPredictorCycle();
    } else if (job === "compose") {
      await this.composeNow(true);
    } else {
      throw new Error(`unknown job: ${job}`);
    }
  }

  // ------------------------------------------------- store switching

  getEffectiveStoreId(): string {
    return this.storage.data.storeOverride || this.cfg.storeId || this.session.currentStoreId || "";
  }

  /** Switch store for the session and persist the choice. */
  async setStore(storeId: string): Promise<void> {
    await this.session.ensureLoggedIn();
    await this.session.selectStore(storeId);
    this.storage.update((s) => {
      s.storeOverride = storeId;
    });
    LOG.info(`store set to ${storeId}`);
    await this.refreshDealsJob();
  }

  // ------------------------------------------------- shopping list target

  /** All to-do entities currently present in HA. */
  async listTodoEntities(): Promise<Array<{ entity_id: string; name: string }>> {
    try {
      const res = await fetch(`${this.supervisor.urlFor("/core/api/states")}`, {
        headers: { Authorization: `Bearer ${this.supervisor.token}` },
      });
      if (!res.ok) return [];
      const states = (await res.json()) as Array<{
        entity_id: string;
        attributes?: { friendly_name?: string };
      }>;
      return states
        .filter((s) => s.entity_id.startsWith("todo."))
        .map((s) => ({
          entity_id: s.entity_id,
          name: s.attributes?.friendly_name ?? s.entity_id,
        }));
    } catch {
      return [];
    }
  }

  setTodoEntityOverride(entityId: string | null): void {
    const clean = entityId?.trim();
    this.storage.update((s) => {
      s.todoEntityOverride = clean ? clean : null;
    });
    LOG.info(`shopping list entity set to: ${this.todoEntity}`);
  }

  getDealComposeMode(): "ask" | "add" {
    return this.storage.data.dealComposeMode === "add" ? "add" : "ask";
  }

  setDealComposeMode(mode: "ask" | "add"): void {
    this.storage.update((s) => {
      s.dealComposeMode = mode === "add" ? "add" : "ask";
    });
    LOG.info(`deal compose mode: ${mode}`);
  }

  /** Does the configured to-do entity exist in HA? */
  async todoEntityExists(entityId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.supervisor.urlFor(`/core/api/states/${entityId}`)}`, {
        headers: { Authorization: `Bearer ${this.supervisor.token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async applyDecision(key: string, choice: DecisionInput["choice"], name: string): Promise<void> {    if (choice === "add") {
      await this.shoppingList.addItem(this.todoEntity, name);
      this.storage.recordEvent({ at: Date.now(), kind: "added", key, name, source: "panel" });
    } else if (choice === "pass") {
      this.storage.update((s) => {
        const stats = (s.stats[key] ??= { key, purchases: [], addedCount: 0, dismissedCount: 0, mode: "suggest" });
        stats.dismissedCount++;
        stats.lastDismissedAt = Date.now();
      });
      this.storage.recordEvent({ at: Date.now(), kind: "dismissed", key, name });
    } else if (choice === "never") {
      this.storage.update((s) => {
        const stats = (s.stats[key] ??= { key, purchases: [], addedCount: 0, dismissedCount: 0, mode: "suggest" });
        stats.mode = "never";
      });
      this.storage.recordEvent({ at: Date.now(), kind: "never", key, name });
    }
    await this.publishAllSensors();
  }

  private resolveKey(nameOrKey: string): string {
    const norm = normalizeItem(nameOrKey);
    const state = this.storage.data;
    if (state.items[norm]) return norm;
    const cached = state.aiMatchCache[norm];
    if (cached && state.items[cached]) return cached;
    // fuzzy: item whose normalized name matches or alias hit
    for (const [key, item] of Object.entries(state.items)) {
      if (normalizeItem(item.name) === norm) return key;
      if (item.aliases?.some((a) => normalizeItem(a) === norm)) return key;
    }
    return norm;
  }

  // ----------------------------------------------------------------- panel

  async searchProducts(query: string, page = 0, size = 24): Promise<SearchResponse> {
    await this.session.ensureLoggedIn();
    const res = await this.session.search(query, page, size);
    const total = res.pagination?.totalNumberOfResults ?? res.results?.length ?? 0;
    const pages = Math.max(1, Math.ceil(total / size));
    let results: SearchHit[] = (res.results ?? []).map((p) => this.toSearchHit(p));
    let brandName: string | undefined;

    // Brand refinement (first page only): Solr OR-matches brand words but
    // ranks them poorly ("mjölk skånemejeri" -> Garant first). Probe each
    // token as a standalone search; if its products share a manufacturer
    // containing the token, it's a brand -> rank those products first.
    if (page === 0) {
      const tokens = [...new Set(
        query.split(/\s+/).map((t) => normalizeItem(t)).filter((t) => t.length >= 4),
      )];
      if (tokens.length >= 2) {
        const topManufacturers = (res.results ?? [])
          .slice(0, 10)
          .map((p) => normalizeItem(String((p as { manufacturer?: string }).manufacturer ?? "")))
          .join(" ");
        for (const token of tokens) {
          if (topManufacturers.includes(token)) continue; // brand already ranked
          try {
            const probe = await this.session.search(token, 0, 40);
            const hits = (probe.results ?? []).filter((p) =>
              normalizeItem(String((p as { manufacturer?: string }).manufacturer ?? "")).includes(token),
            );
            if (hits.length === 0) continue;
            // Majority vote: pick the most common matching manufacturer
            const counts = new Map<string, number>();
            for (const p of hits) {
              const man = String((p as { manufacturer?: string }).manufacturer ?? "").trim();
              if (man && normalizeItem(man).includes(token)) {
                counts.set(man, (counts.get(man) ?? 0) + 1);
              }
            }
            const brand = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? token;
            brandName = brand;
            const otherTokens = tokens.filter((t) => t !== token);
            const seen = new Set(results.map((r) => r.code));
            const fresh = hits
              .filter((p) => String((p as { manufacturer?: string }).manufacturer ?? "").trim() === brand)
              .map((p) => this.toSearchHit(p))
              .filter((r) => !seen.has(r.code));
            const nameMatches = fresh.filter((r) =>
              otherTokens.every((t) => normalizeItem(r.name).includes(t)),
            );
            const rest = fresh.filter((r) => !nameMatches.includes(r));
            results = [...nameMatches, ...rest, ...results];
            break; // one brand pass is enough
          } catch (e) {
            LOG.warn(`brand probe '${token}' failed: ${e instanceof Error ? e.message : e}`);
          }
        }
      }
    }

    return { results, page, pages, total, brandName };
  }

  private toSearchHit(p: {
    code: string;
    name: string;
    priceValue: number;
    displayVolume?: string;
    savingsAmount?: string | number | null;
    labels?: string[];
    outOfStock?: boolean;
    productBasketType?: { code?: string };
    image?: { url: string } | null;
    thumbnail?: { url: string } | null;
    manufacturer?: string;
  }): SearchHit {
    const savings = Number(p.savingsAmount ?? 0) || 0;
    return {
      code: p.code,
      name: p.name,
      price: p.priceValue,
      unit: p.displayVolume ?? "",
      savings,
      percentOff: savings > 0 ? Math.round((savings / (p.priceValue + savings)) * 100) : 0,
      labels: p.labels ?? [],
      outOfStock: Boolean(p.outOfStock),
      basketType: p.productBasketType?.code,
      image: p.image?.url ?? p.thumbnail?.url ?? null,
    };
  }

  addFromSearch(payload: {
    name: string;
    code?: string;
    query?: string;
    asStaple?: boolean;
    watch?: boolean;
    aisle?: string;
    basketHint?: string;
  }): { key: string; aisle: string } {
    const key = normalizeItem(payload.name);
    const state = this.storage.data;
    const aisle = payload.aisle ?? suggestAisleFor(state, payload.name, payload.basketHint);
    this.storage.upsertItem({
      key,
      name: payload.name,
      willysCode: payload.code,
      searchQuery: payload.query ?? payload.name,
      aisle,
    });
    if (payload.asStaple) {
      this.storage.update((s) => {
        s.staples[key] = { key, active: true, qty: 1 };
      });
    }
    if (payload.watch) {
      this.storage.update((s) => {
        s.watchlist[key] = { key };
      });
    }
    this.storage.recordEvent({ at: Date.now(), kind: "item-added", key, name: payload.name, source: "search" });
    return { key, aisle };
  }

  private pendingSuggestions() {
    return Object.values(this.storage.data.suggestions).filter((s) => s.status === "pending");
  }

  // --------------------------------------------------------------- sensors

  async publishAllSensors(): Promise<void> {
    const state = this.storage.data;
    try {
      await this.sensors.publishDeals(state, 12);

      const matches = matchWatchlist(state, state.dealCache?.items ?? []).map((m) => ({
        key: m.itemKey,
        name: state.items[m.itemKey]?.name ?? m.itemKey,
        price: m.deal.price,
      }));
      await this.sensors.publishWatchlist(state, matches);

      const predictions = Object.values(state.stats)
        .map((stats) => {
          const p = predict(stats);
          if (!p) return null;
          return { ...p, name: state.items[stats.key]?.name ?? stats.key };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      await this.sensors.publishPredictions(state, predictions);

      let listSize = 0;
      if (this.cfg.supervisorToken) {
        listSize = (await this.shoppingList.getItems(this.todoEntity).catch(() => [])).filter((t) => t.status === "needs_action").length;
      }
      await this.sensors.publishStatus({
        storeId: this.session.currentStoreId,
        loggedIn: true,
        listSize,
        suggestionsPending: this.pendingSuggestions().length,
        lastComposeAt: state.lastComposeAt,
        lastError: this.lastError,
      });
    } catch (e) {
      LOG.warn(`sensor publish failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  get aisles() {
    return DEFAULT_AISLES;
  }
}
