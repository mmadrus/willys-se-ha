import { h, render } from "preact";
import htm from "htm";
import { useState, useEffect, useCallback } from "preact/hooks";
import { api } from "./api.js";
import { ListTab, SearchTab, ItemsTab, AislesTab, DealsTab, SettingsTab } from "./tabs.js";

const html = htm.bind(h);

export function useAppData(pollMs = 10000) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(() => {
    api.state().then(setState).catch((e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);
  return { state, error, reload };
}

export function App() {
  const { state, error, reload } = useAppData();
  const [tab, setTab] = useState("lista");
  const [toast, setToast] = useState("");

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  if (error && !state) {
    return html`<div class="empty">Kunde inte nå servern: ${error}</div>`;
  }
  if (!state) return html`<div class="empty">Laddar …</div>`;

  const pending = state.suggestions.filter((s) => s.status === "pending");

  const TABS = [
    ["lista", "Lista"],
    ["sok", "Sök"],
    ["varor", `Varor (${Object.keys(state.items).length})`],
    ["gang", "Gångordning"],
    ["reor", "Reor"],
    ["inst", "Inställningar"],
  ];

  return html`
    <h1>Willys Inbox</h1>
    <div class="statusbar">
      <span><span class=${"dot" + (state.dealsUpdated ? "" : " err")}></span></span>
      <span>Butik: <b>${state.storeId || "—"}</b></span>
      <span>På listan väntar: <b>${pending.length}</b></span>
      ${state.lastComposeAt &&
      html`<span class="muted">Senaste komp: ${new Date(state.lastComposeAt).toLocaleString("sv-SE")}</span>`}
    </div>
    <div class="tabs">
      ${TABS.map(
        ([id, label]) => html`
          <button key=${id} class=${tab === id ? "active" : ""} onClick=${() => setTab(id)}>
            ${label}
          </button>
        `,
      )}
    </div>
    ${tab === "lista" && html`<${ListTab} state=${state} reload=${reload} notify=${notify} />`}
    ${tab === "sok" && html`<${SearchTab} state=${state} reload=${reload} notify=${notify} />`}
    ${tab === "varor" && html`<${ItemsTab} state=${state} reload=${reload} notify=${notify} />`}
    ${tab === "gang" && html`<${AislesTab} state=${state} reload=${reload} notify=${notify} />`}
    ${tab === "reor" && html`<${DealsTab} state=${state} reload=${reload} notify=${notify} />`}
    ${tab === "inst" && html`<${SettingsTab} state=${state} reload=${reload} notify=${notify} />`}
    ${toast && html`<div class="toast">${toast}</div>`}
  `;
}

export function mount(el) {
  render(html`<${App} />`, el);
}
