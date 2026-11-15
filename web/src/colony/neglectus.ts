// The invasive garden ant, Lasius neglectus (ja-e668.3, docs/lasius-neglectus.md, PRD §64.2): the generic ant's senses, lanes and
// responses, with one supercolony's tolerance and its own words for the mode lane. Its grooming, brood disinfection, queens and budding
// come later (ja-e668.4–.6); its graded aggression between populations is ja-e668.10.

import { COLONY_LEGEND, MODE_CRITERIA, STANCE_WORDS } from "./colonyBrain.ts";
import { localResponses } from "./responses.ts";
import { SPECIES, type Species } from "./species.ts";
import type { LaneWords, Mode } from "./vocab.ts";

/**
 * Its tolerance: one supercolony (owner, 2026-11-15). Within one *L. neglectus* population nests don't fight at all, and nestmates are
 * unrelated (r = 0.02), so tolerance is not kinship (Cremer et al. 2008; Ugelvig et al. 2008, both full text). The game's colonies start as
 * far apart as odours go (0 and 1), so a tolerance of 1 keeps them one population: they never fight, and their nests already smell alike.
 */
export const NEGLECTUS_TOLERANCE = 1;

/** Its mode lane's words: the generic ant's legend and modes, with fighting reserved for ants that smell unlike its own population. */
export const NEGLECTUS_MODE_WORDS: LaneWords<Mode> = {
  legend: COLONY_LEGEND,
  criteria: {
    ...MODE_CRITERIA,
    fight:
      "fight: go for ants that smell unlike us, follow alarm scent to a fight, or raid; other nests that smell like us are our own population, never enemies",
  },
  version: 1,
};

export const NEGLECTUS_ANT: Species = {
  id: "neglectus",
  name: "Invasive garden ant",
  params: { tolerance: NEGLECTUS_TOLERANCE },
  responses: localResponses,
  lanes: { mode: NEGLECTUS_MODE_WORDS, stance: STANCE_WORDS },
};

// The page can play it (the start screen's species choice): a save names it by id (species.ts SPECIES).
(SPECIES as Record<string, Species>)[NEGLECTUS_ANT.id] = NEGLECTUS_ANT;
