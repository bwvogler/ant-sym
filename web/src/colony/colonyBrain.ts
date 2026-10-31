import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { hash } from "../sim/policyCache.ts";
import { MODES, type Mode, type Situation } from "./colony.ts";

// The colony's Jev brain, pure: the mode choice as a packed request, one
// `choice` per situation (not per ant), and its answer read back. A
// situation is a handful of small values, so there are only SITUATIONS of
// them; the colony's doctrine — the player's words for how ants should
// behave — rides in the shared state, so a new doctrine is a new question
// and a cached answer is kept per doctrine (`policyContext`).

/** Bump when the situation fields or their meaning change: old cached answers no longer apply. */
export const COLONY_BRAIN_VERSION = 1;

export const COLONY_LEGEND =
  "Each key in `ants` is the situation of one worker ant of a colony. mode is what the ant is doing now: explore (wander looking for new food, marking the way home), follow (walk up a food scent toward food) or return (walk home). tired means it has been out a long time without finding food. foodTrail, homeTrail and alarm say how strong each scent is just ahead of the ant: none, faint or strong. Food scent is laid by ants carrying food home, so it leads to food; home scent leads home; alarm scent marks danger. An ant carrying food always goes home and is never asked. doctrine is how the colony wants its ants to behave: follow it.";

export interface Doctrine {
  id: string;
  name: string;
  text: string;
}

export const DOCTRINES: Doctrine[] = [
  { id: "forage", name: "Forage", text: "Gather as much food as possible. Follow a strong food scent; explore when there is none; go home when tired." },
  { id: "cautious", name: "Cautious", text: "Safety first. Any alarm scent means go home. Go home when tired. Otherwise follow food scent, even a faint one." },
  { id: "scouts", name: "Scouts", text: "Find new food. Keep exploring unless the food scent is strong; never follow a faint one. Ignore alarm unless it is strong." },
];

const MODE_CRITERIA: Record<Mode, string> = {
  explore: "explore: wander and look for new food",
  follow: "follow: walk up the food scent toward food",
  return: "return: walk home",
};

/** The cache key for a situation. */
export function situationKey(s: Situation): string {
  return `${s.mode}|${s.tired ? "tired" : "fresh"}|${s.foodTrail}|${s.homeTrail}|${s.alarm}`;
}

/** What a situation looks like in the request: the same fields, as Jev reads them. */
export function situationState(s: Situation): Situation {
  return { mode: s.mode, tired: s.tired, foodTrail: s.foodTrail, homeTrail: s.homeTrail, alarm: s.alarm };
}

export function modeQuestion(id: string): JevRequest["questions"] {
  return { [`${id}_mode`]: { type: "choice", instructions: `Going by the doctrine, what should ant \`${id}\` do now?`, criteria: MODE_CRITERIA } };
}

/** One request for many situations: one shared state (legend, doctrine, situations), one choice each. */
export function packModeRequest(items: { id: string; situation: Situation }[], doctrine: string): JevRequest {
  const ants: Record<string, Situation> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    ants[it.id] = situationState(it.situation);
    Object.assign(questions, modeQuestion(it.id));
  }
  return { state: { legend: COLONY_LEGEND, doctrine, ants }, questions };
}

/** A situation's mode from a reply, or null when it is missing or not a mode (not cached; the local rule covers it). */
export function readMode(answers: Record<string, JevAnswer>, id: string): Mode | null {
  const a = answers[`${id}_mode`];
  if (!a || a.type !== "choice") return null;
  return (MODES as readonly string[]).includes(a.choice) ? (a.choice as Mode) : null;
}

/** What a cached mode was asked under: a different doctrine, legend or question wording is a different cache. */
export function policyContext(doctrine: string): string {
  return `colony-v${COLONY_BRAIN_VERSION}-${hash(COLONY_LEGEND + JSON.stringify(modeQuestion("s0")) + doctrine.trim())}`;
}

/**
 * Rough input tokens for a request, from its size: the picture brain's
 * compass request measured 296 tokens per ant at 625 bytes per ant (PRD
 * §8.1b). An estimate for the panel and the cost script; the ledger counts
 * the real usage.input_tokens.
 */
export const TOKENS_PER_BYTE = 296 / 625;
export function estimateTokens(req: JevRequest): number {
  return Math.round(JSON.stringify(req).length * TOKENS_PER_BYTE);
}
