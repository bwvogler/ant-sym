// The one-world preview (U2, ja-lp4.2), pure: which page to show, and the stub colonies the renderer draws a map with.
// The preview draws the plane and the curtain read-only, with no simulation: ColonyField needs colonies (each nest's
// rings, the queen in her chamber) and a fungus, so each map gets colonies of no ants.

import { Colony } from "../colony/colony.ts";
import { Fungus } from "../colony/fungus.ts";
import { mulberry32, type WorldMap } from "../colony/world.ts";

/** Whether the page was opened as the one-world preview: `?world=one` (a query, not a path: Pages serves one page). */
export function isOneWorldPreview(search: string): boolean {
  return new URLSearchParams(search).get("world") === "one";
}

/** The seed in the query (`?world=one&seed=4`), or 1. */
export function previewSeed(search: string): number {
  const n = Number(new URLSearchParams(search).get("seed"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** A map to draw and nothing to run: one colony of no ants per nest, and a fungus with no spores. */
export function stillLife(map: WorldMap): { colonies: Colony[]; fungus: Fungus } {
  const colonies = map.nests.map((_, k) => new Colony(map, { antCount: 0, nest: k }, mulberry32(k + 1)));
  return { colonies, fungus: new Fungus(map) };
}
