import { useEffect, useState } from "preact/hooks";

export type ThemeMode = "light" | "dark";

export interface ThemePrefs {
  mode: ThemeMode;
  /** accent color, Willys red by default */
  accent: string | null;
  /** page background override (empty = theme default) */
  bg: string | null;
}

const STORAGE_KEY = "willys-theme";
export const WILLYS_RED = "#d6001c";

export const THEME_DEFAULTS: Record<ThemeMode, { accent: string; bg: string }> = {
  light: { accent: WILLYS_RED, bg: "#ffffff" },
  dark: { accent: "#ff2d3f", bg: "#14161a" },
};

export function loadTheme(): ThemePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as Partial<ThemePrefs>;
    return {
      mode: raw.mode === "dark" ? "dark" : "light",
      accent: typeof raw.accent === "string" ? raw.accent : null,
      bg: typeof raw.bg === "string" ? raw.bg : null,
    };
  } catch {
    return { mode: "light", accent: null, bg: null };
  }
}

export function saveTheme(prefs: ThemePrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function applyTheme(prefs: ThemePrefs): void {
  const def = THEME_DEFAULTS[prefs.mode];
  const root = document.documentElement;
  root.dataset.theme = prefs.mode;
  root.style.setProperty("--accent", prefs.accent ?? def.accent);
  root.style.setProperty("--bg", prefs.bg ?? def.bg);
}

/** React-ish hook: current theme + setters that persist and apply instantly. */
export function useTheme(): [ThemePrefs, (p: ThemePrefs) => void] {
  const [prefs, setPrefs] = useState<ThemePrefs>(loadTheme);
  useEffect(() => {
    applyTheme(prefs);
    saveTheme(prefs);
  }, [prefs]);
  return [prefs, setPrefs];
}
