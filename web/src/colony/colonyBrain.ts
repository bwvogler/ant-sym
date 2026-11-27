import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { hash } from "./policyCache.ts";
import { legendOf } from "./schema.ts";
import { type AntDraw, pickFor, weigh, weightedValid } from "./weighted.ts";
import { type LaneWords, MODES, SITUATION_SCHEMA, type Mode, type Situation, type SpeciesSituation, modeSchema } from "./vocab.ts";
import {
  CARRY,
  type Carry,
  CONTACT,
  type Contact,
  LEAVE,
  type Leave,
  localResponses,
  responses,
  TOUCH_KEY_FIELDS,
  TOUCH_SCHEMA,
  touchKey,
  touchSchemaOf,
  type Responses,
  type Touch,
  type TrailKind,
} from "./responses.ts";

// The colony's Jev brain, pure. The choice that goes to Jev is a packed
// request with one question per *situation* (never per ant or per tick):
//   mode — what an ant in this situation should do (explore, follow,
//          return, fight); SITUATIONS of them
// (Each ant's stance is its own, from what it senses: nobody chooses one for
// the colony, so there is no stance lane.)
// The colony's doctrine — the player's words for how the colony should
// behave — rides in the shared state, so a new doctrine is a new question
// and cached answers are kept per doctrine (`policyContext`).
// The ant's small responses (responses.ts: get, carry, drop, trail) each have
// a lane too: one question per response situation (`Touch`), under the same
// doctrine (`packResponseRequest`, `responseContext`). The game page and
// scripts/colony-live.mjs share those request and cache formats.

/** Bump when the situation fields or their meaning change: old cached answers no longer apply. */
export const COLONY_BRAIN_VERSION = 7;

export const COLONY_LEGEND = legendOf(SITUATION_SCHEMA, {
  intro: "Each key in `ants` is the situation of one worker ant of a colony. ",
  fields: [
    [
      "mode",
      "mode is what the ant is doing now: explore (wander looking for new food, marking the way home, digging tunnels through soil), follow (walk up a food scent toward food), return (walk home) or fight (go for enemy ants, or follow the colony's alarm scent to a fight, or raid the enemy nest). ",
    ],
    [
      "tired",
      "tired means it has searched outside a long time without finding food; only staying inside the nest a while rests it. Going home when tired is how the colony stops searching where food has run out and stops following trails to food that is gone. return means walk home: an ant already inside the nest and not tired has finished its trip, and the colony needs it out searching again. Caution means going home from danger (alarm scent, strangers near), not staying home from food: a rested ant with a food trail ahead and no danger near is a forager the colony needs out. ",
    ],
    [
      "foodTrail",
      "foodTrail and alarm say how strong each scent is just ahead of the ant: none, faint or strong. Food scent is laid by ants carrying food home, so it leads to food; alarm scent is laid by ants in a fight, or by the fungus, and marks danger. ",
    ],
    // alarm is described with foodTrail, above: the two scents are one passage.
    ["alarm", ""],
    [
      "homeTrail",
      "homeTrail, on the ground, is how strong the home scent ahead is (none, faint or strong; it leads home); inside the nest it says where the ant is: in a tunnel, or in one of the nest's chambers by what the chamber is for (royal: the queen's; brood; store: food kept; reception: where food comes in; midden: refuse). An ant inside the nest is home. ",
    ],
    ["enemy", "enemy is near when an ant of the rival colony is within two steps. "],
    [
      "stance",
      "stance, on open ground, is this ant's own: forage, the usual one (gather food); defend, only while it smells alarm or meets strangers close to its own nest; or raid, once a scout's raid trail has recruited it or it has gone out as a raid scout. In an underground nest stance is what the colony asks of it: forage, defend or raid. An ant carrying something is not asked here: it answers a separate question about its load. ",
    ],
  ],
  outro: "doctrine is how the colony wants its ants to behave: follow it.",
});

export interface Doctrine {
  id: string;
  name: string;
  text: string;
}

export const DOCTRINES: Doctrine[] = [
  {
    id: "forage",
    name: "Forage",
    text: "Gather as much food as possible. Follow a strong food scent; explore when there is none; go home when tired. Fight only an enemy that is close. Raid only when food runs out.",
  },
  {
    id: "cautious",
    name: "Cautious",
    text: "Safety first. Any alarm scent means go home, unless the colony is defending. Go home when tired. Otherwise follow food scent, even a faint one. Defend the nest; never raid.",
  },
  {
    id: "warlike",
    name: "Warlike",
    text: "Destroy the rival colony. Explorers become raiders whenever the colony has ants to spare. Follow alarm scent to every fight. Forage only to grow the colony.",
  },
];

