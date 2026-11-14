// The local rules (docs/refactor.md S3.3, ja-fnd.4.12): the mode an ant takes and the stance a colony takes when no policy answers (Jev's stand-in, and the rule a lane plays while its words change). Moved out of colony.ts verbatim.

import { type Policy, type StancePolicy } from "./vocab.ts";

/**
 * The local rule. (An enemy close by is the contact response's to answer, behaviour MR 4: before it, this rule sent
 * every ant with one near to fight.) Tired: go home. Raiding:
 * explorers (and fighters) go raiding, followers keep foraging. Defending:
 * alarm calls fighters. A fight that is over sends the ant home. Otherwise
 * forage: a strong food trail is followed, none means explore, a faint one
 * keeps what the ant was doing (an ant that just dropped its food heads back
 * out along it). Going home tired breaks ant mills: without it, followers
 * circled trails to food that was gone until nobody was left exploring.
 */
export const localPolicy: Policy = (s) => {
  if (s.tired) return "return";
  if (s.stance === "raid" && (s.mode === "explore" || s.mode === "fight")) return "fight";
  if (s.stance === "defend" && s.alarm !== "none") return "fight";
  if (s.mode === "fight") return "return";
  if (s.foodTrail === "strong") return "follow";
  if (s.foodTrail === "none") return "explore";
  return s.mode === "return" ? "follow" : s.mode;
};

/** The local strategist: defend a nest under attack; raid when no food comes in or the colony is full and fed; else forage. */
export const localStance: StancePolicy = (s) => {
  if (s.enemyNearNest && s.losses !== "none") return "defend";
  if (s.intake === "none" && s.ants !== "few") return "raid";
  if (s.larder === "full" && s.ants === "many") return "raid";
  return "forage";
};
