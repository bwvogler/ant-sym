import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { hash } from "./policyCache.ts";
import { MODES, STANCES, type Mode, type Situation, type Stance, type StanceSituation } from "./colony.ts";
import { CARRY, type Carry, CONTACT, type Contact, LEAVE, type Leave, localResponses, responses, touchKey, type Responses, type Touch, type Trail } from "./responses.ts";

// The colony's Jev brain, pure. Two choices go to Jev, both as packed
// requests with one question per *situation* (never per ant or per tick):
//   mode   — what an ant in this situation should do (explore, follow,
//            return, fight); SITUATIONS of them
//   stance — what the colony as a whole should do (forage, defend, raid),
//            from a coarse view of itself, asked by the strategist
// The colony's doctrine — the player's words for how the colony should
// behave — rides in the shared state, so a new doctrine is a new question
// and cached answers are kept per doctrine (`policyContext`, `stanceContext`).
// The ant's small responses (responses.ts: get, carry, drop, trail) each have
// a lane too: one question per response situation (`Touch`), under the same
// doctrine (`packResponseRequest`, `responseContext`). They are not asked by
// the page yet: scripts/colony-live.mjs asks them, colony-cost estimates them.

/** Bump when the situation fields or their meaning change: old cached answers no longer apply. */
export const COLONY_BRAIN_VERSION = 5;
/** The strategist's: its view didn't change with the nest (slice 3), so its cached stances keep (it shared the ants' version before). */
export const STANCE_BRAIN_VERSION = 4;

export const COLONY_LEGEND =
  "Each key in `ants` is the situation of one worker ant of a colony. mode is what the ant is doing now: explore (wander looking for new food, marking the way home, digging tunnels through soil), follow (walk up a food scent toward food), return (walk home) or fight (go for enemy ants, or follow the colony's alarm scent to a fight, or raid the enemy nest). tired means it has searched outside a long time without finding food; only staying inside the nest a while rests it. Going home when tired is how the colony stops searching where food has run out and stops following trails to food that is gone. return means walk home: an ant already inside the nest and not tired has finished its trip, and the colony needs it out searching again. foodTrail and alarm say how strong each scent is just ahead of the ant: none, faint or strong. Food scent is laid by ants carrying food home, so it leads to food; alarm scent is laid by ants in a fight, or by the fungus, and marks danger. homeTrail, on the ground, is how strong the home scent ahead is (none, faint or strong; it leads home); inside the nest it says where the ant is: in a tunnel, or in one of the nest's chambers by what the chamber is for (royal: the queen's; brood; store: food kept; reception: where food comes in; midden: refuse). An ant inside the nest is home. enemy is near when an ant of the rival colony is within two steps. stance is what the colony as a whole is doing: forage, defend or raid. An ant carrying something is not asked here: it answers a separate question about its load. doctrine is how the colony wants its ants to behave: follow it.";

export const STRATEGY_LEGEND =
  "`colony` describes an ant colony at war with a rival colony over the same food. stance is what it is doing now: forage (gather food), defend (fight near home) or raid (send fighters to the rival's nest). ants is how many ants it has against how many it can feed: few, some or many. losses is how many ants it lost lately: none, some or heavy. enemyNearNest says whether rival ants are close to home. intake is how much food its foragers have brought home lately for its size: none, some or plenty (the colony never knows how much food is left out there, only how fast it comes in). larder is food stored at home beyond what new ants need: low or full. doctrine is how the colony wants to behave: follow it.";

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

export const MODE_CRITERIA: Record<Mode, string> = {
  explore: "explore: wander and look for new food, digging through soil",
  follow: "follow: walk up the food scent toward food",
  return: "return: walk home",
  fight: "fight: go for enemy ants, follow alarm scent to a fight, or raid the rival nest",
};

export const STANCE_CRITERIA: Record<Stance, string> = {
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
  return `${s.stance}|${s.ants}|${s.losses}|${s.enemyNearNest ? "enemy" : "clear"}|intake:${s.intake}|${s.larder}`;
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
  return `stance-v${STANCE_BRAIN_VERSION}-${hash(STRATEGY_LEGEND + JSON.stringify(stanceQuestion("c0")) + doctrine.trim())}`;
}

/** Bump when the response situation (Touch), its legend or a response question changes: old cached responses no longer apply. */
export const RESPONSE_BRAIN_VERSION = 9;

