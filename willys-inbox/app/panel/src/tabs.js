import { h } from "preact";
import htm from "htm";
import { useState, useMemo } from "preact/hooks";
import { api } from "./api.js";

const html = htm.bind(h);

function aisleMap(state) {
  const m = new Map();
  for (const a of state.aisles) m.set(a.id, a);
  return m;
}

function aisleOf(state, key) {
  const item = state.items[key];
  return item ? item.aisle : "andra";
}

/* ------------------------------------------------------------- Lista tab */

export function ListTab({ state, reload, notify }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.list().then((d) => setTodos(d.items ?? [])).finally(() => setLoading(false));
  useMemo(() => { load(); }, []);

  const aisles = [...state.aisles].sort((a, b) => a.order - b.order);
  const groups = new Map();
  const unmatched = [];
  for (const t of todos) {
    if (t.status !== "needs_action") continue;
    const norm = (t.summary ?? "").toLowerCase();
    const item = Object.values(state.items).find(
      (i) => norm.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(norm),
    );
    const aisle = item ? item.aisle : "andra";
    const arr = groups.get(aisle) ?? [];
    arr.push(t);
    groups.set(aisle, arr);
    if (!item) unmatched.push(t.summary);
  }

  const compose = async () => {
    notify("Komponerar …");
    const res = await api.compose(true);
    notify(`La till ${res.added} varor, ${res.suggested} förslag`);
    reload();
    load();
  };

  return html`
    <div class="card">
      <div class="row">
        <div class="grow muted">Komponerar standardvaror, prediktioner och reor i gångordning.</div>
        <button class="btn primary" onClick=${compose}>Skapa inköpslista</button>
      </div>
    </div>
    ${loading && html`<div class="empty">Hämtar lista …</div>`}
    ${!loading && todos.filter((t) => t.status === "needs_action").length === 0 &&
      html`<div class="empty">Listan är tom. Tryck "Skapa inköpslista".</div>`}
    ${aisles.map((a) => {
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

function pendingSuggestions(state, reload, notify) {
  const pending = state.suggestions.filter((s) => s.status === "pending");
  if (!pending.length) return null;
  const decide = async (id, choice) => {
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
          <button class="btn primary small" onClick=${() => decide(s.id, "add")}>Lägg i listan</button>
          <button class="btn small" onClick=${() => decide(s.id, "pass")}>Inte nu</button>
          <button class="btn small ghost" onClick=${() => decide(s.id, "never")}>Aldrig</button>
        </div>
      </div>
    `)}
  `;
}

/* ------------------------------------------------------------- Sök tab */

export function SearchTab({ state, reload, notify }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const d = await api.search(q.trim());
      setResults(d.results ?? []);
    } catch (err) {
      notify(`Sök fel: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const add = async (r, extra = {}) => {
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
    <form class="searchbar" onSubmit=${doSearch}>
      <input class="big" type="search" placeholder="Sök i Willys sortiment …"
             value=${q} onInput=${(e) => setQ(e.target.value)} />
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
          <select onChange=${(e) => { r._aisle = e.target.value; }}>
            ${[...state.aisles].sort((a, b) => a.order - b.order).map((a) =>
              html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}
          </select>
          <button class="btn primary small" onClick=${() => add(r)}>Lägg till</button>
          <button class="btn small" onClick=${() => add(r, { asStaple: true })}>Standardvara</button>
          <button class="btn small" onClick=${() => add(r, { watch: true })}>Bevaka pris</button>
        </div>
      </div>
    `)}
    ${!busy && !results.length && html`<div class="empty">Sök efter en vara för att lägga till den direkt.</div>`}
  `;
}

/* ------------------------------------------------------------ Varor tab */

export function ItemsTab({ state, reload, notify }) {
  const aisleOrder = [...state.aisles].sort((a, b) => a.order - b.order);
  const items = Object.values(state.items).sort((a, b) => {
    const ai = aisleOrder.findIndex((x) => x.id === a.aisle);
    const bi = aisleOrder.findIndex((x) => x.id === b.aisle);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name, "sv");
  });

  const patch = async (key, data) => {
    await api.patchItem(key, data);
    reload();
  };

  const stapleKeys = new Set(Object.keys(state.staples));
  const watchKeys = new Set(state.watchlist);

  return html`
    <table class="grid">
      <tbody>
        ${items.map((i) => {
          const st = state.stats?.[i.key];
          return html`
            <tr key=${i.key}>
              <td class="grow">
                <b>${i.name}</b>
                <div class="muted">
                  ${st?.purchases?.length ? html`Köpt ${st.purchases.length}x` : "Ingen historik"}
                </div>
              </td>
              <td>
                <select value=${i.aisle} onChange=${(e) => patch(i.key, { aisle: e.target.value })}>
                  ${aisleOrder.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}
                </select>
              </td>
              <td>
                <select value=${st?.mode ?? "suggest"} onChange=${(e) => patch(i.key, { mode: e.target.value })}>
                  <option value="suggest">Föreslå</option>
                  <option value="auto">Auto</option>
                  <option value="never">Aldrig</option>
                </select>
              </td>
              <td>
                ${stapleKeys.has(i.key)
                  ? html`<button class="btn small" onClick=${async () => { await api.unsetStaple(i.key); reload(); }}>✓ Standard</button>`
                  : html`<button class="btn small ghost" onClick=${async () => { await api.setStaple(i.key, { active: true, qty: 1 }); reload(); }}>Standard</button>`}
              </td>
              <td>
                ${watchKeys.has(i.key)
                  ? html`<button class="btn small" onClick=${async () => { await api.unwatch(i.key); reload(); }}>👁</button>`
                  : html`<button class="btn small ghost" onClick=${async () => { await api.watch(i.key); reload(); }}>👁</button>`}
              </td>
              <td>
                <button class="btn small danger" onClick=${async () => { await api.deleteItem(i.key); reload(); }}>✕</button>
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

export function AislesTab({ state, reload, notify }) {
  const [aisles, setAisles] = useState([...state.aisles].sort((a, b) => a.order - b.order));

  const move = (idx, dir) => {
    const next = [...aisles];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setAisles(next);
  };

  const rename = (idx, name) => {
    const next = [...aisles];
    next[idx] = { ...next[idx], name };
    setAisles(next);
  };

  const save = async () => {
    await api.reorderAisles(aisles.map((a) => a.id), Object.fromEntries(aisles.map((a) => [a.id, a.name])));
    notify("Gångordning sparad");
    reload();
  };

  return html`
    <div class="card">
      <div class="row">
        <div class="grow muted">Ordningen styr i vilken ordning varor läggs på inköpslistan.</div>
        <button class="btn primary" onClick=${save}>Spara ordning</button>
      </div>
    </div>
    ${aisles.map((a, idx) => html`
      <div class="card" key=${a.id}>
        <div class="row">
          <span class="muted">${idx + 1}.</span>
          <input type="text" class="grow" value=${a.name} onChange=${(e) => rename(idx, e.target.value)} />
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

export function DealsTab({ state, reload, notify }) {
  const deals = state.deals ?? [];
  const watch = async (d) => {
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
          <button class="btn small" onClick=${() => watch(d)}>Bevaka</button>
        </div>
      </div>
    `)}
    ${!deals.length && html`<div class="empty">Inga reor hämtade än.</div>`}
  `;
}

/* ---------------------------------------------------- Inställningar tab */

export function SettingsTab({ state, reload, notify }) {
  const [stores, setStores] = useState([]);
  const [storeFilter, setStoreFilter] = useState("");

  const loadStores = () => {
    api.stores()
      .then((d) => setStores(d.stores ?? []))
      .catch((e) => notify(`Butiker: ${e.message}`));
  };
  useMemo(loadStores, []);

  const filtered = stores.filter(
    (s) => !storeFilter || s.name.toLowerCase().includes(storeFilter.toLowerCase()),
  );

  return html`
    <div class="card">
      <h2>Butik</h2>
      <div class="muted" style="margin-bottom:8px">
        Aktiv butik: <b>${state.storeId || "hemmabutik från kontot"}</b>.<br />
        Byt butik via add-ons inställningar (Inställningar → Tillägg → Willys Inbox) med butikens ID:
      </div>
      <input class="big" type="search" placeholder="Filtrera butiker …"
             value=${storeFilter} onInput=${(e) => setStoreFilter(e.target.value)} />
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
        <button class="btn" onClick=${async () => { await api.refresh(); notify("Reor uppdaterade"); reload(); }}>
          Uppdatera reor nu
        </button>
        <button class="btn primary" onClick=${async () => { const r = await api.compose(true); notify(`La till ${r.added} varor`); reload(); }}>
          Komponera lista nu
        </button>
      </div>
    </div>
  `;
}
