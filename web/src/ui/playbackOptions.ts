const browserSearch = () => (typeof location === "undefined" ? "" : location.search);

export const DEFAULT_ANTS = 600;

/** A fresh game's starting population. Saved games restore their own population. */
export function antsFromUrl(search = browserSearch()): number {
  const value = Number(new URLSearchParams(search).get("ants"));
  return Number.isInteger(value) && value >= 100 && value <= 2000 ? value : DEFAULT_ANTS;
}

/** An opt-in low-resolution map. All map drawing and pointer projection use the same scale. */
export function mapPixelRatioCap(search = browserSearch()): number {
  return new URLSearchParams(search).get("dpr") === "1" ? 1 : 2;
}

const cap = mapPixelRatioCap();
export function mapPixelRatio(): number {
  return Math.min(cap, window.devicePixelRatio || 1);
}
