import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { hash } from "../sim/policyCache.ts";
import { MODES, STANCES, type Mode, type Situation, type Stance, type StanceSituation } from "./colony.ts";
import { ALARM_LEVELS, ALARM_RESPONSES, CONTACTS, HOOKS, localResponses, MARKS, type AntView, type Hook, type Responses } from "./responses.ts";

// The colony's Jev brain, pure. Two choices go to Jev, both as packed
// requests with one question per *situation* (never per ant or per tick):
//   mode   — what an ant in this situation should do (explore, follow,
//            return, fight); SITUATIONS of them
//   stance — what the colony as a whole should do (forage, defend, raid),
//            from a coarse view of itself, asked by the strategist
// The colony's doctrine — the player's words for how the colony should
// behave — rides in the shared state, so a new doctrine is a new question
// and cached answers are kept per doctrine (`policyContext`, `stanceContext`).
// Each response hook (responses.ts) is a possible third kind of lane: a small
// question asked only when its event fires, cached per view of the fields
// that hook reads (HOOK_LANES, `packHookRequest`, `hookContext`).

/** Bump when the situation fields or their meaning change: old cached answers no longer apply. */
export const COLONY_BRAIN_VERSION = 3;

export const COLONY_LEGEND =
  "Each key in `ants` is the situation of one worker ant of a colony. mode is what the ant is doing now: explore (wander looking for new food, marking the way home), follow (walk up a food scent toward food), return (walk home) or fight (go for enemy ants, or follow the colony's alarm scent to a fight, or raid the enemy nest). tired means it has been out a long time without finding food. atNest means it is inside its own nest. foodTrail, homeTrail and alarm say how strong each scent is just ahead of the ant: none, faint or strong. Food scent is laid by ants carrying food home, so it leads to food; home scent leads home; alarm scent is laid by ants in a fight, or by the fungus, and marks danger. enemy is near when an ant of the rival colony is within two steps. stance is what the colony as a whole is doing: forage, defend or raid. An ant carrying food always goes home and is never asked. doctrine is how the colony wants its ants to behave: follow it.";

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
  return `${s.mode}|${s.tired ? "tired" : "fresh"}|${s.atNest ? "nest" : "out"}|${s.foodTrail}|${s.homeTrail}|${s.alarm}|${s.enemy}|${s.stance}`;
}

