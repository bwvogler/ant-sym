// First action boundary: translate the existing contact policy into executable intent.
// This deliberately preserves today's choices, including load/report protection. It does
// not decide who takes damage: battle.ts still uses proximity, independently of intent.
import type { Contact } from "./responses.ts";

/** A local target, never a map-wide ant ID or an unseen destination. */
export type ContactTarget = "stranger" | "home" | "current course";

/**
 * Contact actions last for this encounter step and are reconsidered while contact lasts.
 * Movement and releasing a load are separate: a carrier can retreat without losing food.
 * Immutable shared plans avoid allocating an object for every ant on every tick.
 */
export interface ContactAction {
  readonly movement: "attack" | "withdraw" | "continue";
  readonly target: ContactTarget;
  readonly release: boolean;
  readonly reason: "contact policy" | "protect load" | "report home";
}

const ATTACK: ContactAction = Object.freeze({ movement: "attack", target: "stranger", release: false, reason: "contact policy" });
const KEEP_LOAD: ContactAction = Object.freeze({ movement: "continue", target: "current course", release: false, reason: "protect load" });
const WITHDRAW: ContactAction = Object.freeze({ movement: "withdraw", target: "stranger", release: false, reason: "contact policy" });
const CARRY_HOME: ContactAction = Object.freeze({ movement: "withdraw", target: "home", release: false, reason: "contact policy" });
const DROP_AND_RETURN: ContactAction = Object.freeze({ movement: "withdraw", target: "home", release: true, reason: "contact policy" });
const REPORT_HOME: ContactAction = Object.freeze({ movement: "withdraw", target: "stranger", release: false, reason: "report home" });
const REPORT_LOAD: ContactAction = Object.freeze({ movement: "withdraw", target: "home", release: false, reason: "report home" });

/**
 * Resolve a policy answer against the ant's physical commitments. A reporting scout
 * cannot be recruited into another attack; a loaded ant cannot attack without releasing
 * its load. Legacy drop-and-run heads home this step, then can flee empty-jawed next step.
 */
export function contactAction(answer: Contact, loaded: boolean, reporting: boolean): ContactAction {
  if (answer === "fight") {
    if (reporting) return loaded ? REPORT_LOAD : REPORT_HOME;
    return loaded ? KEEP_LOAD : ATTACK;
  }
  if (loaded) return answer === "drop and run" ? DROP_AND_RETURN : CARRY_HOME;
  return WITHDRAW;
}