export const RESPONSE_LEGEND =
  "Each key in `ants` is the situation of one worker ant of a colony at a moment it must respond. mode is what it is doing: explore, follow (a food scent), return (home) or fight. carrying is what it holds: none, food, soil (a pellet it dug), corpse (a dead nestmate for the midden) or brood (an egg, larva or pupa it is nursing). porter says it is carrying food between chambers inside the nest, not home from outside: that food is already home, and a food trail laid inside the nest leads nestmates in, away from the food outside. digging says it is digging at a soil face. place is where it is: out (away from its nest), hole (at its nest's mouth), tunnel (in its own nest's tunnels) or chamber (in one of its own nest's chambers). offered, when it may pick something up, is what lies within reach: food; soil (a loose pellet off the mound: carried down to fill unused tunnels, or farther out, it keeps the mound spread and the nest's entrance clear); corpse (a dead nestmate: on the midden it can't spread disease in the nest); or brood (an egg by the queen, or a larva lying outside the brood chambers: larvae are fed only in a brood chamber, so brood left lying never becomes a worker). enemy says whether ants of another colony are within the colony's enemy range, a few steps. stance is what the colony as a whole is doing: forage, defend or raid. quality, for food carried or offered, is how good it tastes: poor, fair or rich. The colony finds food and its way home only by scent trails: ants carrying food home lay the food trail that leads others out to it (more for richer food), and ants walking out lay the home trail that leads carriers back; where nobody lays, nobody can follow. alarm is the alarm scent it smells: none, faint (a little: something is happening near) or strong (a fight close by). odds, when strangers are within reach, is how many nestmates are round it against them: outnumbered, even or outnumbering. Strangers in reach hurt any ant they touch, fighting or not, and an ant that fights where its side is outnumbered dies; one that turns away and leaves lives to forage. returns, for an ant waiting at home, is how many nestmates bringing food home it has met lately: none, few or many. The colony learns that there is food to be had only by meeting nestmates bringing it in: even a few coming back means there is food out there to fetch, and many that it is plentiful, so more ants are needed out; when none do, an ant that goes out is a scout searching alone, and most should wait inside. When the colony defends, it needs its ants out whatever comes back. When it raids, its fighters go out on a raid trail: raid is the scent a scout laid on its way home from strangers it found (none, faint or strong). With a trail under it a raiding ant goes now, whatever the doctrine's caution: the trail is the call to go. With none, no one yet knows where the rival is, and most should wait inside while the scouts search. doctrine is how the colony wants its ants to behave: follow it.";

export const RESPONSE_HOOKS = ["get", "carry", "drop", "trail", "contact", "leave"] as const;
export type ResponseHook = (typeof RESPONSE_HOOKS)[number];

export function responseQuestion(hook: ResponseHook, id: string): JevRequest["questions"] {
  const ant = `ant \`${id}\``;
  switch (hook) {
    case "get":
      return { [`${id}_get`]: { type: "noul", instructions: `Going by the doctrine, ${ant} has empty jaws and the thing named by offered within reach: should it pick it up?` } };
    case "drop":
      return { [`${id}_drop`]: { type: "noul", instructions: `Going by the doctrine, ${ant} is carrying food where it can put it down (its nest, or the chamber the food goes to): should it put it down here?` } };
    case "carry":
      return {
        [`${id}_carry`]: {
          type: "choice",
          instructions: `Going by the doctrine, ${ant} is carrying what carrying says: what should it do with it?`,
          criteria: {
            take: "take: carry it where it belongs (food home into the nest, for the colony's larvae and stores; a porter's food to the chamber that wants it; soil out to the mound; a corpse to the midden; brood to a brood chamber)",
            "put down": "put down: put it down here, where it stands, and do something else",
          },
        },
      };
    case "contact":
      return {
        [`${id}_contact`]: {
          type: "choice",
          instructions: `Going by the doctrine, ${ant} has strangers of another colony within reach (odds says how many nestmates are round it against them): what should it do?`,
          criteria: {
            fight: "fight: attack the strangers where they are",
            flee: "flee: turn away from them and go home, keeping whatever it carries",
            "drop and run": "drop and run: put down what it carries here and flee home",
          },
        },
      };
    case "leave":
      return {
        [`${id}_leave`]: {
          type: "choice",
          instructions: `Going by the doctrine, ${ant} is rested and waiting at home with empty jaws (returns says how many nestmates bringing food it has met lately; raid, the trail a scout laid home from the rival, if one is under it): when should it go out?`,
          criteria: {
            now: "now: go out at once",
            soon: "soon: go out in a few seconds",
            wait: "wait: stay inside; only now and then does a waiting ant go out to scout",
          },
        },
      };
    case "trail":
      return {
        [`${id}_trail`]: {
          type: "choice",
          instructions: `Going by the doctrine, which scent should ${ant} lay as it walks?`,
          criteria: {
            food: "food: mark the way to food, so nestmates can follow it out (it is carrying food home)",
            home: "home: mark the way home, so carriers can find the nest (it is walking out)",
            none: "none: lay nothing (a porter's food is already home; soil and corpses lead nowhere worth following)",
          },
        },
      };
  }
}

