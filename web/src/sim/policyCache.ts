import type { JevAnswer } from "../../shared/jev.ts";
import type { AntState } from "./jevBrain.ts";

// The situation cache, pure: Jev as a policy compiler rather than a per-step
// controller. An ant's decision depends on a small situation (which
// neighbours want ants, whether its own cell has room, where the far field
// and the overseer point), and most ants at most moments stand in a
// situation some ant has already asked about. So the situation is quantised
// into a key, folded under the 8 symmetries of the square (a wanting cell to
// the north is the same question as one to the east, turned), asked once,
// and every later ant in it reads the cached answer, turned back into its own
// frame. Cost scales with new situations, not with ants × time.

/** Bump when the quantisation or the canonical state changes: old cached answers no longer mean the same thing. */
export const SITUATION_VERSION = 1;

/** A neighbour wants an ant above this deficit (the local rule's bestNeighbour threshold). */
export const WANT = 0.3;
/** A neighbour has too many ants below this deficit (half an ant, as in shouldSettle). */
export const OVER = -0.5;

// Compass names and their unit offsets in screen coordinates (north is −y).
const NAMES = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const VEC: Record<string, [number, number]> = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const nameOf = (dx: number, dy: number): string => NAMES.find((n) => VEC[n]![0] === dx && VEC[n]![1] === dy) as string;

/**
 * One of the 8 symmetries of the square: reflect east↔west first when
 * `flip`, then turn `turns` quarter turns clockwise on screen (E → S).
 */
export interface Transform {
  turns: 0 | 1 | 2 | 3;
  flip: boolean;
}
export const IDENTITY: Transform = { turns: 0, flip: false };
export const TRANSFORMS: Transform[] = [false, true].flatMap((flip) => ([0, 1, 2, 3] as const).map((turns) => ({ turns, flip })));

function apply(t: Transform, dx: number, dy: number): [number, number] {
  let x = t.flip ? -dx : dx;
  let y = dy;
  for (let k = 0; k < t.turns; k++) [x, y] = [-y, x];
  return [x + 0, y + 0]; // + 0 turns −0 into 0
}

/** The transform that undoes t: a pure turn turns back; a flip followed by a turn is a reflection, its own inverse. */
export function inverse(t: Transform): Transform {
  return t.flip ? t : { turns: ((4 - t.turns) % 4) as Transform["turns"], flip: false };
}

/** A compass name under t; "stay" and anything that is not a compass point pass through. */
export function turnName(name: string, t: Transform): string {
  const v = VEC[name];
  if (!v) return name;
  const [x, y] = apply(t, v[0], v[1]);
  return nameOf(x, y);
}

/** The 3×3 neighbourhood (row-major NW..SE) under t: the value at offset p moves to offset t(p). */
export function turnCells<T>(cells: readonly T[], t: Transform): T[] {
  const out = new Array<T>(9);
  for (let k = 0; k < 9; k++) {
    const [x, y] = apply(t, (k % 3) - 1, Math.floor(k / 3) - 1);
    out[(y + 1) * 3 + (x + 1)] = cells[k] as T;
  }
  return out;
}

/**
 * What the cache keys on. Per neighbour: w (wants ants), o (too many), n
 * (neither); the centre is the ant's own room, r (may stay) or x (must
 * move). Then the far-field and overseer directions, "-" for none, kept only
 * when the ant has no room and no neighbour wants it: the legend tells Jev
 * to use them only then, and keeping them everywhere doubled the situations
 * a formation asks about (scripts/situations.mjs). Crowd, idle time, own
 * heading and neighbours' headings are left out: they made every ant's state
 * unique, and the bake-off's steering came from the deficit and the hints.
 */
export interface Situation {
  cells: string[];
  far: string | null;
  attractor: string | null;
}

export function quantise(s: AntState): Situation {
  const cells = s.deficit3x3.map((v, k) => (k === 4 ? (s.room >= 0 ? "r" : "x") : v > WANT ? "w" : v < OVER ? "o" : "n"));
  const hinted = !cells.includes("w") && cells[4] === "x";
  return { cells, far: hinted ? s.far : null, attractor: hinted ? s.attractor : null };
}

