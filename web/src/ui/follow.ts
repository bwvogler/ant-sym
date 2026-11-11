import type { Colony } from "../colony/index.ts";

// Which ant the camera follows. A slot alone is not an ant: when an ant dies
// its slot is refilled by the next newborn, often within the same frame, so
// an ant is (colony, slot, generation) and a changed generation means the ant
// we followed is gone.

export interface Followed {
  /** which colony: Game.colonies[k] (any number of them since ja-lo8.8) */
  k: number;
  /** the ant's slot in its colony's arrays */
  i: number;
  /** the slot's generation when the ant was picked (Colony.gen) */
  gen: number;
}

/** The followed ant's colony index (Game.colonies[k], ui/names.ts). */
export function sideIndex(f: Followed): number {
  return f.k;
}

/** The colony holding the followed ant, or null when that ant is gone (dead, or its slot reused by a newborn). */
export function followedColony(colonies: readonly Colony[], f: Followed): Colony | null {
  const col = colonies[f.k];
  return col && col.alive[f.i] && col.gen[f.i] === f.gen ? col : null;
}
