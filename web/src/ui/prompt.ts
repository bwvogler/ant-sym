import type { JevRequest } from "../../shared/jev.ts";
import {
  LANE_KINDS,
  type LaneName,
  type Situation,
  type StanceSituation,
  estimateTokens,
  packModeRequest,
  packStanceRequest,
  type FungalSituation,
  packFungusRequest,
  DEFAULT_MENU,
  LEVERS,
} from "../colony/index.ts";

// What Jev is sent, pure: the Learn drawer shows the exact request for one
// situation, and what a question costs. Requests pack many situations behind
// one shared legend and doctrine (colonyBrain.ts), so the cost of a question
// is a full request's size over the situations it carries, as useColonyJev's
// estimates have always been.

export const SAMPLE_SITUATION: Situation = {
  mode: "explore",
  tired: false,
  foodTrail: "faint",
  homeTrail: "strong",
  alarm: "none",
  enemy: "none",
  stance: "forage",
};
export const SAMPLE_STANCE: StanceSituation = {
  stance: "forage",
  ants: "some",
  losses: "none",
  enemyNearNest: false,
  intake: "some",
  larder: "low",
};
export const SAMPLE_FUNGAL: FungalSituation = {
  arousal: "calm",
  touch: "nestmate",
  place: "outside",
  task: "forager",
  carrying: "nothing",
  groomed: false,
};
const MENU_ON = new Set(DEFAULT_MENU);

export { PER_REQUEST } from "../colony/index.ts";

export type Sample =
  | { lane: "mode"; situation: Situation }
  | { lane: "stance"; situation: StanceSituation }
  | { lane: "fungus"; situation: FungalSituation; menu?: ReadonlySet<string> };

/** The request lane `lane` would send for these situations under these words (doctrine or aim). */
export function requestFor(sample: Sample, words: string, n = 1): JevRequest {
  if (sample.lane === "mode")
    return packModeRequest(
      Array.from({ length: n }, (_, k) => ({ id: `${LANE_KINDS.mode.idPrefix}${k}`, situation: sample.situation })),
      words,
    );
  if (sample.lane === "stance")
    return packStanceRequest(
      Array.from({ length: n }, (_, k) => ({ id: `${LANE_KINDS.stance.idPrefix}${k}`, situation: sample.situation })),
      words,
    );
  const menu = sample.menu ?? MENU_ON;
  const asked = LEVERS.filter((v) => menu.has(v.id)).map((v) => v.id);
  return packFungusRequest(
    Array.from({ length: n }, (_, k) => ({ id: `${LANE_KINDS.fungus.idPrefix}${k}`, situation: sample.situation, asked })),
    words,
  );
}

const SAMPLES: Record<LaneName, Sample> = {
  mode: { lane: "mode", situation: SAMPLE_SITUATION },
  stance: { lane: "stance", situation: SAMPLE_STANCE },
  fungus: { lane: "fungus", situation: SAMPLE_FUNGAL },
};

/** Situations a request carries in lane `lane`: PER_REQUEST, but fewer for the fungus (a question per lever each). */
export function perRequest(lane: LaneName): number {
  return LANE_KINDS[lane].perRequest;
}

/** Estimated input tokens per question (one situation) in lane `lane`, packed as the page packs them. */
export function tokensPerQuestion(lane: LaneName, words: string): number {
  const n = perRequest(lane);
  return Math.round(estimateTokens(requestFor(SAMPLES[lane], words, n)) / n);
}
