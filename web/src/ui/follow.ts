import type { Colony } from "../colony/colony.ts";

// Which ant the camera follows. A slot alone is not an ant: when an ant dies
// its slot is refilled by the next newborn, often within the same frame, so
// an ant is (side, slot, generation) and a changed generation means the ant
// we followed is gone.

export interface Followed {
  side: "you" | "rival";
  /** the ant's slot in its colony's arrays */
  i: number;
  /** the slot's generation when the ant was picked (Colony.gen) */
  gen: number;
}

/** The colony holding the followed ant, or null when that ant is gone (dead, or its slot reused by a newborn). */
export function followedColony(colony: Colony, rival: Colony | null, f: Followed): Colony | null {
  const col = f.side === "you" ? colony : rival;
  return col && col.alive[f.i] && col.gen[f.i] === f.gen ? col : null;
}
