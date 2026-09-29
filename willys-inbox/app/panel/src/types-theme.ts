export type ThemeMode = "light" | "dark";

export interface ThemePrefs {
  mode: ThemeMode;
  /** accent color, Willys red by default */
  accent: string | null;
  /** page background override (null = theme default) */
  bg: string | null;
}

export const WILLYS_RED = "#d6001c";

export const THEME_DEFAULTS: Record<ThemeMode, { accent: string; bg: string }> = {
  light: { accent: WILLYS_RED, bg: "#ffffff" },
  dark: { accent: "#ff2d3f", bg: "#14161a" },
};