export const MODE_CRITERIA: Record<Mode, string> = {
  explore: "explore: wander and look for new food, digging through soil",
  follow: "follow: walk up the food scent toward food",
  return: "return: walk home",
  fight: "fight: go for enemy ants, follow alarm scent to a fight, or raid the rival nest",
};

/** The generic ant's words for the mode lane: what a species that names none asks under (species.ts). */
export const MODE_WORDS: LaneWords<Mode> = { legend: COLONY_LEGEND, criteria: MODE_CRITERIA, version: COLONY_BRAIN_VERSION };

/** The cache key for an ant's situation. */
export function situationKey(s: Situation): string {
  return SITUATION_SCHEMA.key(s);
}

/** What a situation looks like in the request: the same fields, as Jev reads them. */
export function situationState(s: Situation, words?: LaneWords<Mode>): Situation {
  return modeSchema(words).state(s as SpeciesSituation);
}

export function modeQuestion(id: string, criteria: LaneWords<Mode>["criteria"] = MODE_CRITERIA): JevRequest["questions"] {
  return {
    [`${id}_mode`]: {
      type: "choice",
      instructions: `Going by the doctrine, what should ant \`${id}\` do now?`,
      criteria: criteria as Record<string, string>,
    },
  };
}

/** One request for many ant situations: one shared state (legend, doctrine, situations), one choice each. */
export function packModeRequest(
  items: { id: string; situation: Situation }[],
  doctrine: string,
  words: LaneWords<Mode> = MODE_WORDS,
): JevRequest {
  const ants: Record<string, Situation> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    ants[it.id] = situationState(it.situation, words);
    Object.assign(questions, modeQuestion(it.id, words.criteria));
  }
  return { state: { legend: words.legend, doctrine, ants }, questions };
}

/**
 * A situation's mode from a reply, or null when it is missing or not a mode (not cached; the local rule covers it): Jev's
 * choice with its probabilities over the modes `allowed` (weighted.ts, ja-nan3), so an ant can draw its mode.
 */
export function readMode(answers: Record<string, JevAnswer>, id: string, allowed: readonly string[] = MODES): string | null {
  const a = answers[`${id}_mode`];
  if (!a || a.type !== "choice") return null;
  const ok = allowed.filter((m) => (MODES as readonly string[]).includes(m));
  return ok.includes(a.choice) ? weigh(a.choice, a.probabilities, ok) : null;
}

/** What a cached mode was asked under: a different doctrine, legend or question wording is a different cache. */
export function policyContext(doctrine: string, words: LaneWords<Mode> = MODE_WORDS): string {
  return `colony-v${words.version}-${hash(words.legend + JSON.stringify(modeQuestion("s0", words.criteria)) + doctrine.trim())}`;
}

/**
 * Bump when the response situation (Touch), its legend, a response question or how an answer is kept changes: old cached
 * responses no longer apply. 16: carry sees its target and recognised floor role. 15: carry senses delivery effort. 14: carry can choose food destination roles; 13 added peaceful contact.
 */
export const RESPONSE_BRAIN_VERSION = 16;

