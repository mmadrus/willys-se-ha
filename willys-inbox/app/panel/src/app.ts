import { h, render, type JSX } from "preact";
import htm from "htm";
import { useState, useEffect, useCallback } from "preact/hooks";
import { api } from "./api";
import type { AppStateData } from "./types";
import { ListTab, SearchTab, ItemsTab, AislesTab, DealsTab, SettingsTab } from "./tabs";
import { applyTheme, loadTheme } from "./theme";

type Html = (strings: TemplateStringsArray, ...values: unknown[]) => JSX.Element;
export const html = htm.bind(h as unknown as (...args: unknown[]) => unknown) as Html;

export function useAppData(pollMs = 10000): {
  state: AppStateData | null;
  error: string | null;
  reload: () => void;
} {
  const [state, setState] = useState<AppStateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback((): void => {
    api
      .state()
      .then((s) => {
        setState(s as AppStateData);
        setError(null);
      })
      .catch((e: Error) =>
        setError(`${String(e.message ?? e)} [sida=${window.location.pathname}]`),
      );
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);
  return { state, error, reload };
}

type TabId = "lista" | "sok" | "varor" | "gang" | "reor" | "inst";

export function App(): JSX.Element {
  const { state, error, reload } = useAppData();
  const [tab, setTab] = useState<TabId>("lista");
  const [toast, setToast] = useState("");

  const notify = useCallback((msg: string): void => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  if (error && !state) {
    return html`<div class="empty">Kunde inte nå servern: ${error}</div>`;
  }
  if (!state) return html`<div class="empty">Laddar …</div>`;

  const pending = state.suggestions.filter((s) => s.status === "pending");

  const TABS: Array<[TabId, string]> = [
    ["lista", "Lista"],
    ["sok", "Sök"],
    ["varor", `Varor (${state.items.length})`],
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

export function mount(el: Element | null): void {
  if (!el) {
    console.error("willys-panel: #app container not found");
    return;
  }
  // Apply saved theme before first paint to avoid a flash
  applyTheme(loadTheme());
  // Normalize a trailing "//" in the ingress document URL (see api.ts)
  try {
    const clean = window.location.pathname.replace(/\/{2,}/g, "/");
    if (clean !== window.location.pathname) {
      window.history.replaceState(null, "", clean + window.location.search);
    }
  } catch {
    /* non-fatal */
  }
  render(html`<${App} />`, el);
}
