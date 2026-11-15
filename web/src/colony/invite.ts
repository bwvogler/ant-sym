// The desert ant's invitation (ja-rf5.6, docs/desert-ant.md §1; Razin, Eckmann & Feinerman 2013, full text, C. niger): a finder coming home
// raises the pace of the nestmates waiting at the top of the shaft that it passes, and an ant's own pace is what it leaves by. Pure functions,
// so the game (arrive.ts, sense.ts, Colony.leaves) and the staged chamber (experiment.ts D2) run the same rule.

import type { ColonyParams } from "./params.ts";
import type { Returns } from "./responses.ts";
import { LEAVE_NOW, LEAVE_SOON } from "./tuning.ts";

/**
 * A waiting ant's pace after dt seconds. Each of the `passes` finders that came down past it pulls it toward invitePace; it relaxes toward
 * paceRest, the faster the more nestmates are round it (the crowd it feels; one leaked under 0 counts as none): in Razin's chambers an ant
 * that meets slower ants slows, so a crowd of resting ants damps a raised pace, and more ants in the nest lowered exits.
 */
export function paceAfter(p: ColonyParams, pace: number, passes: number, crowd: number, dt: number): number {
  const tau = p.paceTau / (1 + p.paceCrowd * Math.max(0, crowd));
  let v = p.paceRest + (pace - p.paceRest) * Math.exp(-dt / tau);
  if (passes > 0) v += (p.invitePace - v) * (1 - (1 - Math.min(1, p.paceGain)) ** passes);
  return v;
}

/** What an ant's own pace says to its leave response, as `returns`: many from paceMany, few from paceFew. */
export function paceReturns(p: ColonyParams, pace: number): Returns {
  return pace >= p.paceMany ? "many" : pace >= p.paceFew ? "few" : "none";
}

/** How fast (per second) an ant waiting at home goes out on its leave answer: now, soon, a raid scout's rate, or a scout's. */
export function leaveRate(p: ColonyParams, answer: string): number {
  return answer === "now" ? LEAVE_NOW : answer === "soon" ? LEAVE_SOON : answer === "raid" ? p.raidScout : p.scoutRate;
}