/** One request for many response situations of one hook. */
export function packResponseRequest(hook: ResponseHook, items: { id: string; situation: Touch }[], doctrine: string): JevRequest {
  const ants: Record<string, Partial<Touch>> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    const t = it.situation;
    // offered only means something to `get`, and quality to `get` and `trail`; the other lanes don't pay for them.
    // alarm and odds only to `contact`; returns only to `leave`.
    const { offered, quality, alarm, odds, returns, raid, ...rest } = t;
    ants[it.id] = hook === "get" ? { ...rest, offered, quality } : hook === "trail" ? { ...rest, quality } : hook === "contact" ? { ...rest, alarm, odds } : hook === "leave" ? { ...rest, returns, raid } : { ...rest };
    Object.assign(questions, responseQuestion(hook, it.id));
  }
  return { state: { legend: RESPONSE_LEGEND, doctrine, ants }, questions };
}

/** What a cached response was asked under (hook, legend, wording, doctrine). */
export function responseContext(hook: ResponseHook, doctrine: string): string {
  return `${hook}-v${RESPONSE_BRAIN_VERSION}-${hash(RESPONSE_LEGEND + JSON.stringify(responseQuestion(hook, "s0")) + doctrine.trim())}`;
}

/**
 * Every lane's cache context under one doctrine: what a saved cache of Jev's answers was asked under (legend,
 * question wording, version, doctrine). A replay refuses a cache whose contexts differ from the code's.
 */
export function cacheContexts(doctrine: string): Record<"mode" | "stance" | ResponseHook, string> {
  return { mode: policyContext(doctrine), stance: stanceContext(doctrine), ...(Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, responseContext(h, doctrine)])) as Record<ResponseHook, string>) };
}

/** What a response hook answers: the same type as the hook in responses.ts. */
export type ResponseAnswer = boolean | Carry | Trail | Contact | Leave;
const TRAILS_LAID: readonly string[] = ["food", "home", "none"];

/**
 * A response from a reply, or null when it is missing or not one of the hook's answers (the local response covers
 * it). `get` and `drop` are nouls: yes strictly above ½, so exactly 0.5 is no.
 */
export function readResponse(hook: ResponseHook, answers: Record<string, JevAnswer>, id: string): ResponseAnswer | null {
  const a = answers[`${id}_${hook}`];
  if (!a) return null;
  if (hook === "get" || hook === "drop") return a.type === "noul" && Number.isFinite(a.noul) ? a.noul > 0.5 : null;
  if (a.type !== "choice") return null;
  if (hook === "carry") return (CARRY as readonly string[]).includes(a.choice) ? (a.choice as Carry) : null;
  if (hook === "contact") return (CONTACT as readonly string[]).includes(a.choice) ? (a.choice as Contact) : null;
  if (hook === "leave") return (LEAVE as readonly string[]).includes(a.choice) ? (a.choice as Leave) : null;
  return TRAILS_LAID.includes(a.choice) ? (a.choice as Trail) : null;
}

/**
 * A response situation's cache key for a hook: touchKey, for `contact` the alarm and odds it is sent too, and for `leave`
 * the returns (the other lanes aren't sent them, so they don't key on them: review of #38).
 */
export function responseKey(hook: ResponseHook, t: Touch): string {
  return hook === "contact" ? `${touchKey(t)}|alarm:${t.alarm}|odds:${t.odds}` : hook === "leave" ? `${touchKey(t)}|returns:${t.returns}|raid:${t.raid}` : touchKey(t);
}

/** Cached response answers per hook, keyed by responseKey: what scripts/colony-live.mjs saves and the experiments replay. */
export type ResponseCache = Partial<Record<ResponseHook, Record<string, ResponseAnswer>>>;

/**
 * Responses that answer from a cache, and from `base` for any situation (or hook) the cache lacks. `onLookup`, if
 * given, hears every lookup (hook, and whether the cache had it): the replay's hit rate.
 */
export function responsesFromAnswers(cache: ResponseCache, base: Responses = localResponses, onLookup?: (hook: ResponseHook, hit: boolean) => void): Responses {
  const over: Partial<Responses> = {};
  for (const hook of RESPONSE_HOOKS) {
    const table = cache[hook];
    if (!table) continue;
    const local = base[hook] as (t: Touch) => ResponseAnswer;
    (over as Record<ResponseHook, (t: Touch) => ResponseAnswer>)[hook] = (t) => {
      const a = table[responseKey(hook, t)];
      onLookup?.(hook, a !== undefined);
      return a ?? local(t);
    };
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
