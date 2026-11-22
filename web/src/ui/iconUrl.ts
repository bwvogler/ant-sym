// The illustrated icons (web/public/ui-icons, 192 px PNGs): the builder tray's tools and the menu's drawers. Served from
// the app's base path (`/` in dev, `/ant-sym/` on Pages), so a URL is built, never written as `/ui-icons/...`.

/** The menu icons drawn as illustrations (public/ui-icons/menu/<name>.png); utility icons are monochrome glyphs. */
export const IMAGE_ICONS = ["fungus", "evolve", "colonies", "saves", "learn", "settings", "build", "above", "below"] as const;

export type IconGroup = "builder" | "menu";

/** The URL of a shipped icon file, e.g. `iconUrl("builder", "dig")`. */
export function iconUrl(
  group: IconGroup,
  name: string,
  base: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/",
): string {
  return `${base.endsWith("/") ? base : `${base}/`}ui-icons/${group}/${name}.png`;
}
