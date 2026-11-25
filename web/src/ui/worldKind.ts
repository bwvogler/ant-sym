// Which world the page plays (PRD §66 E6, `ja-qpv.5.1`, owner 2026-11-25): the endless plane by default, or today's bounded one-world game behind `?world=bounded`.
// A leaf with no colony code, so the settings, the saves and the tests can all name it.

export type WorldKind = "endless" | "bounded";

/** The world a page plays when nothing else says: the endless plane. */
export const DEFAULT_WORLD: WorldKind = "endless";

/** The world the URL asks for: `?world=bounded` keeps the bounded game (the e2e, the pixel guard and the dev guards use it); anything else is the default. */
export function worldFromUrl(search: string = typeof location === "undefined" ? "" : location.search): WorldKind {
  return new URLSearchParams(search).get("world") === "bounded" ? "bounded" : DEFAULT_WORLD;
}

/** The world a save was made in: a save from before the switch carries none, and is bounded. */
export const worldOf = (settings: { world?: WorldKind }): WorldKind => settings.world ?? "bounded";
