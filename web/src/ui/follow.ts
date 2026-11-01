import type { Colony } from "../colony/colony.ts";

// Which ant the camera follows. A slot alone is not an ant: when an ant dies
// its slot is refilled by the next newborn, often within the same frame, so
// an ant is (side, slot, generation) and a changed generation means the ant
// we followed is gone.

export interface Followed {
  /** which colony: "you" is the first (Ink), "rival" the second (Amber). Identifiers kept from before the player became the fungus; see sideIndex. */
  side: "you" | "rival";
  /** the ant's slot in its colony's arrays */
  i: number;
  /** the slot's generation when the ant was picked (Colony.gen) */
  gen: number;
}

/** The followed ant's colony index (Game.colonies[k], ui/names.ts). */
export function sideIndex(f: Followed): number {
  return f.side === "you" ? 0 : 1;
}

/** The colony holding the followed ant, or null when that ant is gone (dead, or its slot reused by a newborn). */
export function followedColony(colony: Colony, rival: Colony | null, f: Followed): Colony | null {
  const col = f.side === "you" ? colony : rival;
  return col && col.alive[f.i] && col.gen[f.i] === f.gen ? col : null;
}