function keyOf(s: Situation): string {
  return `${s.cells.join("")}|${s.far ?? "-"}|${s.attractor ?? "-"}`;
}

function turnSituation(s: Situation, t: Transform): Situation {
  return { cells: turnCells(s.cells, t), far: s.far === null ? null : turnName(s.far, t), attractor: s.attractor === null ? null : turnName(s.attractor, t) };
}

/**
 * The canonical key for an ant's situation and the transform that took the
 * ant's frame to it: of the 8 turned and mirrored versions, the one whose key
 * sorts first. Jev answers in the canonical frame; `inverse(transform)` turns
 * the answer back.
 */
export function situationKey(s: AntState): { key: string; transform: Transform } {
  const q = quantise(s);
  let best = "";
  let bestT = IDENTITY;
  for (const t of TRANSFORMS) {
    const k = keyOf(turnSituation(q, t));
    if (best === "" || k < best) {
      best = k;
      bestT = t;
    }
  }
  return { key: best, transform: bestT };
}

const CELL_VALUE: Record<string, number> = { w: 1, n: 0, o: -1, r: 0, x: -1 };

/** What is sent to Jev for a key: the same structured object an ant would send, with each class at a representative value. */
export interface SituationState {
  deficit3x3: number[];
  room: number;
  far: string | null;
  attractor: string | null;
}

export function canonicalState(key: string): SituationState {
  const [cells = "", far = "-", attractor = "-"] = key.split("|");
  const values = [...cells].map((c) => CELL_VALUE[c] ?? 0);
  return { deficit3x3: values, room: cells[4] === "r" ? 0 : -1, far: far === "-" ? null : far, attractor: attractor === "-" ? null : attractor };
}

/** Jev's answer for one situation, in the canonical frame. */
export interface CachedAnswer {
  choice: string;
  confidence: number | null;
  probabilities: Record<string, number>;
  pSettle: number;
}

/** A situation's dir + settle answers from a reply, or null when they are missing or malformed (not cached). */
export function readSituation(answers: Record<string, JevAnswer>, id: string): CachedAnswer | null {
  const dir = answers[`${id}_dir`];
  const settle = answers[`${id}_settle`];
  if (!dir || dir.type !== "choice" || !settle || settle.type !== "noul") return null;
  if (!(dir.choice in VEC) && dir.choice !== "stay") return null;
  if (typeof settle.noul !== "number" || !Number.isFinite(settle.noul)) return null;
  const probabilities = dir.probabilities && Object.keys(dir.probabilities).length > 0 ? dir.probabilities : { [dir.choice]: 1 };
  return { choice: dir.choice, confidence: typeof dir.confidence === "number" ? dir.confidence : null, probabilities, pSettle: settle.noul };
}

/** A cached answer as one ant's own dir + settle answers, turned from the canonical frame back into the ant's. */
export function answersFor(id: string, a: CachedAnswer, transform: Transform): Record<string, JevAnswer> {
  const back = inverse(transform);
  const probabilities: Record<string, number> = {};
  for (const [k, p] of Object.entries(a.probabilities)) probabilities[turnName(k, back)] = p;
  return {
    [`${id}_dir`]: { type: "choice", choice: turnName(a.choice, back), confidence: a.confidence, probabilities },
    [`${id}_settle`]: { type: "noul", noul: a.pSettle },
  };
}

/** FNV-1a, for the context part of the cache key: a changed legend or question text invalidates every answer. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Situation key → Jev's answer, for one policy context (schema, legend, questions). */
export class PolicyCache {
  readonly context: string;
  #map = new Map<string, CachedAnswer>();

  constructor(context: string, entries: [string, CachedAnswer][] = []) {
    this.context = context;
    for (const [k, v] of entries) this.#map.set(k, v);
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: string): CachedAnswer | undefined {
    return this.#map.get(key);
  }

  put(key: string, answer: CachedAnswer): void {
    this.#map.set(key, answer);
  }

  clear(): void {
    this.#map.clear();
  }

  entries(): [string, CachedAnswer][] {
    return [...this.#map.entries()];
  }
}
