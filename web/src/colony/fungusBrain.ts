import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { hash } from "./policyCache.ts";
import { FUNGAL_SCHEMA, type FungalSituation } from "./fungalPolicy.ts";
import { decodeLevels, encodeLevels, LEVERS, scale } from "./levers.ts";

// The fungus's Jev lane, pure (ja-t4d.5; levers, ja-lo8.4). Its own lane, its own cache, its own words: the player's
// aim for the fungus. Never in an ant's request: Jev, as the fungus, sets how hard each of the fungus's levers is
// pulled in a host, from what the fungus senses inside it (docs/fungus-policy.md §11); the host's choices stay with
// its colony's policy. One score question per lever per fungal situation (never per host or per step), only for the
// levers the player's menu has on, so every answer is something the fungus can do.

/** Bump when the fungal situation, the legend or the questions change: old cached answers no longer apply. */
export const FUNGUS_BRAIN_VERSION = 8;

/** Fungal situations to a request: each carries a question per lever (up to 16), so fewer than the ants' 100. */
export const FUNGUS_BATCH = 50;

/**
 * How long the lane lets new situations gather before it sends a part-full request (ms). The legend is most of a small
 * request; hosts play their earlier or default levels meanwhile. Measured with scripts/fungus-cost.mjs (PRD §50.3).
 */
export const FUNGUS_GATHER_MS = 2000;

export const FUNGUS_LEGEND =
  "You are a fungus inside ants of rival colonies. You never decide what an ant does; you set how hard to pull each of your levers in the ant you are in: perception levers change what it senses, emission levers what it gives off. Each key in `hosts` is one ant, as you sense it from inside. arousal: calm, alarmed (smells alarm) or fighting (strangers close). touch: none, nestmate, or foreigner (an ant that smells of another colony). place: outside, tunnel, chamber, or queen (her mark underfoot). task: nurse (young), inside (middle-aged), forager (old), or queen (you are in the colony's queen: only her own levers are asked). carrying: nothing, food or brood. groomed: nestmates are grooming you off it. Answer one level per lever. Scored -2..+2: 0 as is, below damped, above boosted. Scored 0..2: 0 none, 1 some, 2 strong. Scored 0..1: 0 off, 1 on. Levers: " +
  LEVERS.map((v) => `${v.id}: ${v.brief}.`).join(" ") +
  " aim is what you want: follow it.";

/**
 * The cache key for a fungal situation, asked with these levers. Which levers are asked is part of the question, so
 * it is part of the key: switching a lever on asks again, and switching it back off finds the old answers.
 */
export function fungalKey(s: FungalSituation, asked: readonly string[]): string {
  return `${FUNGAL_SCHEMA.key(s)}|${asked.join(",")}`;
}

/** The levers the question under this key asked. */
export function askedIn(key: string): string[] {
  const on = key.slice(key.lastIndexOf("|") + 1);
  return on ? on.split(",") : [];
}

/** One score question per lever asked, for host `id`: the lever's levels, lowest first (levers.scale), are its criteria. */
export function leverQuestions(id: string, asked: readonly string[]): JevRequest["questions"] {
  const out: JevRequest["questions"] = {};
  for (const lever of LEVERS)
    if (asked.includes(lever.id))
      out[`${id}_${lever.id}`] = { type: "score", instructions: `${lever.id} in \`${id}\``, criteria: scale(lever) };
  return out;
}

/** Whether a situation is worth asking: only with at least one lever on. */
export function worthAsking(asked: readonly string[]): boolean {
  return asked.length > 0;
}

/** One request for many fungal situations: one shared state (legend, aim, hosts), a score per lever for each. */
export function packFungusRequest(items: { id: string; situation: FungalSituation; asked: readonly string[] }[], aim: string): JevRequest {
  const hosts: Record<string, FungalSituation> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    hosts[it.id] = { ...it.situation };
    Object.assign(questions, leverQuestions(it.id, it.asked));
  }
  return { state: { legend: FUNGUS_LEGEND, aim, hosts }, questions };
}

/**
 * Jev's levels for host `id` as a cache answer (levers.encodeLevels over the levers asked), or null when any is missing
 * (not cached; the local rule covers it). A score is an expected level: rounded to the nearest, within the lever's range.
 */
export function readLevels(answers: Record<string, JevAnswer>, id: string, asked: readonly string[]): string | null {
  const levels: Record<string, number> = {};
  for (const lid of asked) {
    const lever = LEVERS.find((v) => v.id === lid);
    const a = answers[`${id}_${lid}`];
    if (!lever || !a || a.type !== "score" || !Number.isFinite(a.score)) return null;
    levels[lid] = Math.max(0, Math.min(lever.words.length - 1, Math.round(a.score)));
  }
  return encodeLevels(levels, asked);
}

/** Whether a stored answer is one the question under `key` could have given. */
export function validLevels(key: string, answer: string): boolean {
  return decodeLevels(answer, askedIn(key)) !== null;
}

/**
 * What a cached answer was asked under: a different aim, legend or question wording is a different cache (the levers
 * asked are in each key). So is the view: a chamber in the side view is a nest's disc on a top-down map.
 */
export function fungusContext(aim: string, view: "top" | "side" = "top"): string {
  const words = LEVERS.map((v) => `${v.id}:${v.brief}:${scale(v).join("/")}`).join("\n");
  return `fungus-v${FUNGUS_BRAIN_VERSION}${view === "side" ? "-side" : ""}-${hash(FUNGUS_LEGEND + JSON.stringify(leverQuestions("h0", ["food"])) + words + "\u0000" + aim.trim())}`;
}

/** Aims to start from: the player's words for what the fungus wants. */
export const AIMS: { id: string; name: string; text: string }[] = [
  { id: "unite", name: "Unite", text: "Make the two colonies one: bring them to smell alike, and stop them fighting. Never kill a host." },
  { id: "spread", name: "Spread", text: "Live in as many ants of both colonies as you can, unseen: avoid being groomed off." },
  { id: "peace", name: "Peace", text: "Stop the fighting first: calm every meeting between the colonies. Unite them later." },
];
