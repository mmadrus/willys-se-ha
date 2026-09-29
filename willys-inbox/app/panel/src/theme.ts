import { useEffect, useState } from "react";
import { THEME_DEFAULTS, type ThemeMode, type ThemePrefs } from "./types-theme";

const STORAGE_KEY = "willys-theme";

export type { ThemeMode, ThemePrefs };
export { THEME_DEFAULTS, WILLYS_RED } from "./types-theme";

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
  root.classList.toggle("dark", prefs.mode === "dark");
  root.style.setProperty("--primary", prefs.accent ?? def.accent);
  root.style.setProperty("--ring", prefs.accent ?? def.accent);
  root.style.setProperty("--background", prefs.bg ?? def.bg);
  // keep light text readable on a user-picked light background? no: bg choice is theirs
}

export function useTheme(): [ThemePrefs, (p: ThemePrefs) => void] {
  const [prefs, setPrefs] = useState<ThemePrefs>(loadTheme);
  useEffect(() => {
    applyTheme(prefs);
    saveTheme(prefs);
  }, [prefs]);
  return [prefs, setPrefs];
}
