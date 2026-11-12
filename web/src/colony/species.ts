import type { ColonyParams } from "./colony.ts";
import { MODE_WORDS, STANCE_WORDS } from "./colonyBrain.ts";
import { localResponses, type Responses } from "./responses.ts";
import type { LaneWords, Mode, Stance } from "./vocab.ts";

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
  /**
   * The words the species asks Jev under, by lane (vocab.ts LaneWords: legend, criteria, version), so its answers are cached under its own
   * contexts (the lane rows take them as their `lane` argument). The fungus's lane has none yet (its words by host come with the fungus levers,
   * ja-rf5.7). A lane absent here is one the species does not have. The rows' `lane` argument is not that: absent there it means the generic ant's words, so a caller checks `lanes.stance` before it asks (nothing reads absence yet; the desert ant, ja-rf5.3, is the first without a stance lane, and its wiring does the check).
   */
  lanes: { mode?: LaneWords<Mode>; stance?: LaneWords<Stance> };
}

/**
 * The species a save or a page names by id (Species.id; GameSettings.species): code cannot be saved, so a record keeps the id and the page builds the
 * game with the species it names. Add a species' row here when the page can play it.
 */
export const SPECIES: Readonly<Record<string, Species>> = {};

/** The species with this id, or an error for one this build does not know. */
export function speciesById(id: string): Species {
  const s = Object.hasOwn(SPECIES, id) ? SPECIES[id] : undefined;
  if (!s) throw new Error(`species: no "${id}" here (known: ${Object.keys(SPECIES).join(", ")})`);
  return s;
}

/** The ant the game has always had: no overrides, the local responses. A game plays it unless it names another species. */
export const GENERIC_ANT: Species = {
  id: "generic",
  name: "Ant",
  params: {},
  responses: localResponses,
  lanes: { mode: MODE_WORDS, stance: STANCE_WORDS },
};
(SPECIES as Record<string, Species>)[GENERIC_ANT.id] = GENERIC_ANT;