// Each passage opens with its own field's name (legendOf's rule), so a sentence that leads into the next field rides at the end of the passage
// before it: "The colony finds food…" in quality's, "A raider's cue is a raid trail: " in crowd's. The bytes are pinned (touchSchema.test.ts).
export const RESPONSE_LEGEND = legendOf(TOUCH_SCHEMA, {
  intro: "Each key in `ants` is the situation of one worker ant of a colony at a moment it must respond. ",
  fields: [
    [
      "deliveryTarget",
      "deliveryTarget, sent only to carry, is its current chosen food destination: none, royal, brood, store, or reception. It does not imply that destination exists. ",
    ],
    [
      "deliveryPlace",
      "deliveryPlace, sent only to carry, is the role recognised underfoot: none, royal, brood, store, or reception. Fungal distortion can swap or erase this cue. It reveals no distant rooms. ",
    ],
    [
      "deliveryAttempt",
      "deliveryAttempt, sent only to carry, is effort on a chosen delivery: none (not tracked), brief, or long (the local attempt has lasted a while). Long is not proof that a destination is unreachable. The policy may persist, choose another role, or release the load. ",
    ],
    ["mode", "mode is what it is doing: explore, follow (a food scent), return (home) or fight. "],
    [
      "carrying",
      "carrying is what it holds: none, food, soil (a pellet it dug), corpse (a dead nestmate for the midden) or brood (an egg, larva or pupa it is nursing). ",
    ],
    [
      "porter",
      "porter says it is carrying food between chambers inside the nest, not home from outside: that food is already home, and a food trail laid inside the nest leads nestmates in, away from the food outside. ",
    ],
    ["digging", "digging says it is digging at a soil face. "],
    [
      "place",
      "place is where it is: out (away from its nest), hole (at its nest's mouth), tunnel (in its own nest's tunnels) or chamber (in one of its own nest's chambers). ",
    ],
    [
      "offered",
      "offered, when it may pick something up, is what lies within reach: food; soil (a loose pellet off the mound: carried down to fill unused tunnels, or farther out, it keeps the mound spread and the nest's entrance clear); corpse (a dead nestmate: on the midden it can't spread disease in the nest); or brood (an egg by the queen, or a larva lying outside the brood chambers: larvae are fed only in a brood chamber, so brood left lying never becomes a worker). ",
    ],
    ["enemy", "enemy says whether ants of another colony are within the colony's enemy range, a few steps. "],
    [
      "stance",
      "stance is this ant's own on open ground, and in a nest whose hole opens onto open ground, above and below: forage, the usual one (gather food); defend, only while it smells alarm or meets strangers close to its own nest; or raid, once a scout's raid trail has recruited it or it has gone out as a raid scout. In a nest under a narrow strip of ground stance is what the colony asks of it: forage, defend or raid. ",
    ],
    [
      "quality",
      "quality, for food carried or offered, is how good it tastes: poor, fair or rich. The colony finds food and its way home only by scent trails: ants carrying food home lay the food trail that leads others out to it (more for richer food), and ants walking out lay the home trail that leads carriers back; where nobody lays, nobody can follow. ",
    ],
    ["alarm", "alarm is the alarm scent it smells: none, faint (a little: something is happening near) or strong (a fight close by). "],
    [
      "odds",
      "odds, when strangers are within reach, is how many nestmates are round it against them: outnumbered, even or outnumbering. Strangers in reach hurt any ant they touch, fighting or not, and an ant that fights where its side is outnumbered dies; one that turns away and leaves lives to forage. ",
    ],
    [
      "returns",
      "returns, for an ant waiting at home, is how many nestmates bringing food home it has met lately: none, few or many. The colony learns that there is food to be had only by meeting nestmates bringing it in: even a few coming back means there is food out there to fetch, and many that it is plentiful, so more ants are needed out; when none do, an ant that goes out is a scout searching alone, and most should wait inside. An ant that defends goes out whatever comes back. ",
    ],
    [
      "crowd",
      "crowd, for an ant waiting at home, is how crowded home is: few or many nestmates round it. Returns come first: while food is coming back the colony needs its ants out fetching it, however crowded home is. A crowded home with no food coming back is the one case where the doctrine decides between raiding and waiting: those ants are spare, so a colony whose doctrine raids sends them out as raid scouts to find the rival's nest (raid: a scout that meets strangers lays the raid trail home, and the trail recruits raiders), and one whose doctrine shuns raids keeps them waiting. A raider's cue is a raid trail: ",
    ],
    [
      "raid",
      "raid is the scent a scout laid on its way home from strangers it found (none, faint or strong). Without one, no one yet knows where the rival is, and most raiders should wait inside while the scouts search. ",
    ],
  ],
  outro: "doctrine is how the colony wants its ants to behave: follow it.",
});

export const RESPONSE_HOOKS = ["get", "carry", "drop", "trail", "contact", "leave"] as const;
export type ResponseHook = (typeof RESPONSE_HOOKS)[number];

