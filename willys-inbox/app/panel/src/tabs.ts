import { h, type JSX } from "preact";
import htm from "htm";
import { useState, useEffect, useMemo, useRef } from "preact/hooks";
import { api } from "./api";
import { ProductCard, ProductGrid, formatKr } from "./components";
import { useTheme, THEME_DEFAULTS, WILLYS_RED, type ThemePrefs } from "./theme";
import type {
  AppStateData,
  DebugInfo,
  SearchHit,
  StoreInfo,
  TodoItem,
  AisleSection,
} from "./types";

type Html = (strings: TemplateStringsArray, ...values: unknown[]) => JSX.Element;
const html = htm.bind(h as unknown as (...args: unknown[]) => unknown) as Html;

interface TabProps {
  state: AppStateData;
  reload: () => void;
  notify: (msg: string) => void;
}

function sortedAisles(state: AppStateData): AisleSection[] {
  return [...state.aisles].sort((a, b) => a.order - b.order);
}

/* ------------------------------------------------------------- Lista tab */

export function ListTab({ state, reload, notify }: TabProps): JSX.Element {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nlText, setNlText] = useState("");
  const [nlBusy, setNlBusy] = useState(false);

  useMemo(() => {
    api
      .list()
      .then((d) => setTodos(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const groups = new Map<string, TodoItem[]>();
  for (const t of todos) {
    if (t.status !== "needs_action") continue;
    const norm = (t.summary ?? "").toLowerCase();
    const item = state.items.find(
      (i) => norm.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(norm),
    );
    const aisle = item ? item.aisle : "andra";
    const arr = groups.get(aisle) ?? [];
    arr.push(t);
    groups.set(aisle, arr);
  }

  const compose = async (): Promise<void> => {
    notify("Komponerar …");
    const res = await api.compose(true);
    if (res.composed === 0 && res.suggested === 0) {
      const s = res.sources;
      notify(
        `Inget att lägga till (standardvaror: ${s.staples}, förfallna: ${s.due}, reor: ${s.deals}). ` +
          (s.staples === 0
            ? "Markera standardvaror i Sök- eller Varor-fliken först."
            : "Modellen lär sig efter några inköp – kolla Förslag nedan."),
      );
      reload();
      return;
    }
    // Nothing composed = nothing was written; a write error is impossible here
    if (res.composed === 0) {
      notify(`${res.suggested} förslag väntar på ditt svar nedan (förslag läggs aldrig till automatiskt).`);
      reload();
      return;
    }
    if (res.added === 0) {
      const avail = res.availableEntities?.map((t) => t.entity_id).join(", ");
      notify(
        `Kunde inte skriva till ${res.todoEntity}` +
          (avail ? ` – befintliga listor: ${avail}. Välj en under Inställningar.` : " – kontrollera entiteten (se Diagnostik)."),
      );
      reload();
      return;
    }
    notify(`La till ${res.added} varor på ${res.todoEntity}${res.suggested ? `, ${res.suggested} förslag` : ""}`);
    reload();
    const d = await api.list();
    setTodos(d.items ?? []);
  };

  const nlAdd = async (): Promise<void> => {
    if (!nlText.trim()) return;
    setNlBusy(true);
    try {
      const r = await api.aiAdd(nlText.trim());
      notify(`AI la till: ${r.added.map((a) => a.name).join(", ") || "inget"}`);
      setNlText("");
      reload();
      const d = await api.list();
      setTodos(d.items ?? []);
    } catch (e) {
      notify(`AI: ${(e as Error).message}`);
    } finally {
      setNlBusy(false);
    }
  };

  const aiOn = state.aiConfigured;

  return html`
    <div class="card">
      <div class="row">
        <div class="grow muted">Komponerar standardvaror, prediktioner och reor i gångordning.</div>
        <button class="btn primary" onClick=${() => void compose()}>Skapa inköpslista</button>
      </div>
    </div>
    ${aiOn && html`
      <div class="card">
        <div class="row">
          <div class="grow">
            <input type="text" class="big" style="font-size:14px; padding:9px"
                   placeholder='Be AI: "2 liter mjölk, ett fullkornsbröd och smör"'
                   value=${nlText} onInput=${(e: Event) => setNlText((e.target as HTMLInputElement).value)} />
          </div>
          <button class="btn" disabled=${nlBusy} onClick=${() => void nlAdd()}>${nlBusy ? "…" : "Lägg till"}</button>
        </div>
      </div>
    `}
    ${loading && html`<div class="empty">Hämtar lista …</div>`}
    ${!loading && todos.filter((t) => t.status === "needs_action").length === 0 &&
      html`<div class="empty">Listan är tom. Tryck "Skapa inköpslista".</div>`}
    ${sortedAisles(state).map((a) => {
      const items = groups.get(a.id);
      if (!items || !items.length) return null;
      return html`
        <div key=${a.id}>
          <div class="aislehead">${a.name}</div>
          ${items.map((t) => html`
            <div class="card" key=${t.uid}>
              <div class="row"><div class="grow">${t.summary}</div></div>
            </div>
          `)}
        </div>
      `;
    })}
    ${pendingSuggestions(state, reload, notify)}
  `;
}

function pendingSuggestions(
  state: AppStateData,
  reload: () => void,
  notify: (msg: string) => void,
): JSX.Element | null {
  const pending = state.suggestions.filter((s) => s.status === "pending");
  if (!pending.length) return null;
  const decide = async (id: string, choice: "add" | "pass" | "never"): Promise<void> => {
    await api.decide(id, choice);
    notify(choice === "add" ? "Lade till" : choice === "never" ? "Förslaget ignoreras framgent" : "Avstår");
    reload();
  };
  return html`
    <h2>Förslag</h2>
    ${pending.map((s) => html`
      <div class="card" key=${s.id}>
        <div class="row">
          <div class="grow">
            <b>${s.name}</b>
            ${s.reason === "due" && html`<span class="muted"> · behövs nu (var ${s.intervalDays}e dag, ${Math.round(s.confidence * 100)} %)</span>`}
            ${s.reason === "deal" && html`<span class="badge off">-${Math.round(s.dealPercentOff ?? 0)} %</span><span class="muted"> ${s.dealPrice} kr</span>`}
          </div>
        </div>
        <div class="sug-actions">
          <button class="btn primary small" onClick=${() => void decide(s.id, "add")}>Lägg i listan</button>
          <button class="btn small" onClick=${() => void decide(s.id, "pass")}>Inte nu</button>
          <button class="btn small ghost" onClick=${() => void decide(s.id, "never")}>Aldrig</button>
        </div>
      </div>
    `)}
  `;
}

/* ------------------------------------------------------------- Sök tab */

const DEBOUNCE_MS = 300;

export function SearchTab({ state, reload, notify }: TabProps): JSX.Element {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [brandName, setBrandName] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [selectedAisle, setSelectedAisle] = useState<string>("");
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Live search with debounce; page resets when the query changes
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setPages(1);
      setTotal(0);
      setBrandName("");
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      api
        .search(term, page, ac.signal)
        .then((d) => {
          setResults(d.results ?? []);
          setPages(Math.max(1, d.pages ?? 1));
          setTotal(d.total ?? 0);
          setBrandName(d.brandName ?? "");
        })
        .catch((err: Error) => {
          if (err.name !== "AbortError") notify(`Sök fel: ${err.message}`);
        })
        .finally(() => {
          if (!ac.signal.aborted) setBusy(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, page]);

  const changePage = (p: number): void => {
    setPage(p);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const add = (r: SearchHit, extra: Partial<{ asStaple: boolean; watch: boolean }> = {}): void => {
    void api
      .addItem({
        name: r.name,
        code: r.code,
        query: q.trim(),
        aisle: r._aisle ?? selectedAisle ?? undefined,
        basketType: r.basketType,
        ...extra,
      })
      .then(() => {
        notify(`"${r.name}" sparad`);
        reload();
      })
      .catch((e: Error) => notify(`Fel: ${e.message}`));
  };

  return html`
    <form class="searchbar" onSubmit=${(e: Event) => e.preventDefault()}>
      <input class="big" type="search" placeholder="Sök i Willys sortiment (söker direkt) …"
             value=${q} onInput=${(e: Event) => { setQ((e.target as HTMLInputElement).value); setPage(0); }} />
      ${busy && html`<span class="muted">söker …</span>`}
    </form>
    <div class="card" style="padding:8px 12px">
      <div class="row">
        <span class="muted">Avdelning för nya varor:</span>
        <select value=${selectedAisle} onChange=${(e: Event) => setSelectedAisle((e.target as HTMLSelectElement).value)}>
          <option value="">(gissa automatiskt)</option>
          ${sortedAisles(state).map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}
        </select>
      </div>
    </div>
    <div ref=${gridRef}>
      ${brandName && html`<div class="aislehead">Varumärke: ${brandName}</div>`}
      <${ProductGrid}>
        ${results.map((r) => html`
          <${ProductCard}
            key=${r.code}
            product=${{ code: r.code, name: r.name, price: r.price, unit: r.unit, savings: r.savings, percentOff: r.percentOff, labels: r.labels, image: r.image }}
            onAdd=${() => add(r)}
            extraActions=${html`
              <button class="btn small" onClick=${() => add(r, { asStaple: true })}>Standard</button>
              <button class="btn small ghost" onClick=${() => add(r, { watch: true })}>Bevaka</button>
            `}
          />
        `)}
      <//>
    </div>
    ${total > 0 && html`
      <div class="pager">
        <button class="btn small" disabled=${page <= 0} onClick=${() => changePage(page - 1)}>← Föregående</button>
        <span class="muted">Sida ${page + 1} av ${pages} · ${total} träffar</span>
        <button class="btn small" disabled=${page >= pages - 1} onClick=${() => changePage(page + 1)}>Nästa →</button>
      </div>
    `}
    ${q.trim().length >= 2 && !busy && !results.length && html`<div class="empty">Inga träffar för "${q}".</div>`}
    ${q.trim().length < 2 && html`<div class="empty">Skriv minst två bokstäver – resultaten visas direkt.</div>`}
  `;
}

/* ------------------------------------------------------------ Varor tab */

export function ItemsTab({ state, reload }: TabProps): JSX.Element {
  const aisles = sortedAisles(state);
  const predByKey = new Map(state.predictions.map((p) => [p.key, p]));
  const items = [...state.items].sort((a, b) => {
    const ai = aisles.findIndex((x) => x.id === a.aisle);
    const bi = aisles.findIndex((x) => x.id === b.aisle);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name, "sv");
  });

  const patch = (key: string, data: Parameters<typeof api.patchItem>[1]): void => {
    void api.patchItem(key, data).then(reload);
  };

  const stapleKeys = new Set(state.staples.map((st) => st.key));
  const watchKeys = new Set(state.watchlist);

  return html`
    ${items.map((i) => {
      const st = predByKey.get(i.key);
      const aisle = aisles.find((a) => a.id === i.aisle);
      return html`
        <div class="card irow" key=${i.key}>
          <div class="row">
            <div class="grow">
              <b>${i.name}</b>
              <div class="muted">
                ${aisle?.name ?? "Övrigt"} ·
                ${st?.suggestionsCount
                  ? `köpt ${st.suggestionsCount}x`
                  : "ingen historik"}
                ${st && ` · ${Math.round(st.confidence * 100)} % säker`}
              </div>
            </div>
            <select value=${st?.mode ?? "suggest"} title="Hantering"
                    onChange=${(e: Event) => patch(i.key, { mode: (e.target as HTMLSelectElement).value as "suggest" | "auto" | "never" })}>
              <option value="suggest">Föreslå</option>
              <option value="auto">Auto</option>
              <option value="never">Aldrig</option>
            </select>
            <select value=${i.aisle} title="Avdelning"
                    onChange=${(e: Event) => patch(i.key, { aisle: (e.target as HTMLSelectElement).value })}>
              ${aisles.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}
            </select>
          </div>
          <div class="sug-actions">
            <button class="btn small ${stapleKeys.has(i.key) ? "toggled" : ""}"
                    onClick=${() => {
                      const on = stapleKeys.has(i.key);
                      const p = on ? api.unsetStaple(i.key) : api.setStaple(i.key, { active: true, qty: 1 });
                      void p.then(reload);
                    }}>
              ${stapleKeys.has(i.key) ? "✓ Standard" : "Standard"}
            </button>
            <button class="btn small ${watchKeys.has(i.key) ? "toggled" : ""}"
                    onClick=${() => {
                      const p = watchKeys.has(i.key) ? api.unwatch(i.key) : api.watch(i.key);
                      void p.then(reload);
                    }}>
              ${watchKeys.has(i.key) ? "✓ Bevakas" : "Bevaka"}
            </button>
            <button class="btn small danger" onClick=${() => { if (confirm(`Ta bort "${i.name}"?`)) void api.deleteItem(i.key).then(reload); }}>
              Ta bort
            </button>
          </div>
        </div>
      `;
    })}
    ${!items.length && html`<div class="empty">Inga varor än – sök och lägg till.</div>`}
  `;
}

/* ------------------------------------------------------ Gångordning tab */

export function AislesTab({ state, reload, notify }: TabProps): JSX.Element {
  const [aisles, setAisles] = useState<AisleSection[]>(sortedAisles(state));

  const move = (idx: number, dir: number): void => {
    const next = [...aisles];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setAisles(next);
  };

  const rename = (idx: number, name: string): void => {
    const next = [...aisles];
    next[idx] = { ...next[idx], name };
    setAisles(next);
  };

  const save = async (): Promise<void> => {
    await api.reorderAisles(
      aisles.map((a) => a.id),
      Object.fromEntries(aisles.map((a) => [a.id, a.name])),
    );
    notify("Gångordning sparad");
    reload();
  };

  return html`
    <div class="card">
      <div class="row">
        <div class="grow muted">Ordningen styr i vilken ordning varor läggs på inköpslistan.</div>
        <button class="btn primary" onClick=${() => void save()}>Spara ordning</button>
      </div>
    </div>
    ${aisles.map((a, idx) => html`
      <div class="card" key=${a.id}>
        <div class="row">
          <span class="muted">${idx + 1}.</span>
          <input type="text" class="grow" value=${a.name} onChange=${(e: Event) => rename(idx, (e.target as HTMLInputElement).value)} />
          <div class="arrow-btns">
            <button class="btn small" onClick=${() => move(idx, -1)}>↑</button>
            <button class="btn small" onClick=${() => move(idx, 1)}>↓</button>
          </div>
        </div>
      </div>
    `)}
  `;
}

/* -------------------------------------------------------------- Reor tab */

const DEALS_PAGE_SIZE = 25;

type DealSort = "gang" | "rabatt" | "pris" | "spar";

export function DealsTab({ state, reload, notify }: TabProps): JSX.Element {
  const deals = state.deals ?? [];
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [aisleFilter, setAisleFilter] = useState("");
  const [plusOnly, setPlusOnly] = useState(false);
  const [sort, setSort] = useState<DealSort>("gang");

  const aisleIdx = new Map(sortedAisles(state).map((a, i) => [a.id, i]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = deals.filter((d) => {
      if (aisleFilter && d.aisle !== aisleFilter) return false;
      if (plusOnly && !(d.labels ?? []).includes("Willys plus")) return false;
      if (q && !(`${d.name} ${d.unit ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "gang") {
        const ai = aisleIdx.get(a.aisle ?? "andra") ?? 999;
        const bi = aisleIdx.get(b.aisle ?? "andra") ?? 999;
        if (ai !== bi) return ai - bi;
        return b.percentOff - a.percentOff;
      }
      if (sort === "pris") return a.price - b.price;
      if (sort === "spar") return b.savings - a.savings;
      return b.percentOff - a.percentOff;
    });
    return list;
  }, [deals, query, aisleFilter, plusOnly, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / DEALS_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * DEALS_PAGE_SIZE, (current + 1) * DEALS_PAGE_SIZE);

  // reset to first page when filters change
  useEffect(() => {
    setPage(0);
  }, [query, aisleFilter, plusOnly, sort]);

  const changePage = (p: number): void => {
    setPage(Math.min(pages - 1, Math.max(0, p)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const watch = (d: { name: string; code: string }): void => {
    void api
      .addItem({ name: d.name, code: d.code, query: d.name, watch: true })
      .then(() => {
        notify(`Bevakar "${d.name}"`);
        reload();
      })
      .catch((e: Error) => notify(`Fel: ${e.message}`));
  };

  return html`
    <div class="card" style="padding:10px 12px">
      <div class="row">
        <input type="search" class="grow" placeholder="Filtrera reor …"
               value=${query} onInput=${(e: Event) => setQuery((e.target as HTMLInputElement).value)} />
        <select value=${sort} onChange=${(e: Event) => setSort((e.target as HTMLSelectElement).value as DealSort)}>
          <option value="gang">Gångordning</option>
          <option value="rabatt">Rabatt %</option>
          <option value="spar">Sparar kr</option>
          <option value="pris">Lägsta pris</option>
        </select>
      </div>
      <div class="row" style="margin-top:8px">
        <select value=${aisleFilter} onChange=${(e: Event) => setAisleFilter((e.target as HTMLSelectElement).value)}>
          <option value="">Alla avdelningar</option>
          ${sortedAisles(state).map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}
        </select>
        <label class="muted" style="display:flex; align-items:center; gap:6px; cursor:pointer">
          <input type="checkbox" checked=${plusOnly} onChange=${(e: Event) => setPlusOnly((e.target as HTMLInputElement).checked)} />
          Endast Willys plus
        </label>
        <span class="muted">${filtered.length} reor</span>
      </div>
    </div>
    <${ProductGrid}>
      ${slice.map((d: import("./types").DealItem) => html`
        <${ProductCard}
          key=${d.code}
          product=${{ code: d.code, name: d.name, price: d.price, unit: d.unit, savings: d.savings, percentOff: d.percentOff, labels: d.labels, image: d.image, comparePrice: d.comparePrice }}
          extraActions=${html`<button class="btn small" onClick=${() => watch(d)}>Bevaka</button>`}
        />
      `)}
    <//>
    ${filtered.length > DEALS_PAGE_SIZE && html`
      <div class="pager">
        <button class="btn small" disabled=${current <= 0} onClick=${() => changePage(current - 1)}>← Föregående</button>
        <span class="muted">Sida ${current + 1} av ${pages} · ${filtered.length} reor</span>
        <button class="btn small" disabled=${current >= pages - 1} onClick=${() => changePage(current + 1)}>Nästa →</button>
      </div>
    `}
    ${!filtered.length && html`<div class="empty">
      ${deals.length ? "Inga reor matchar filtret." : 'Inga reor hämtade än – tryck "Uppdatera reor" under Inställningar.'}
    </div>`}
  `;
}

/* ---------------------------------------------------- Inställningar tab */

export function SettingsTab({ state, reload, notify }: TabProps): JSX.Element {
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [storeFilter, setStoreFilter] = useState("");
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [theme, setTheme] = useTheme();
  const [ai, setAi] = useState<import("./types").AiConfigInfo | null>(null);
  const [aiProvider, setAiProvider] = useState<import("./types").AiProviderId | "">("");
  const [aiKey, setAiKey] = useState("");
  const [aiUrl, setAiUrl] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [todoEntities, setTodoEntities] = useState<{ entities: import("./types").TodoEntityInfo[] } | null>(null);
  const [currentTodo, setCurrentTodo] = useState<{ current: string } | null>(null);
  const [selectedTodo, setSelectedTodo] = useState("");
  const [todoError, setTodoError] = useState("");
  const [dealMode, setDealMode] = useState<"ask" | "add">("ask");

  useMemo(() => {
    api
      .stores()
      .then((d) => setStores(d.stores ?? []))
      .catch(() => undefined);
    api
      .aiConfig()
      .then((c) => {
        setAi(c);
        setAiProvider(c.provider);
      })
      .catch(() => undefined);
    api
      .todoEntities()
      .then((d) => {
        setTodoEntities({ entities: d.entities });
        setCurrentTodo(d);
      })
      .catch(() => setTodoEntities(null));
    api.panelSettings().then((d) => setDealMode(d.dealComposeMode)).catch(() => undefined);
  }, []);

  const saveTodo = async (): Promise<void> => {
    if (!selectedTodo) return;
    setTodoError("");
    try {
      const d = await api.setTodoEntity(selectedTodo);
      setCurrentTodo(d);
      notify(`Inköpslista: ${d.current}`);
    } catch (e) {
      const msg = (e as Error).message;
      setTodoError(msg);
      notify(msg);
    }
  };

  const providerInfo = ai?.providers.find((p) => p.id === (aiProvider || ai?.provider));
  const usingCustomUrl = aiProvider === "custom";

  const filtered = stores.filter(
    (s) => !storeFilter || s.name.toLowerCase().includes(storeFilter.toLowerCase()),
  );

  const refreshDeals = (): void => {
    void api
      .refresh()
      .then(() => {
        notify("Reor uppdaterade");
        reload();
      })
      .catch((e: Error) => notify(e.message));
  };

  const compose = (): void => {
    void api
      .compose(true)
      .then((r) => {
        notify(`La till ${r.added} varor`);
        reload();
      })
      .catch((e: Error) => notify(e.message));
  };

  const saveAi = async (): Promise<void> => {
    setAiBusy(true);
    try {
      const patch: import("./types").AiConfigPatch = {};
      if (aiProvider) patch.provider = aiProvider;
      if (aiKey.trim()) patch.apiKey = aiKey.trim();
      if (aiUrl.trim()) patch.baseUrl = aiUrl.trim();
      if (aiModel.trim()) patch.model = aiModel.trim();
      const cfg = await api.saveAiConfig(patch);
      setAi(cfg);
      setAiProvider(cfg.provider);
      setAiKey("");
      setAiUrl("");
      setAiModel("");
      notify("AI-inställningar sparade");
    } catch (e) {
      notify(`Fel: ${(e as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  };

  const testAi = (): void => {
    setAiBusy(true);
    void api
      .aiTest()
      .then((r) => notify(r.ok ? `AI OK (${r.model}, ${r.latencyMs} ms)` : `AI-fel: ${r.error}`))
      .catch((e: Error) => notify(`Fel: ${e.message}`))
      .finally(() => setAiBusy(false));
  };

  const setAccent = (v: string): void => setTheme({ ...theme, accent: v });
  const setBg = (v: string): void => setTheme({ ...theme, bg: v });
  const resetTheme = (): void => setTheme({ mode: theme.mode, accent: null, bg: null });

  return html`
    <div class="card">
      <h2>Utseende</h2>
      <div class="row">
        <button class="btn ${theme.mode === "light" ? "primary" : ""}" onClick=${() => setTheme({ ...theme, mode: "light" })}>Ljust</button>
        <button class="btn ${theme.mode === "dark" ? "primary" : ""}" onClick=${() => setTheme({ ...theme, mode: "dark" })}>Mörkt</button>
        <label class="muted">Accentfärg: <input type="color" value=${theme.accent ?? THEME_DEFAULTS[theme.mode].accent}
             onInput=${(e: Event) => setAccent((e.target as HTMLInputElement).value)} /></label>
        <label class="muted">Bakgrund: <input type="color" value=${theme.bg ?? THEME_DEFAULTS[theme.mode].bg}
             onInput=${(e: Event) => setBg((e.target as HTMLInputElement).value)} /></label>
        <button class="btn small ghost" onClick=${resetTheme}>Återställ</button>
      </div>
      <div class="muted" style="margin-top:6px">Standard: Willys-röd (${WILLYS_RED}) på vitt. Valen sparas i webbläsaren.</div>
    </div>

    <div class="card">
      <h2>AI-assistent</h2>
      <div class="muted" style="margin-bottom:8px">
        ${ai?.configured
          ? html`Aktiv: <b>${ai.model}</b> via ${ai.baseUrl} (nyckel ${ai.apiKeyHint})`
          : "Inte konfigurerad. Används för: smart matchning av incheckade varor och naturligt språk-lägg-till."}
      </div>
      <div class="row" style="margin-bottom:8px">
        <label class="muted">Leverantör:&nbsp;
          <select value=${aiProvider || ai?.provider || "opencode"}
                  onChange=${(e: Event) => setAiProvider((e.target as HTMLSelectElement).value as import("./types").AiProviderId)}>
            ${(ai?.providers ?? []).map((p) => html`<option key=${p.id} value=${p.id}>${p.label}</option>`)}
          </select>
        </label>
      </div>
      <div class="row">
        <input type="password" placeholder="API-nyckel" style="flex:1 1 200px"
               value=${aiKey} onInput=${(e: Event) => setAiKey((e.target as HTMLInputElement).value)} />
        ${usingCustomUrl && html`
          <input type="text" placeholder="Bas-URL (t.ex. http://localhost:11434/v1)" style="flex:1 1 220px"
                 value=${aiUrl} onInput=${(e: Event) => setAiUrl((e.target as HTMLInputElement).value)} />
        `}
        <input type="text" placeholder=${providerInfo?.defaultModel || ai?.model || "modell-id"} style="flex:0 1 200px"
               value=${aiModel} onInput=${(e: Event) => setAiModel((e.target as HTMLInputElement).value)} />
      </div>
      <div class="muted" style="margin:6px 0 0">
        ${providerInfo && !usingCustomUrl && html`Förval: ${providerInfo.baseUrl} · modell ${providerInfo.defaultModel}. Fält du lämnar tomma använder förvalen.`}
        ${usingCustomUrl && "Ange bas-URL till en OpenAI-kompatibel server (…/v1) och modell-id."}
      </div>
      <div class="sug-actions">
        <button class="btn primary" disabled=${aiBusy} onClick=${() => void saveAi()}>Spara</button>
        <button class="btn" disabled=${aiBusy} onClick=${() => void testAi()}>Testa anslutning</button>
      </div>
    </div>

    <div class="card">
      <h2>Komponering</h2>
      <div class="row">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer">
          <input type="checkbox" checked=${dealMode === "add"}
                 onChange=${(e: Event) => {
                   const mode = (e.target as HTMLInputElement).checked ? "add" : "ask";
                   setDealMode(mode);
                   void api.setPanelSettings({ dealComposeMode: mode }).then(() =>
                     notify(mode === "add" ? "Reor läggs direkt på listan" : "Reor kommer som förslag"),
                   );
                 }} />
          <span>Lägg rea-varor direkt på inköpslistan vid komponering</span>
        </label>
      </div>
      <div class="muted" style="margin-top:6px">
        Av: rea-träffar från bevakningslistan kommer som förslag du godkänner. På: de hamnar direkt på listan (i gångordning).
      </div>
    </div>

    <div class="card">
      <h2>Inköpslista</h2>
      <div class="muted" style="margin-bottom:8px">
        Listan läggs i: <b>${currentTodo?.current ?? "todo.shopping_list"}</b>. Välj bland de to-do-listor som finns i din HA:
      </div>
      ${todoEntities && html`
        <div class="row">
          <select style="flex:1 1 auto"
                  value=${selectedTodo}
                  onChange=${(e: Event) => setSelectedTodo((e.target as HTMLSelectElement).value)}>
            <option value="">(oförändrat)</option>
            ${todoEntities.entities.map((t) => html`
              <option key=${t.entity_id} value=${t.entity_id}>${t.name} (${t.entity_id})</option>
            `)}
          </select>
          <button class="btn primary" onClick=${() => void saveTodo()}>Spara lista</button>
        </div>
        ${todoError && html`<div class="muted" style="color:var(--accent); margin-top:6px">${todoError}</div>`}
      `}
      ${!todoEntities && html`<div class="empty" style="padding:8px">Kunde inte hämta to-do-listor.</div>`}
    </div>

    <div class="card">
      <h2>Butik</h2>
      <div class="muted" style="margin-bottom:8px">
        Aktiv butik: <b>${state.storeId || "hemmabutik från kontot"}</b>.<br />
        Byt butik via add-ons inställningar med butikens ID:
      </div>
      <input class="big" type="search" placeholder="Filtrera butiker …"
             value=${storeFilter} onInput=${(e: Event) => setStoreFilter((e.target as HTMLInputElement).value)} />
      <div style="max-height:340px; overflow-y:auto; margin-top:8px">
        ${filtered.map((s) => html`
          <div class="card" key=${s.id}>
            <div class="row">
              <div class="grow">
                <b>${s.name}</b>
                <div class="muted">${s.address ?? ""} ${s.city ?? ""}</div>
              </div>
              <span class="badge loyalty">ID ${s.id}</span>
            </div>
          </div>
        `)}
      </div>
    </div>

    <div class="card">
      <h2>Underhåll</h2>
      <div class="row">
        <button class="btn" onClick=${refreshDeals}>Uppdatera reor nu</button>
        <button class="btn primary" onClick=${compose}>Komponera lista nu</button>
      </div>
    </div>

    <div class="card">
      <h2>Diagnostik</h2>
      <div class="row">
        <div class="grow muted">Visar API-behörigheter och miljövariabler (värden visas aldrig).</div>
        <button class="btn" onClick=${() => { api.debug().then(setDebug).catch((e: Error) => setDebug({ error: e.message })); }}>
          Kör diagnostik
        </button>
      </div>
      ${debug && html`
        <pre style="overflow-x:auto; background:var(--bg3); padding:10px; border-radius:8px; font-size:12px">${JSON.stringify(debug, null, 2)}</pre>
      `}
    </div>
  `;
}
