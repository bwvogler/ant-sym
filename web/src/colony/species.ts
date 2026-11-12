import type { ColonyParams } from "./colony.ts";
import { localResponses, type Responses } from "./responses.ts";

// A species (docs/species.md, ja-fnd.5.3): what one kind of ant is, as data the Game hands its colonies. Step 1 of the order of work holds
// the physiology (parameter overrides) and the local rule set; the lane words, the sense sources, the fungus's host properties and the
// names are added by the next beads (.2-.4). The Game hands a species' params and responses to its colonies (Colony stays free of the idea). GameParams.species is code, so the save leaves it out until step 3 saves its id. A game has one species (owner, 2026-11-12); mixed worlds are ja-fnd.5.4.

export interface Species {
  id: string;
  name: string;
  /** Overrides of DEFAULT_COLONY for every colony of the species (speed, patience, maxAnts, deposit rates, per-channel params). Explicit settings of a game (`Sides.colony`) win over it; a founded colony takes `nest`, `odour`, `tolerance` and `antCount` from its founding, and `maxAnts` from the founding, else from here, else from the game's size. */
  params: Partial<ColonyParams>;
  /** The local rule set: what it lays, how it answers contact, leaving, alarm. The generic ant reuses `localResponses` itself (Colony compares its functions by identity). */
  responses: Responses;
}

/** The ant the game has always had: no overrides, the local responses. A game plays it unless it names another species. */
export const GENERIC_ANT: Species = { id: "generic", name: "Ant", params: {}, responses: localResponses };
