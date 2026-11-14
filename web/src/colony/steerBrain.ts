import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { COLONY_LEGEND } from "./colonyBrain.ts";
import { hash } from "./policyCache.ts";
import {
  NEUTRAL_STEERING,
  SITUATION_SCHEMA,
  STEER_WEIGHTS,
  FINDS,
  type SteerSituation,
  type SteerLevel,
  type Steering,
  type SteerWeight,
} from "./vocab.ts";

// The steer lane, pure (staging, ja-ykmu.3; docs/steering.md, PRD S3): how strongly an ant out exploring or following weighs each
// steering cue, asked per situation under the colony's doctrine. The situation is the mode lane's, with the mode the ant now has
// (explore or follow). One score question per weight asked, three levels each (low, medium, high; the expected level is read,
// rounded); the weights the biology lets a situation set are asked by default (STEER_ASKED), the design ones only when the Lab
// switches them on (ja-ykmu.4), and the weights asked are part of the key, as the fungus's levers are.

/** Bump when the legend, the questions or what an answer means changes: old cached answers no longer apply. */
export const STEER_BRAIN_VERSION = 4;

/** The weights asked unless the Lab adds design ones: the two the biology lets a situation set (docs/steering.md §3, §7). */
export const STEER_ASKED: readonly SteerWeight[] = ["search", "memory"];

/** What each weight is, and its low and high levels (medium is how the ant steers without a weight). */
export const STEER_MEANINGS: Record<SteerWeight, string> = {
  search:
    "search is how it searches: low, tight (turning often, close round where it is, as round a spot where food was found); high, wide (ranging far, turning little)",
  memory:
    "memory is the way to where it last found food (it keeps it for a trip): low, ignore it; high, set out for that spot and keep to it, even over a food scent that leads elsewhere",
  trail: "trail is how strongly it follows a food scent: low, ignore it; high, hold to it hard",
  home: "home is the colony's home scent on the ground: low, keep away from it (out to new ground); high, keep near it",
  vector: "vector is its own sense of where home is: low, head away from home; high, keep close to home (a leash)",
  nestmates: "nestmates are the ants of its colony its antennae touch: low, spread away from them; high, gather with them",
};

export const STEER_LEGEND =
  COLONY_LEGEND +
  " Each ant here has just set out to explore or to follow (its mode). find is where it is relative to where it last found food, by its own memory of the way there: near (at that spot) or far (elsewhere, or it has found none). Set how strongly it weighs each cue as it steers, for each weight asked: low, medium or high. Real foragers search tightly where they found food and range straighter elsewhere, and after one visit they head back to a find they remember rather than follow a trail to another. " +
  STEER_WEIGHTS.map((w) => STEER_MEANINGS[w]).join(". ") +
  ".";

/** A weight's three levels as a score question lists them, lowest first. */
export const STEER_SCALE = ["low", "medium", "high"] as const;

/** The questions for ant `id`: a score per weight asked. */
export function steerQuestion(id: string, asked: readonly SteerWeight[] = STEER_ASKED): JevRequest["questions"] {
  const out: JevRequest["questions"] = {};
  for (const w of asked) out[`${id}_${w}`] = { type: "score", instructions: `${w} for ant \`${id}\``, criteria: [...STEER_SCALE] };
  return out;
}

/** Whether the steer lane asks about a situation: only an ant out exploring or following steers by weights. */
export function steerAsks(s: SteerSituation): boolean {
  return s.mode === "explore" || s.mode === "follow";
}

/** The cache key: the mode lane's situation key, where it is relative to its last find, then the weights asked. */
export function steerKey(s: SteerSituation, asked: readonly SteerWeight[] = STEER_ASKED): string {
  return `${SITUATION_SCHEMA.key(s)}|${s.find}|${asked.join(",")}`;
}

/** The weights a key asked about. */
export function askedOf(key: string): SteerWeight[] {
  const tail = key.slice(key.lastIndexOf("|") + 1);
  return tail ? (tail.split(",") as SteerWeight[]) : [];
}