export function responseQuestion(hook: ResponseHook, id: string, backfill = false, porterDispatch = false): JevRequest["questions"] {
  const ant = `ant \`${id}\``;
  switch (hook) {
    case "get":
      return {
        [`${id}_get`]: {
          type: "noul",
          instructions: porterDispatch
            ? `Going by the doctrine, ${ant} can take one unit of food from this chamber to an eligible store. porterDispatch.candidate says preferred or alternate. inbound describes how many porters are headed to that store relative to its floor: light, busy or saturated. sourcePassage is recent, quiet or unknown at the pickup site. Should the worker take this load for the offered store? If it declines, another eligible store may be offered. If neither is accepted, the food stays in the source chamber.`
            : `Going by the doctrine, ${ant} has empty jaws and the thing named by offered within reach: should it pick it up?`,
        },
      };
    case "drop":
      return {
        [`${id}_drop`]: {
          type: "noul",
          instructions: backfill
            ? `Going by the doctrine, ${ant} can place one soil pellet in an adjacent underground cell. backfillTraffic is recent if it senses a fresh passage mark on that cell, or quiet if it senses none. Quiet is weak evidence of disuse. Should it place the pellet? If no, it keeps carrying.`
            : `Going by the doctrine, ${ant} can put down the load named by carrying: should it put the load down here?`,
        },
      };
    case "carry":
      return {
        [`${id}_carry`]: {
          type: "choice",
          instructions: `Going by the doctrine, ${ant} is carrying what carrying says: what should it do with it?`,
          criteria: {
            take: "take: keep carrying to its selected destination, or where it normally belongs (food home into the nest, for the colony's larvae and stores; a porter's food to the chamber that wants it; soil out to the mound; a corpse to the midden; brood to a brood chamber)",
            "put down": "put down: put it down here, where it stands, and do something else",
            "to reception": "to reception: with food and delivery enabled, seek a reception by local floor cues",
            "to store": "to store: with food and delivery enabled, seek a store by local floor cues",
            "to brood": "to brood: with food and delivery enabled, seek a brood chamber by local floor cues",
            "to royal": "to royal: with food and delivery enabled, seek the royal chamber by local floor cues",
          },
        },
      };
    case "contact":
      return {
        [`${id}_contact`]: {
          type: "choice",
          instructions: `Going by the doctrine, ${ant} has strangers within reach (odds says how many nestmates are round it against them): what should it do?`,
          criteria: {
            fight: "fight: attack the strangers where they are",
            flee: "flee: turn away from them and go home, keeping whatever it carries",
            "drop and run": "drop and run: put down what it carries here and flee home",
            ignore: "ignore: continue its work without attacking, fleeing or releasing its load",
          },
        },
      };
    case "leave":
      return {
        [`${id}_leave`]: {
          type: "choice",
          instructions: `Going by the doctrine, ${ant} is rested and waiting at home with empty jaws, and no stranger is near. If its mode is return it is a forager: returns says how many nestmates bringing food it has met lately, and crowd how crowded home is. If its mode is fight it is a raider: raid is the trail a scout laid home from the rival, if one is under it. When should it go out, and as what?`,
          criteria: {
            now: "now: go out at once",
            soon: "soon: go out in a few seconds",
            wait: "wait: stay inside; only now and then does a waiting ant go out to scout",
            raid: "raid: now and then go out as a raid scout, looking for the rival colony's nest (for a spare ant: home crowded, no food coming back)",
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
    const {
      backfillTraffic,
      porterDispatch,
      offered,
      quality,
      alarm,
      odds,
      returns,
      raid,
      crowd,
      deliveryAttempt,
      deliveryTarget,
      deliveryPlace,
      recentAttack: _recentAttack,
      ...rest
    } = t;
    const backfill = hook === "drop" && backfillTraffic !== undefined;
    ants[it.id] =
      hook === "carry"
        ? { ...rest, deliveryAttempt, deliveryTarget, deliveryPlace }
        : hook === "get"
          ? { ...rest, offered, quality }
          : hook === "trail"
            ? { ...rest, quality }
            : hook === "contact"
              ? { ...rest, alarm, odds }
              : hook === "leave"
                ? t.mode === "fight"
                  ? { ...rest, raid }
                  : { ...rest, returns, crowd }
                : { ...rest };
    if (backfill) ants[it.id]!.backfillTraffic = backfillTraffic;
    const dispatch = hook === "get" && porterDispatch !== undefined;
    if (dispatch) ants[it.id]!.porterDispatch = porterDispatch;
    Object.assign(questions, responseQuestion(hook, it.id, backfill, dispatch));
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
export function cacheContexts(doctrine: string): Record<"mode" | ResponseHook, string> {
  return {
    mode: policyContext(doctrine),
    ...(Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, responseContext(h, doctrine)])) as Record<ResponseHook, string>),
  };
}

/** What a response hook answers: the same type as the hook in responses.ts. */
export type ResponseAnswer = boolean | Carry | TrailKind | Contact | Leave;

/** The answers each response hook's question allows; `get` and `drop` are nouls, kept as "true" and "false". */
export const RESPONSE_OPTIONS: Record<ResponseHook, readonly string[]> = {
  get: ["true", "false"],
  drop: ["true", "false"],
  carry: CARRY,
  contact: CONTACT,
  leave: LEAVE,
  trail: ["food", "home", "none"],
};

/**
 * A response from a reply as the caches keep it, or null when it is missing or not one of the hook's answers (the local
 * response covers it). Kept with Jev's probabilities (weighted.ts, ja-m7rr), as the mode is: a choice as `weigh` keeps it
 * (`fight=0.62,flee=0.38`); a noul (`get`, `drop`) is itself the probability of yes, kept as `true=0.9,false=0.1` with the
 * likelier first (exactly ½ is no, as before), or `true=1` when certain.
 */
export function readResponse(hook: ResponseHook, answers: Record<string, JevAnswer>, id: string): string | null {
  const a = answers[`${id}_${hook}`];
  if (!a) return null;
  if (hook === "get" || hook === "drop") {
    if (a.type !== "noul" || !Number.isFinite(a.noul) || a.noul < 0 || a.noul > 1) return null;
    return weigh(String(a.noul > 0.5), { true: a.noul, false: 1 - a.noul }, RESPONSE_OPTIONS[hook]);
  }
  if (a.type !== "choice") return null;
  return RESPONSE_OPTIONS[hook].includes(a.choice) ? weigh(a.choice, a.probabilities, RESPONSE_OPTIONS[hook]) : null;
}

/** Whether a kept answer is one a hook's question could have given (every option one it allows). */
export function validResponse(hook: ResponseHook, answer: string): boolean {
  return weightedValid(answer, (c) => RESPONSE_OPTIONS[hook].includes(c));
}

/**
 * The response a kept answer gives an ant: drawn with its `draw` under this hook and situation `key` (weighted.ts pickFor), or
 * with no draw Jev's own answer; `get` and `drop` as booleans.
 */
export function responseOf(hook: ResponseHook, key: string, answer: string, draw?: AntDraw): ResponseAnswer {
  const a = pickFor(answer, draw, `${hook}|${key}`);
  return hook === "get" || hook === "drop" ? a === "true" : (a as ResponseAnswer);
}

/**
 * A response situation's cache key for a hook: touchKey, for `contact` the alarm and odds it is sent too, and for `leave`
 * the returns (the other lanes aren't sent them, so they don't key on them: review of #38).
 */
export function responseKey(hook: ResponseHook, t: Touch): string {
  // Version this opt-in question independently. Its cache entries never overlap ordinary drop.
  if (hook === "drop" && t.backfillTraffic !== undefined) return `${touchKey(t)}|backfill-v1:${t.backfillTraffic}`;
  if (hook === "get" && t.porterDispatch) {
    const { candidate, inbound, sourcePassage } = t.porterDispatch;
    return `${touchKey(t)}|porter-v1:${candidate}:${inbound}:${sourcePassage}`;
  }
  return hook === "carry"
    ? CARRY_KEY.key(t)
    : hook === "contact"
      ? CONTACT_KEY.key(t)
      : hook === "leave"
        ? (t.mode === "fight" ? RAIDER_KEY : FORAGER_KEY).key(t)
        : touchKey(t);
}
const CARRY_KEY = touchSchemaOf([...TOUCH_KEY_FIELDS, "deliveryAttempt", "deliveryTarget", "deliveryPlace"]);
const CONTACT_KEY = touchSchemaOf([...TOUCH_KEY_FIELDS, "alarm", "odds"]);
const RAIDER_KEY = touchSchemaOf([...TOUCH_KEY_FIELDS, "raid"]);
const FORAGER_KEY = touchSchemaOf([...TOUCH_KEY_FIELDS, "returns", "crowd"]);

/** Cached response answers per hook, keyed by responseKey (readResponse's form): what scripts/colony-live.mjs saves and the experiments replay. */
export type ResponseCache = Partial<Record<ResponseHook, Record<string, string>>>;

/**
 * Responses that answer from a cache, and from `base` for any situation (or hook) the cache lacks. An answer with Jev's
 * probabilities is drawn from with the ant's draw (responseOf). `onLookup`, if given, hears every lookup (hook, and whether
 * the cache had it): the replay's hit rate.
 */
export function responsesFromAnswers(
  cache: ResponseCache,
  base: Responses = localResponses,
  onLookup?: (hook: ResponseHook, hit: boolean) => void,
): Responses {
  const over: Partial<Responses> = {};
  for (const hook of RESPONSE_HOOKS) {
    const table = cache[hook];
    if (!table) continue;
    const local = base[hook] as (t: Touch, draw?: AntDraw) => ResponseAnswer;
    (over as Record<ResponseHook, (t: Touch, draw?: AntDraw) => ResponseAnswer>)[hook] = (t, draw) => {
      const key = responseKey(hook, t);
      const a = table[key];
      onLookup?.(hook, a !== undefined);
      return a === undefined ? local(t, draw) : responseOf(hook, key, a, draw);
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
