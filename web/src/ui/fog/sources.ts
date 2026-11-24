import type { Game } from "../../colony/index.ts";
import { CorpseMemory } from "./corpses.ts";
import { Knowledge, type Source } from "./knowledge.ts";
import { SensedMap } from "../fungusSight.ts";

// The ground the fog remembers (docs/fog-of-war.md §4.3, ja-1ypq.3.1): what a ground chunk paints from, per layer. The fungus's own
// spores are not here: they are its body, which the player always knows. Ants are never remembered.

/** The names the painter asks the snapshot by. */
export const SNAP = { rock: "rock", food: "food", quality: "quality", spoil: "spoil", chamber: "chamber" } as const;

/** Every layer's ground, as sources of the truth. */
export function groundSources(game: Game): Source[] {
  const out: Source[] = [];
  game.layers.forEach((m, layer) => {
    out.push({ name: SNAP.rock, layer, at: (cx, cy) => m.rock.chunk(cx, cy) });
    out.push({ name: SNAP.food, layer, at: (cx, cy) => m.food.chunk(cx, cy) });
    if (m.quality) out.push({ name: SNAP.quality, layer, at: (cx, cy) => m.quality!.chunk(cx, cy) });
    if (m.spoil) out.push({ name: SNAP.spoil, layer, at: (cx, cy) => m.spoil!.chunk(cx, cy) });
    if (m.chambers) out.push({ name: SNAP.chamber, layer, at: (cx, cy) => m.chambers!.cell.chunk(cx, cy) });
  });
  return out;
}

/** Whether the page runs with the fog of war: `?fog=1` for now (the default flips in F6, ja-1ypq.6). */
export function fogFromUrl(search = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("fog") === "1";
}

/** The sensed map for `game`: with the fog's knowledge hung on it when `fog`. */
export function sensedFor(game: Game, fog: boolean): SensedMap {
  const s = new SensedMap();
  if (fog) {
    s.knowledge = new Knowledge(s, groundSources(game));
    s.corpses = new CorpseMemory();
  }
  return s;
}
