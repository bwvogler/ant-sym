import { useSyncExternalStore } from "react";

// The player's choice of light or dark (PRD §69.9, ja-mvo9.5): the system's by default, or either, kept per browser. It
// is `data-theme` on <html>, which index.css reads (the dark variables are there twice, under the system's preference and
// under data-theme="dark"); the canvas watches the attribute and recolours (ColonyField). index.html applies it before the
// first paint, from the same storage key, so a chosen theme never flashes the other one.

export type Theme = "system" | "light" | "dark";
export const THEMES: readonly Theme[] = ["system", "light", "dark"];
export const THEME_KEY = "jevants.theme";

/** A stored value as a theme: anything but light or dark is the system's. */
export function parseTheme(raw: string | null | undefined): Theme {
  return raw === "light" || raw === "dark" ? raw : "system";
}

/** What Settings and the palette say for each. */
export const THEME_LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

function stored(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

/** Show a theme on the page: data-theme on <html>, absent for the system's. */
export function applyTheme(t: Theme, root: { dataset: DOMStringMap } = document.documentElement): void {
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
}

let current: Theme | null = null;
const listeners = new Set<() => void>();

export const getTheme = (): Theme => (current ??= stored());

/** Choose a theme: shown now, kept for next time (where the browser lets the page keep anything). */
export function setTheme(t: Theme): void {
  current = t;
  applyTheme(t);
  try {
    if (t === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    // no storage: it holds for this page only
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => "system");
}
