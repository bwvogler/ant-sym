import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { COLONY_LEGEND } from "./colonyBrain.ts";
import { hash } from "./policyCache.ts";
import {
  NEUTRAL_STEERING,
  SITUATION_SCHEMA,
  STEER_WEIGHTS,
  type Situation,
  type SteerLevel,
  type Steering,
  type SteerWeight,
} from "./vocab.ts";

// The steer lane, pure (staging, ja-ykmu.3; docs/steering.md, PRD S3): how strongly an ant out exploring or following weighs each
// steering cue, asked per situation under the colony's doctrine. The situation is the mode lane's, with the mode the ant now has
// (explore or follow). One score question per weight asked, three levels each (low, usual, high; the expected level is read,
// rounded); the weights the biology lets a situation set are asked by default (STEER_ASKED), the design ones only when the Lab
// switches them on (ja-ykmu.4), and the weights asked are part of the key, as the fungus's levers are.

/** Bump when the legend, the questions or what an answer means changes: old cached answers no longer apply. */
export const STEER_BRAIN_VERSION = 1;

/** The weights asked unless the Lab adds design ones: the two the biology lets a situation set (docs/steering.md §3, §7). */
export const STEER_ASKED: readonly SteerWeight[] = ["search", "memory"];

/** What each weight is, and its low and high levels (usual is how the ant steers without a weight). */
export const STEER_MEANINGS: Record<SteerWeight, string> = {
  search:
    "search is how it searches: low, tight (turning often, close round where it is, as round a spot where food was found); high, wide (ranging far, turning little)",
  memory:
    "memory is where it last found food (it keeps the way to it for a trip): low, ignore it; high, go back there, ahead of any food scent it smells",
  trail: "trail is how strongly it follows a food scent: low, ignore it; high, hold to it hard",
  home: "home is the colony's home scent on the ground: low, keep away from it (out to new ground); high, keep near it",
  vector: "vector is its own sense of where home is: low, head away from home; high, keep close to home (a leash)",
  nestmates: "nestmates are the ants of its colony its antennae touch: low, spread away from them; high, gather with them",
};

export const STEER_LEGEND =
  COLONY_LEGEND +
  " Each ant here has just set out to explore or to follow (its mode). Set how strongly it weighs each cue as it steers, for each weight asked: low, usual (as an ant of this kind usually does) or high. " +
  STEER_WEIGHTS.map((w) => STEER_MEANINGS[w]).join(". ") +
  ".";

/** A weight's three levels as a score question lists them, lowest first. */
export const STEER_SCALE = ["low", "usual", "high"] as const;

/** The questions for ant `id`: a score per weight asked. */
export function steerQuestion(id: string, asked: readonly SteerWeight[] = STEER_ASKED): JevRequest["questions"] {
  const out: JevRequest["questions"] = {};
  for (const w of asked) out[`${id}_${w}`] = { type: "score", instructions: `${w} for ant \`${id}\``, criteria: [...STEER_SCALE] };
  return out;
}

/** Whether the steer lane asks about a situation: only an ant out exploring or following steers by weights. */
export function steerAsks(s: Situation): boolean {
  return s.mode === "explore" || s.mode === "follow";
}

/** The cache key: the mode lane's situation key, then the weights asked. */
export function steerKey(s: Situation, asked: readonly SteerWeight[] = STEER_ASKED): string {
  return `${SITUATION_SCHEMA.key(s)}|${asked.join(",")}`;
}

/** The weights a key asked about. */
export function askedOf(key: string): SteerWeight[] {
  const tail = key.slice(key.lastIndexOf("|") + 1);
  return tail ? (tail.split(",") as SteerWeight[]) : [];
}

/** One request for many ants' situations: one shared state (legend, doctrine, ants), a score per weight for each. */
export function packSteerRequest(items: { id: string; key: string; situation: Situation }[], doctrine: string): JevRequest {
  const ants: Record<string, Situation> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    ants[it.id] = SITUATION_SCHEMA.state(it.situation);
    Object.assign(questions, steerQuestion(it.id, askedOf(it.key)));
  }
  return { state: { legend: STEER_LEGEND, doctrine, ants }, questions };
}

/** An answer as the cache keeps it: each asked weight's level (−1, 0, 1), in the key's order, comma-joined. */
export function readSteer(answers: Record<string, JevAnswer>, id: string, asked: readonly SteerWeight[]): string | null {
  const levels: number[] = [];
  for (const w of asked) {
    const a = answers[`${id}_${w}`];
    if (!a || a.type !== "score" || !Number.isFinite(a.score)) return null;
    levels.push(Math.max(-1, Math.min(1, Math.round(a.score) - 1)));
  }
  return levels.join(",");
}

/** Whether a stored answer is one the questions under `key` could have given. */
export function validSteer(key: string, answer: string): boolean {
  const n = askedOf(key).length;
  const parts = answer.split(",");
  return parts.length === n && parts.every((p) => p === "-1" || p === "0" || p === "1");
}

/** The steering an answer gives: its asked weights at their levels, every other weight neutral. */
export function steeringOf(key: string, answer: string): Steering {
  const out: Record<string, SteerLevel> = { ...NEUTRAL_STEERING };
  const levels = answer.split(",");
  askedOf(key).forEach((w, k) => (out[w] = Number(levels[k]) as SteerLevel));
  return out as Steering;
}

/** The local rule's answer for a key: every asked weight usual. */
export function localSteerAnswer(key: string): string {
  return askedOf(key)
    .map(() => "0")
    .join(",");
}

/** What a cached answer was asked under: the legend, every weight's question, the doctrine. */
export function steerContext(doctrine: string): string {
  return `steer-v${STEER_BRAIN_VERSION}-${hash(STEER_LEGEND + JSON.stringify(steerQuestion("w0", STEER_WEIGHTS)) + "\u0000" + doctrine.trim())}`;
}

/** Every situation the lane can be asked in: the mode lane's with the mode explore or follow (the decoded situations of its schema). */
export function steerSituations(): Situation[] {
  const out: Situation[] = [];
  for (let c = 0; c < SITUATION_SCHEMA.size; c++) {
    const s = SITUATION_SCHEMA.decode(c);
    if (steerAsks(s)) out.push(s);
  }
  return out;
}