/** One request for many ants' situations: one shared state (legend, doctrine, ants), a score per weight for each. */
export function packSteerRequest(items: { id: string; key: string; situation: SteerSituation }[], doctrine: string): JevRequest {
  const ants: Record<string, object> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    ants[it.id] = { ...SITUATION_SCHEMA.state(it.situation), find: it.situation.find };
    Object.assign(questions, steerQuestion(it.id, askedOf(it.key)));
  }
  return { state: { legend: STEER_LEGEND, doctrine, ants }, questions };
}

/**
 * An answer as the cache keeps it: for each asked weight, in the key's order, Jev's probabilities of low, usual and high
 * (`0.34/0.59/0.07`), comma-joined. A score's expected level, rounded, lost every lean: Jev answered near a find search 0.70–0.88 and
 * memory 1.06–1.25, all "usual" once rounded (PRD S3). Each ant draws its level from them. With no probabilities, the rounded score, certain.
 */
export function readSteer(answers: Record<string, JevAnswer>, id: string, asked: readonly SteerWeight[]): string | null {
  const parts: string[] = [];
  for (const w of asked) {
    const a = answers[`${id}_${w}`];
    if (!a || a.type !== "score" || !Number.isFinite(a.score)) return null;
    const p = [0, 1, 2].map((k) => a.probabilities?.[String(k)] ?? NaN);
    const total = p.reduce((x, y) => x + y, 0);
    if (p.every((x) => Number.isFinite(x) && x >= 0) && total > 0) parts.push(p.map((x) => Number((x / total).toFixed(3))).join("/"));
    else parts.push(["1/0/0", "0/1/0", "0/0/1"][Math.max(0, Math.min(2, Math.round(a.score)))] as string);
  }
  return parts.join(",");
}

/** Each asked weight's probabilities of low, usual and high in an answer, or null when it does not parse. */
export function steerOdds(answer: string): number[][] | null {
  const out: number[][] = [];
  for (const part of answer.split(",")) {
    const p = part.split("/").map(Number);
    if (p.length !== 3 || !p.every((x) => Number.isFinite(x) && x >= 0 && x <= 1)) return null;
    out.push(p);
  }
  return out;
}

/** Whether a stored answer is one the questions under `key` could have given. */
export function validSteer(key: string, answer: string): boolean {
  return steerOdds(answer)?.length === askedOf(key).length;
}

/**
 * The steering an answer gives: each asked weight's level drawn from its probabilities with `draw` (once a weight), or with no draw
 * its likeliest level; every other weight neutral. A certain answer (a level at 1) never draws.
 */
export function steeringOf(key: string, answer: string, draw?: () => number): Steering {
  const out: Record<string, SteerLevel> = { ...NEUTRAL_STEERING };
  const odds = steerOdds(answer) ?? [];
  askedOf(key).forEach((w, k) => {
    const p = odds[k] ?? [0, 1, 0];
    let level = p.indexOf(Math.max(...p));
    if (draw && !p.includes(1)) {
      let u = draw() * p.reduce((x, y) => x + y, 0);
      level = 2;
      for (let j = 0; j < 3; j++)
        if ((u -= p[j] as number) < 0) {
          level = j;
          break;
        }
    }
    out[w] = (level - 1) as SteerLevel;
  });
  return out as Steering;
}

/** The local rule's answer for a key: every asked weight usual, for certain. */
export function localSteerAnswer(key: string): string {
  return askedOf(key)
    .map(() => "0/1/0")
    .join(",");
}

/** What a cached answer was asked under: the legend, every weight's question, the doctrine. */
export function steerContext(doctrine: string): string {
  return `steer-v${STEER_BRAIN_VERSION}-${hash(STEER_LEGEND + JSON.stringify(steerQuestion("w0", STEER_WEIGHTS)) + "\u0000" + doctrine.trim())}`;
}

/** Every situation the lane can be asked in: the mode lane's with the mode explore or follow, far from and near its last find. */
export function steerSituations(): SteerSituation[] {
  const out: SteerSituation[] = [];
  for (let c = 0; c < SITUATION_SCHEMA.size; c++) {
    const s = SITUATION_SCHEMA.decode(c);
    if (s.mode === "explore" || s.mode === "follow") for (const find of FINDS) out.push({ ...s, find });
  }
  return out;
}
