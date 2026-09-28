import { h, type JSX } from "preact";
import htm from "htm";
import { useState, useMemo } from "preact/hooks";
import { api } from "./api";
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

  useMemo(() => {
    api
      .list()
      .then((d) => setTodos(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const groups = new Map<string, TodoItem[]>();
  const unmatched: string[] = [];
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
    if (!item) unmatched.push(t.summary);
  }

  const compose = async (): Promise<void> => {
    notify("Komponerar …");
    const res = await api.compose(true);
    notify(`La till ${res.added} varor, ${res.suggested} förslag`);
    reload();
    const d = await api.list();
    setTodos(d.items ?? []);
  };

  return html`
    <div class="card">
      <div class="row">
        <div class="grow muted">Komponerar standardvaror, prediktioner och reor i gångordning.</div>
        <button class="btn primary" onClick=${() => void compose()}>Skapa inköpslista</button>
      </div>
    </div>
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
    ${unmatched.length > 0 && html`
      <h2>Övrigt på listan</h2>
      ${unmatched.filter((u) => !groups.get("andra")?.some((t) => t.summary === u)).map((u) =>
        html`<div class="card"><div class="row"><div class="grow">${u}</div></div></div>`)}
    `}
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

export function SearchTab({ state, reload, notify }: TabProps): JSX.Element {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);

  const doSearch = async (e: Event): Promise<void> => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const d = await api.search(q.trim());
      setResults(d.results ?? []);
    } catch (err) {
      notify(`Sök fel: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const add = async (r: SearchHit, extra: Partial<{ asStaple: boolean; watch: boolean }> = {}): Promise<void> => {
    await api.addItem({
      name: r.name,
      code: r.code,
      query: q.trim(),
      aisle: r._aisle,
      basketType: r.basketType,
      ...extra,
    });
    notify(`"${r.name}" sparad`);
    reload();
  };

  return html`
    <form class="searchbar"
      onSubmit=${(e: Event) => void doSearch(e)}>
      <input class="big" type="search" placeholder="Sök i Willys sortiment …"
             value=${q} onInput=${(e: Event) => setQ((e.target as HTMLInputElement).value)} />
      <button class="btn primary" disabled=${busy}>${busy ? "…" : "Sök"}</button>
    </form>
    ${results.map((r) => html`
      <div class="card" key=${r.code}>
        <div class="row">
          <div class="grow">
            <b>${r.name}</b>
            <div class="muted">
              ${r.price} kr ${r.unit && html`· ${r.unit}`}
              ${r.savings > 0 && html` · <span class="badge off">-${Math.round((r.savings / (r.price + r.savings)) * 100)} %</span>`}
              ${(r.labels ?? []).map((l) => html`<span class="badge">${l}</span>`)}
            </div>
          </div>
        </div>
        <div class="sug-actions">
          <select onChange=${(e: Event) => { r._aisle = (e.target as HTMLSelectElement).value; }}>
            ${sortedAisles(state).map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}
          </select>
          <button class="btn primary small" onClick=${() => void add(r)}>Lägg till</button>
          <button class="btn small" onClick=${() => void add(r, { asStaple: true })}>Standardvara</button>
          <button class="btn small" onClick=${() => void add(r, { watch: true })}>Bevaka pris</button>
        </div>
      </div>
    `)}
    ${!busy && !results.length && html`<div class="empty">Sök efter en vara för att lägga till den direkt.</div>`}
  `;
}

/* ------------------------------------------------------------ Varor tab */

export function ItemsTab({ state, reload, notify }: TabProps): JSX.Element {
  const aisles = sortedAisles(state);
  const predByKey = new Map(state.predictions.map((p) => [p.key, p]));
  const items = [...state.items].sort((a, b) => {
    const ai = aisles.findIndex((x) => x.id === a.aisle);
    const bi = aisles.findIndex((x) => x.id === b.aisle);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name, "sv");
  });

  const patch = async (key: string, data: Parameters<typeof api.patchItem>[1]): Promise<void> => {
    await api.patchItem(key, data);
    reload();
  };

  const stapleKeys = new Set(Object.keys(state.staples));
  const watchKeys = new Set(state.watchlist);

  return html`
    <table class="grid">
      <tbody>
        ${items.map((i) => {
          const st = predByKey.get(i.key);
          return html`
            <tr key=${i.key}>
              <td class="grow">
                <b>${i.name}</b>
                <div class="muted">
                  ${st?.suggestionsCount ? html`Köpt ${st.suggestionsCount}x` : "Ingen historik"}
                </div>
              </td>
              <td>
                <select value=${i.aisle} onChange=${(e: Event) => void patch(i.key, { aisle: (e.target as HTMLSelectElement).value })}>
                  ${aisles.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}
                </select>
              </td>
              <td>
                <select value=${st?.mode ?? "suggest"} onChange=${(e: Event) => void patch(i.key, { mode: (e.target as HTMLSelectElement).value as "suggest" | "auto" | "never" })}>
                  <option value="suggest">Föreslå</option>
                  <option value="auto">Auto</option>
                  <option value="never">Aldrig</option>
                </select>
              </td>
              <td>
                ${stapleKeys.has(i.key)
                  ? html`<button class="btn small" onClick=${() => { void api.unsetStaple(i.key).then(reload); }}>✓ Standard</button>`
                  : html`<button class="btn small ghost" onClick=${() => { void api.setStaple(i.key, { active: true, qty: 1 }).then(reload); }}>Standard</button>`}
              </td>
              <td>
                ${watchKeys.has(i.key)
                  ? html`<button class="btn small" onClick=${() => { void api.unwatch(i.key).then(reload); }}>👁</button>`
                  : html`<button class="btn small ghost" onClick=${() => { void api.watch(i.key).then(reload); }}>👁</button>`}
              </td>
              <td>
                <button class="btn small danger" onClick=${() => { void api.deleteItem(i.key).then(reload); }}>✕</button>
              </td>
            </tr>
          `;
        })}
      </tbody>
    </table>
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

export function DealsTab({ state, reload, notify }: TabProps): JSX.Element {
  const deals = state.deals ?? [];
  const watch = async (d: { name: string; code: string }): Promise<void> => {
    await api.addItem({ name: d.name, code: d.code, query: d.name, watch: true });
    notify(`Bevakar "${d.name}"`);
    reload();
  };
  return html`
    ${deals.map((d) => html`
      <div class="card" key=${d.code}>
        <div class="row">
          <div class="grow">
            <b>${d.name}</b>
            <div class="muted">
              <span class="badge off">-${Math.round(d.percentOff)} %</span>
              ${d.price} kr
              ${d.savings > 0 && html` · sparar ${d.savings} kr`}
              ${d.unit && html` · ${d.unit}`}
              ${(d.labels ?? []).map((l) => html`<span class="badge ${l === "Willys plus" ? "loyalty" : ""}">${l}</span>`)}
            </div>
          </div>
          <button class="btn small" onClick=${() => void watch(d)}>Bevaka</button>
        </div>
      </div>
    `)}
    ${!deals.length && html`<div class="empty">Inga reor hämtade än.</div>`}
  `;
}

/* ---------------------------------------------------- Inställningar tab */

export function SettingsTab({ state, reload, notify }: TabProps): JSX.Element {
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [storeFilter, setStoreFilter] = useState("");
  const [debug, setDebug] = useState<DebugInfo | null>(null);

  const loadStores = (): void => {
    api
      .stores()
      .then((d) => setStores(d.stores ?? []))
      .catch((e: Error) => notify(`Butiker: ${e.message}`));
  };
  useMemo(loadStores, []);

  const filtered = stores.filter(
    (s) => !storeFilter || s.name.toLowerCase().includes(storeFilter.toLowerCase()),
  );

  const refreshDeals = async (): Promise<void> => {
    await api.refresh();
    notify("Reor uppdaterade");
    reload();
  };

  const compose = async (): Promise<void> => {
    const r = await api.compose(true);
    notify(`La till ${r.added} varor`);
    reload();
  };

  return html`
    <div class="card">
      <h2>Butik</h2>
      <div class="muted" style="margin-bottom:8px">
        Aktiv butik: <b>${state.storeId || "hemmabutik från kontot"}</b>.<br />
        Byt butik via add-ons inställningar (Inställningar → Tillägg → Willys Inbox) med butikens ID:
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
              <span class="badge">ID ${s.id}</span>
            </div>
          </div>
        `)}
      </div>
    </div>
    <div class="card">
      <h2>Underhåll</h2>
      <div class="row">
        <button class="btn" onClick=${() => void refreshDeals()}>Uppdatera reor nu</button>
        <button class="btn primary" onClick=${() => void compose()}>Komponera lista nu</button>
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
