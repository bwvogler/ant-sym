// The invasive garden ant, Lasius neglectus (ja-e668.3, docs/lasius-neglectus.md, PRD §64.2): the generic ant's senses, lanes and
// responses, with one supercolony's tolerance and its own words for the mode lane. Its grooming, brood disinfection, queens and budding
// come later (ja-e668.4–.6); its graded aggression between populations is ja-e668.10.

import { COLONY_LEGEND, MODE_CRITERIA, STANCE_WORDS } from "./colonyBrain.ts";
import { localPolicy } from "./localRules.ts";
import { localResponses } from "./responses.ts";
import { SPECIES, type Species } from "./species.ts";
import type { LaneWords, Mode, Policy } from "./vocab.ts";

/**
 * Its tolerance: one supercolony (owner, 2026-11-15). Within one *L. neglectus* population nests don't fight at all, and nestmates are
 * unrelated (r = 0.02), so tolerance is not kinship (Cremer et al. 2008; Ugelvig et al. 2008, both full text). The game's colonies start as
 * far apart as odours go (0 and 1), so a tolerance of 1 keeps them one population: they never fight, and their nests already smell alike.
 */
export const NEGLECTUS_TOLERANCE = 1;

/**
 * Its mode lane's words: the generic ant's legend, with no `fight` (owner, 2026-11-15: realistic). Within one population nests show no
 * aggression at all (Cremer et al. 2008; Ugelvig et al. 2008, full text), and a game of one species is one population here, so an ant has no
 * one to fight. Fighting comes back with rival populations (ja-e668.10) or other species in a mixed world (ja-e668.11).
 */
export const NEGLECTUS_MODE_WORDS: LaneWords<Mode> = {
  legend: COLONY_LEGEND,
  criteria: { explore: MODE_CRITERIA.explore, follow: MODE_CRITERIA.follow, return: MODE_CRITERIA.return },
  version: 2,
};

/** Its local rule: the generic ant's, offering only its words' modes (species.ts): a `fight` it would choose is read as explore (review of #244, N4). */
export const neglectusPolicy: Policy = (s) => {
  const m = localPolicy(s);
  return m === "fight" ? "explore" : m;
};

export const NEGLECTUS_ANT: Species = {
  id: "neglectus",
  name: "Invasive garden ant",
  // Sensed grooming (ja-e668.4.1): every number design, tuned on N1 (PRD §64.2). The groomer's dose and its priming are what make nestmates
  // plateau at a trace while the exposed ant keeps its load.
  params: {
    tolerance: NEGLECTUS_TOLERANCE,
    groomByLoad: 1,
    groomHalf: 0.1,
    groomVmax: 0.002,
    groomKm: 0.3,
    groomDose: 0.5,
    groomPrime: 40,
    groomProximity: 0,
  },
  responses: localResponses,
  lanes: { mode: NEGLECTUS_MODE_WORDS, stance: STANCE_WORDS },
  policy: neglectusPolicy,
};

// The page can play it (the start screen's species choice): a save names it by id (species.ts SPECIES).
(SPECIES as Record<string, Species>)[NEGLECTUS_ANT.id] = NEGLECTUS_ANT;
