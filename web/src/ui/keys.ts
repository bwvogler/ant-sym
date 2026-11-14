// The page's keyboard (PRD §69.3, ja-mvo9.2): one table, read by the page's key handler and by the shortcuts sheet, so the
// sheet can't drift from what the keys do. Pure: `pageKey` says which action a key press is, and `node --test` covers it.
// The map's own keys (pan, zoom, nests: ColonyField's onKey) work while it has focus; they are listed here for the sheet.

/** What a page-wide key does. */
export type PageAction =
  | { kind: "palette" }
  | { kind: "shortcuts" }
  | { kind: "lens" }
  | { kind: "play" }
  | { kind: "speed"; speed: number }
  | { kind: "view" }
  | { kind: "host" };

/** The page's speeds, by key 1–4 (the HUD's: 1×, 2×, 4× and the fastest). */
export function speedKeys(speeds: readonly number[]): Record<string, number> {
  return Object.fromEntries(speeds.map((s, j) => [String(j + 1), s]));
}

/** A key press, as `pageKey` reads it. */
export interface KeyPress {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  /** focus is in a text field, a select or an editable element: its keys are its own */
  typing: boolean;
  /** focus is on a button, a link or another control that Space would press */
  control: boolean;
}

/**
 * The page-wide action a key press is, or null: the page leaves it be. ⌘K or Ctrl+K opens the palette from anywhere,
 * even a text field; every other key only away from one, and with no modifier (the browser's own shortcuts pass).
 */
export function pageKey(e: KeyPress, speeds: readonly number[]): PageAction | null {
  if ((e.meta || e.ctrl) && !e.alt && e.key.toLowerCase() === "k") return { kind: "palette" };
  if (e.typing || e.ctrl || e.meta || e.alt) return null;
  if (e.key === "?") return { kind: "shortcuts" };
  if (e.key === " ") return e.control ? null : { kind: "play" };
  const s = speedKeys(speeds)[e.key];
  if (s !== undefined) return { kind: "speed", speed: s };
  switch (e.key.toLowerCase()) {
    case "i":
      return { kind: "lens" };
    case "v":
      return { kind: "view" };
    case "f":
      return { kind: "host" };
    default:
      return null;
  }
}

/** One row of the shortcuts sheet: the keys and what they do. `map`: only while the map has focus (click it first). */
export interface Shortcut {
  keys: string[];
  does: string;
  map?: true;
}

/** The palette's key as this machine names it: ⌘K on a Mac (or an iPhone, iPad), Ctrl+K elsewhere (review of #196, N5). */
export function modK(platform: string): string {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘K" : "Ctrl+K";
}
export const MOD_K = modK(typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent);

/**
 * Every key the page and the map answer, for the sheet (keys.test checks each page key here is one `pageKey` knows); the
 * speed row from the HUD's speeds, so the two can't drift (review of #196, N7).
 */
export const shortcuts = (speeds: readonly number[]): { group: string; rows: Shortcut[] }[] => [
  {
    group: "Anywhere",
    rows: [
      { keys: ["⌘K", "Ctrl+K"], does: "the command palette: every action, by name" },
      { keys: ["?"], does: "this sheet" },
      { keys: ["Space"], does: "play or pause" },
      { keys: speeds.map((_, j) => String(j + 1)), does: `speed: ${speeds.map((s) => `${s}×`).join(", ")}` },
      { keys: ["v"], does: "switch the view: above or below" },
      { keys: ["f"], does: "follow a host of yours" },
      { keys: ["i"], does: "the lens: say what is under the pointer" },
      { keys: ["Esc"], does: "close what is open: a menu, the followed ant, a drawer" },
    ],
  },
  {
    group: "On the map",
    rows: [
      { keys: ["←", "↑", "→", "↓"], does: "pan (or W A S D)", map: true },
      { keys: ["+", "−"], does: "zoom in, out", map: true },
      { keys: ["0"], does: "the whole map", map: true },
      { keys: ["n"], does: "the next nest", map: true },
    ],
  },
];
