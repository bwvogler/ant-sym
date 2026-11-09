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

/** The largest seed: the generators read a seed as 32 bits, so a larger one would draw a smaller one's world. */
export const MAX_SEED = 0xffffffff;

/** A seed typed or in the query: a whole number from 1 to MAX_SEED, or null. */
export function parseSeed(text: string | null): number | null {
  if (text === null || text.trim() === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n > 0 && n <= MAX_SEED ? n : null;
}

/** The seed in the query (`?world=one&seed=4`), or 1. */
export function previewSeed(search: string): number {
  return parseSeed(new URLSearchParams(search).get("seed")) ?? 1;
}

/** The query with its seed set to `seed`, everything else kept: the address to share or reload. */
export function withSeed(search: string, seed: number): string {
  const q = new URLSearchParams(search);
  q.set("seed", String(seed));
  return `?${q}`;
}

/**
 * A map to draw and nothing to run: one colony of no ants per nest, and a fungus with no spores. The colonies' odours
 * spread evenly from 0 to 1, so the renderer tells their nests apart: with two, Ink at 0 and Amber at 1, as the game
 * starts them (game.ts).
 */
export function stillLife(map: WorldMap): { colonies: Colony[]; fungus: Fungus } {
  const n = map.nests.length;
  const colonies = map.nests.map((_, k) => new Colony(map, { antCount: 0, nest: k, odour: n > 1 ? k / (n - 1) : 0 }, mulberry32(k + 1)));
  return { colonies, fungus: new Fungus(map) };
}
