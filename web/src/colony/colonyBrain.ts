import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { hash } from "../sim/policyCache.ts";
import { MODES, STANCES, type Mode, type Situation, type Stance, type StanceSituation } from "./colony.ts";

// The colony's Jev brain, pure. Two choices go to Jev, both as packed
// requests with one question per *situation* (never per ant or per tick):
//   mode   — what an ant in this situation should do (explore, follow,
//            return, fight); SITUATIONS of them
//   stance — what the colony as a whole should do (forage, defend, raid),
//            from a coarse view of itself, asked by the strategist
// The colony's doctrine — the player's words for how the colony should
// behave — rides in the shared state, so a new doctrine is a new question
// and cached answers are kept per doctrine (`policyContext`, `stanceContext`).

/** Bump when the situation fields or their meaning change: old cached answers no longer apply. */
export const COLONY_BRAIN_VERSION = 4;

export const COLONY_LEGEND =
  "Each key in `ants` is the situation of one worker ant of a colony. mode is what the ant is doing now: explore (wander looking for new food, marking the way home, digging tunnels through soil), follow (walk up a food scent toward food), return (walk home) or fight (go for enemy ants, or follow the colony's alarm scent to a fight, or raid the enemy nest). tired means it has been out a long time without finding food. foodTrail and alarm say how strong each scent is just ahead of the ant: none, faint or strong. Food scent is laid by ants carrying food home, so it leads to food; alarm scent is laid by ants in a fight, or by the fungus, and marks danger. homeTrail, on the ground, is how strong the home scent ahead is (none, faint or strong; it leads home); inside the nest it says where the ant is: in a tunnel, or in one of the nest's chambers by what the chamber is for (royal: the queen's; brood; store: food kept; reception: where food comes in; midden: refuse). An ant inside the nest is home. enemy is near when an ant of the rival colony is within two steps. stance is what the colony as a whole is doing: forage, defend or raid. An ant carrying food, or soil it dug, always goes home and is never asked. doctrine is how the colony wants its ants to behave: follow it.";

export const STRATEGY_LEGEND =
  "`colony` describes an ant colony at war with a rival colony over the same food. stance is what it is doing now: forage (gather food), defend (fight near home) or raid (send fighters to the rival's nest). ants is how many ants it has against how many it can feed: few, some or many. losses is how many ants it lost lately: none, some or heavy. enemyNearNest says whether rival ants are close to home. foodLeft is how much food is left on the map: plenty, some or scarce. larder is food stored at home beyond what new ants need: low or full. doctrine is how the colony wants to behave: follow it.";

export interface Doctrine {
  id: string;
  name: string;
  text: string;
}

export const DOCTRINES: Doctrine[] = [
  { id: "forage", name: "Forage", text: "Gather as much food as possible. Follow a strong food scent; explore when there is none; go home when tired. Fight only an enemy that is close. Raid only when food runs out." },
  { id: "cautious", name: "Cautious", text: "Safety first. Any alarm scent means go home, unless the colony is defending. Go home when tired. Otherwise follow food scent, even a faint one. Defend the nest; never raid." },
  { id: "warlike", name: "Warlike", text: "Destroy the rival colony. Explorers become raiders whenever the colony has ants to spare. Follow alarm scent to every fight. Forage only to grow the colony." },
];

const MODE_CRITERIA: Record<Mode, string> = {
  explore: "explore: wander and look for new food, digging through soil",
  follow: "follow: walk up the food scent toward food",
  return: "return: walk home",
  fight: "fight: go for enemy ants, follow alarm scent to a fight, or raid the rival nest",
};

const STANCE_CRITERIA: Record<Stance, string> = {
  forage: "forage: gather food, fight only what comes close",
  defend: "defend: fighters stay near home and answer alarm",
  raid: "raid: send spare ants to fight at the rival's nest",
};

/** The cache key for an ant's situation. */
export function situationKey(s: Situation): string {
  return `${s.mode}|${s.tired ? "tired" : "fresh"}|${s.foodTrail}|${s.homeTrail}|${s.alarm}|${s.enemy}|${s.stance}`;
}

/** What a situation looks like in the request: the same fields, as Jev reads them. */
export function situationState(s: Situation): Situation {
  return { mode: s.mode, tired: s.tired, foodTrail: s.foodTrail, homeTrail: s.homeTrail, alarm: s.alarm, enemy: s.enemy, stance: s.stance };
}

export function modeQuestion(id: string): JevRequest["questions"] {
  return { [`${id}_mode`]: { type: "choice", instructions: `Going by the doctrine, what should ant \`${id}\` do now?`, criteria: MODE_CRITERIA } };
}

/** One request for many ant situations: one shared state (legend, doctrine, situations), one choice each. */
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

/** The cache key for the strategist's view. */
export function stanceKey(s: StanceSituation): string {
  return `${s.stance}|${s.ants}|${s.losses}|${s.enemyNearNest ? "enemy" : "clear"}|${s.foodLeft}|${s.larder}`;
}

export function stanceQuestion(id: string): JevRequest["questions"] {
  return { [`${id}_stance`]: { type: "choice", instructions: `Going by the doctrine, what should colony \`${id}\` do now?`, criteria: STANCE_CRITERIA } };
}

/** One request for many strategist views (normally one or two). */
export function packStanceRequest(items: { id: string; situation: StanceSituation }[], doctrine: string): JevRequest {
  const colony: Record<string, StanceSituation> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    colony[it.id] = { ...it.situation };
    Object.assign(questions, stanceQuestion(it.id));
  }
  return { state: { legend: STRATEGY_LEGEND, doctrine, colony }, questions };
}

export function readStance(answers: Record<string, JevAnswer>, id: string): Stance | null {
  const a = answers[`${id}_stance`];
  if (!a || a.type !== "choice") return null;
  return (STANCES as readonly string[]).includes(a.choice) ? (a.choice as Stance) : null;
}

/** What a cached mode was asked under: a different doctrine, legend or question wording is a different cache. */
export function policyContext(doctrine: string): string {
  return `colony-v${COLONY_BRAIN_VERSION}-${hash(COLONY_LEGEND + JSON.stringify(modeQuestion("s0")) + doctrine.trim())}`;
}

/** The same for cached stances. */
export function stanceContext(doctrine: string): string {
  return `stance-v${COLONY_BRAIN_VERSION}-${hash(STRATEGY_LEGEND + JSON.stringify(stanceQuestion("c0")) + doctrine.trim())}`;
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
