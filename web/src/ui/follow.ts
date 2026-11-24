import type { Colony } from "../colony/index.ts";
import { LIVE, type Knowledge } from "./fog/knowledge.ts";

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

/**
 * Whether ant `f` may be followed, pinned to a card or jumped to: without the fog always; under it only while an observer senses the place it stands
 * (a host always does). One test for every route that would take the camera or a card to an ant (docs/fog-of-war.md §5.2).
 */
export function canFollow(fog: Knowledge | null, colonies: readonly Colony[], f: Followed): boolean {
  if (!fog) return true;
  const c = followedColony(colonies, f);
  return !!c && fog.stateAt(c.layer[f.i]!, c.x[f.i]!, c.y[f.i]!) === LIVE;
}