/** What a situation looks like in the request: the same fields, as Jev reads them. */
export function situationState(s: Situation): Situation {
  return { mode: s.mode, tired: s.tired, atNest: s.atNest, foodTrail: s.foodTrail, homeTrail: s.homeTrail, alarm: s.alarm, enemy: s.enemy, stance: s.stance };
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

/** One response hook as a Jev lane: which view fields it reads (its cache key), its legend, its question and answers. */
export interface HookLane {
  /** the AntView fields the answer may depend on; the cache key and the state sent */
  fields: (keyof AntView)[];
  legend: string;
  question: (id: string) => string;
  criteria: Record<string, string>;
}

const VIEW_LEGEND =
  "Each key in `ants` is one worker ant of a colony at a moment something happened to it. mode is what it is doing: explore, follow (a food scent), return (home) or fight. carrying is what it holds: none, food, soil or egg. atNest means it is inside its own nest. tired means it has been out a long time without finding food. foodTrail, homeTrail and alarm say how strong each scent is just ahead: none, faint or strong. enemy is near when an ant of the rival colony is close. stance is what the colony as a whole is doing: forage, defend or raid. doctrine is how the colony wants its ants to behave: follow it.";

export const HOOK_LANES: Record<Hook, HookLane> = {
  onFood: {
    fields: ["mode", "atNest", "alarm", "enemy", "stance"],
    legend: `${VIEW_LEGEND} Each ant is standing on food and carrying nothing.`,
    question: (id) => `Going by the doctrine, should ant \`${id}\` pick up the food it is standing on?`,
    criteria: { take: "take: pick it up", ignore: "ignore: leave it and carry on" },
  },
  onCarry: {
    fields: ["carrying", "alarm", "enemy", "stance"],
    legend: `${VIEW_LEGEND} Each ant has just picked something up.`,
    question: (id) => `Going by the doctrine, what should ant \`${id}\` do with what it just picked up?`,
    criteria: { explore: "explore: keep wandering with it", follow: "follow: walk up the food scent", return: "return: carry it home", fight: "fight: go for enemies" },
  },
  atSite: {
    fields: ["carrying", "atNest", "stance"],
    legend: `${VIEW_LEGEND} Each ant is carrying something and has reached a place where it could put it down.`,
    question: (id) => `Going by the doctrine, should ant \`${id}\` put down what it carries here?`,
    criteria: { drop: "drop: put it down here", keep: "keep: hold on to it" },
  },
  mark: {
    fields: ["mode", "carrying", "atNest"],
    legend: `${VIEW_LEGEND} Ants mark the ground as they walk: food scent leads others to food, home scent leads home.`,
    question: (id) => `Going by the doctrine, which scent should ant \`${id}\` lay as it walks?`,
    criteria: { food: "food: food scent, leading to where it found food", home: "home: home scent, leading back to the nest", none: "none: lay nothing" },
  },
  onContact: {
    fields: ["mode", "carrying", "alarm", "stance"],
    legend: `${VIEW_LEGEND} Each ant has enemy ants right next to it.`,
    question: (id) => `Going by the doctrine, what should ant \`${id}\` do about the enemies next to it?`,
    criteria: { fight: "fight: stand and fight", flee: "flee: turn for home", drop: "drop: drop what it carries and run" },
  },
  raiseAlarm: {
    fields: ["mode", "carrying", "stance"],
    legend: `${VIEW_LEGEND} Each ant is in a fight. Alarm scent calls fighters to it and warns foragers away.`,
    question: (id) => `Going by the doctrine, how much alarm scent should ant \`${id}\` lay?`,
    criteria: { none: "none: fight quietly", normal: "normal: call for help", strong: "strong: call loudly" },
  },
  alarmGain: {
    fields: ["mode", "carrying", "atNest", "alarm", "stance"],
    legend: `${VIEW_LEGEND} Each ant smells alarm scent ahead.`,
    question: (id) => `Going by the doctrine, how should ant \`${id}\` respond to the alarm scent?`,
    criteria: { flee: "flee: steer away from it", ignore: "ignore: carry on", approach: "approach: walk toward it" },
  },
};

/** The answers each hook's lane may give, mapped to what the hook returns. */
const HOOK_ANSWERS: Record<Hook, readonly string[]> = {
  onFood: ["take", "ignore"],
  onCarry: MODES,
  atSite: ["drop", "keep"],
  mark: MARKS,
  onContact: CONTACTS,
  raiseAlarm: ALARM_LEVELS,
  alarmGain: ALARM_RESPONSES,
};

/** The cache key for a view, as one hook reads it. */
export function hookKey(hook: Hook, v: AntView): string {
  return HOOK_LANES[hook].fields.map((f) => String(v[f])).join("|");
}

/** The fields of a view one hook reads: what its request carries. */
export function hookState(hook: Hook, v: AntView): Partial<AntView> {
  const out: Record<string, unknown> = {};
  for (const f of HOOK_LANES[hook].fields) out[f] = v[f];
  return out as Partial<AntView>;
}

export function hookQuestion(hook: Hook, id: string): JevRequest["questions"] {
  return { [`${id}_${hook}`]: { type: "choice", instructions: HOOK_LANES[hook].question(id), criteria: HOOK_LANES[hook].criteria } };
}

/** One request for many views of one hook. */
export function packHookRequest(hook: Hook, items: { id: string; situation: AntView }[], doctrine: string): JevRequest {
  const ants: Record<string, Partial<AntView>> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    ants[it.id] = hookState(hook, it.situation);
    Object.assign(questions, hookQuestion(hook, it.id));
  }
  return { state: { legend: HOOK_LANES[hook].legend, doctrine, ants }, questions };
}

/** A hook's answer from a reply, or null when missing or not one of its answers. */
export function readHook(hook: Hook, answers: Record<string, JevAnswer>, id: string): string | null {
  const a = answers[`${id}_${hook}`];
  if (!a || a.type !== "choice") return null;
  return HOOK_ANSWERS[hook].includes(a.choice) ? a.choice : null;
}

export function hookContext(hook: Hook, doctrine: string): string {
  return `${hook}-v${COLONY_BRAIN_VERSION}-${hash(HOOK_LANES[hook].legend + JSON.stringify(hookQuestion(hook, "s0")) + doctrine.trim())}`;
}

/** What one hook's local rule answers for a view, as its lane's answer word (the inverse of `responsesFromAnswers`). */
export function localHookAnswer(hook: Hook, v: AntView, r: Responses = localResponses): string {
  switch (hook) {
    case "onFood":
      return r.onFood(v) ? "take" : "ignore";
    case "atSite":
      return r.atSite(v) ? "drop" : "keep";
    default:
      return r[hook](v) as string;
  }
}

/**
 * Responses that answer from cached lane answers ({ hook: { hookKey: answer } }, as scripts/colony-live.mjs
 * saves them), and from `fallback` for any view not in the cache.
 */
export function responsesFromAnswers(cache: Partial<Record<Hook, Record<string, string>>>, fallback: Responses = localResponses): Responses {
  const r: Responses = { ...fallback };
  for (const hook of HOOKS) {
    const table = cache[hook];
    if (!table) continue;
    const get = (v: AntView) => table[hookKey(hook, v)];
    switch (hook) {
      case "onFood":
        r.onFood = (v) => (get(v) === undefined ? fallback.onFood(v) : get(v) === "take");
        break;
      case "atSite":
        r.atSite = (v) => (get(v) === undefined ? fallback.atSite(v) : get(v) === "drop");
        break;
      default: {
        const f = fallback[hook] as (v: AntView) => string;
        (r as unknown as Record<Hook, (v: AntView) => string>)[hook] = (v) => get(v) ?? f(v);
      }
    }
  }
  return r;
}
