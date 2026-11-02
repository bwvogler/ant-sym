import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { hash } from "../sim/policyCache.ts";
import { MODES, STANCES, type Mode, type Situation, type Stance, type StanceSituation } from "./colony.ts";
import { localResponses, responses, touchKey, type Responses, type Touch, type Trail } from "./responses.ts";

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
export const COLONY_BRAIN_VERSION = 2;

export const COLONY_LEGEND =
  "Each key in `ants` is the situation of one worker ant of a colony. mode is what the ant is doing now: explore (wander looking for new food, marking the way home), follow (walk up a food scent toward food), return (walk home) or fight (go for enemy ants, or follow the colony's alarm scent to a fight, or raid the enemy nest). tired means it has been out a long time without finding food. foodTrail, homeTrail and alarm say how strong each scent is just ahead of the ant: none, faint or strong. Food scent is laid by ants carrying food home, so it leads to food; home scent leads home; alarm scent is laid by ants in a fight, or by the fungus, and marks danger. enemy is near when an ant of the rival colony is within two steps. stance is what the colony as a whole is doing: forage, defend or raid. An ant carrying food always goes home and is never asked. doctrine is how the colony wants its ants to behave: follow it.";

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
  explore: "explore: wander and look for new food",
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
 * The ant's small responses (responses.ts) as Jev questions: each is asked only when its moment
 * comes (touching food, carrying, at a place to put the load down, laying trail) and cached per
 * situation and doctrine like the modes. Not wired to the client yet: behaviour MRs turn lanes on
 * one at a time, after their assays; until then colony-cost estimates what each would cost. The
 * rates (trail amount, alarm gain, alarm raised) stay local tuning knobs, not questions.
 */
export const RESPONSE_LEGEND =
  "Each key in `ants` is the situation of one worker ant of a colony at a moment it must respond. mode is what it is doing: explore, follow (a food scent), return (home) or fight. carrying is what it holds: none or food. atNest says whether it is inside its own nest. enemy says whether an ant of the rival colony is within two steps. stance is what the colony as a whole is doing: forage, defend or raid. doctrine is how the colony wants its ants to behave: follow it.";

export const RESPONSE_HOOKS = ["get", "carry", "drop", "trail"] as const;
export type ResponseHook = (typeof RESPONSE_HOOKS)[number];

export function responseQuestion(hook: ResponseHook, id: string): JevRequest["questions"] {
  const ant = `ant \`${id}\``;
  switch (hook) {
    case "get":
      return { [`${id}_get`]: { type: "noul", instructions: `Going by the doctrine, ${ant} is touching food with empty jaws: should it pick one piece up?` } };
    case "drop":
      return { [`${id}_drop`]: { type: "noul", instructions: `Going by the doctrine, ${ant} is carrying food at its nest: should it put it down here?` } };
    case "carry":
      return { [`${id}_carry`]: { type: "choice", instructions: `Going by the doctrine, ${ant} is carrying food: what should it do?`, criteria: MODE_CRITERIA } };
    case "trail":
      return {
        [`${id}_trail`]: {
          type: "choice",
          instructions: `Going by the doctrine, which scent should ${ant} lay as it walks?`,
          criteria: { food: "food: mark the way to food (it is carrying food home)", home: "home: mark the way home (it is walking out)", none: "none: lay nothing" },
        },
      };
  }
}

/** One request for many response situations of one hook. */
export function packResponseRequest(hook: ResponseHook, items: { id: string; situation: Touch }[], doctrine: string): JevRequest {
  const ants: Record<string, Touch> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    const t = it.situation;
    ants[it.id] = { mode: t.mode, carrying: t.carrying, atNest: t.atNest, enemy: t.enemy, stance: t.stance };
    Object.assign(questions, responseQuestion(hook, it.id));
  }
  return { state: { legend: RESPONSE_LEGEND, doctrine, ants }, questions };
}

/** What a cached response was asked under (hook, legend, wording, doctrine). */
export function responseContext(hook: ResponseHook, doctrine: string): string {
  return `${hook}-v${COLONY_BRAIN_VERSION}-${hash(RESPONSE_LEGEND + JSON.stringify(responseQuestion(hook, "s0")) + doctrine.trim())}`;
}

/** What a response hook answers: the same type as the hook in responses.ts. */
export type ResponseAnswer = boolean | Mode | Trail;
const TRAILS_LAID: readonly string[] = ["food", "home", "none"];

/** A response from a reply, or null when it is missing or not one of the hook's answers (the local response covers it). A noul is yes above ½. */
export function readResponse(hook: ResponseHook, answers: Record<string, JevAnswer>, id: string): ResponseAnswer | null {
  const a = answers[`${id}_${hook}`];
  if (!a) return null;
  if (hook === "get" || hook === "drop") return a.type === "noul" && Number.isFinite(a.noul) ? a.noul > 0.5 : null;
  if (a.type !== "choice") return null;
  if (hook === "carry") return (MODES as readonly string[]).includes(a.choice) ? (a.choice as Mode) : null;
  return TRAILS_LAID.includes(a.choice) ? (a.choice as Trail) : null;
}

/** Cached response answers per hook, keyed by touchKey: what scripts/colony-live.mjs saves and the experiments replay. */
export type ResponseCache = Partial<Record<ResponseHook, Record<string, ResponseAnswer>>>;

/** Responses that answer from a cache, and from `base` for any situation (or hook) the cache lacks. */
export function responsesFromAnswers(cache: ResponseCache, base: Responses = localResponses): Responses {
  const over: Partial<Responses> = {};
  for (const hook of RESPONSE_HOOKS) {
    const table = cache[hook];
    if (!table) continue;
    const local = base[hook] as (t: Touch) => ResponseAnswer;
    (over as Record<ResponseHook, (t: Touch) => ResponseAnswer>)[hook] = (t) => table[touchKey(t)] ?? local(t);
  }
  return responses({ ...base, ...over });
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
