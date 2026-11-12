import { CHUNK } from "../colony/index.ts";

// What the field shows of the fungus beyond its spores (ja-vyu), pure so `node --test` covers it: how strongly a
// colony's trails show, by how far the fungus is into that colony, and the mycelium's threads, grown from its patch
// into the ground as its mass builds. Both are pictures only: no ant senses either.

/** A colony with any host shows its trails at least this strongly; every ant a host, fully. */
export const TRAIL_FLOOR = 0.25;

/**
 * How strongly colony trails show, 0…1, from its census: nothing while no ant carries the fungus, then from TRAIL_FLOOR
 * at the first host up to 1 when every living ant does. You are the fungus: you see the trails your hosts walk.
 */
export function trailSight(infected: number, living: number): number {
  if (infected <= 0 || living <= 0) return 0;
  return TRAIL_FLOOR + (1 - TRAIL_FLOOR) * Math.min(1, infected / living);
}

/** How far the mycelium's threads reach, in cells, at most. */
export const MAX_REACH = 40;

/**
 * How far the threads reach from the patch (cells), from the mycelium's mass on each patch: √-ish, so a fresh landing
 * (mass 4) shows a short fringe, a full thread (30) about 14 cells and a full web (120) about 27.
 */
export function myceliumReach(mass: number, patches: number): number {
  if (patches <= 0 || !(mass > 0)) return 0;
  return Math.min(MAX_REACH, Math.round(2.5 * Math.sqrt(mass / patches)));
}

/** A small integer hash: the threads' wander, the same every frame. */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The threads' cells, by chunk ("cx,cy"): each chunk's cells (row-major, CHUNK²) at 0…1, a thread's strength there. */
export type Threads = Map<string, Float32Array>;

/**
 * The mycelium's threads from origin cells `origins` (x0, y0, x1, y1, …): `trunks` of them (by default one a cell), dealt
 * round the origins in turn, each `reach` cells long. `down`: they grow
 * into the ground below (the side view: down, fanning ±50°); else out every way across it (a top view). A thread walks
 * a cell at a time, its heading wandering by a hash of where it started, and now and then branches; it stops at a cell
 * `stop` says it can't enter. Prefix-stable: a longer reach only extends the same threads, so the web grows, not
 * reshuffles. Strength fades from 1 at the patch to 0.4 at a tip; branches are a little fainter.
 */
export function threads(
  origins: readonly number[],
  reach: number,
  down: boolean,
  stop: (x: number, y: number) => boolean,
  trunks = origins.length >> 1,
): Threads {
  const out: Threads = new Map();
  if (reach <= 0) return out;
  const mark = (x: number, y: number, s: number) => {
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    const key = `${cx},${cy}`;
    let a = out.get(key);
    if (!a) {
      a = new Float32Array(CHUNK * CHUNK);
      out.set(key, a);
    }
    const i = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
    if (s > a[i]!) a[i] = s;
  };
  // A thread from (x, y) heading `ang`, `len` cells, seeded by `seed`; `gen` 0 for a trunk, 1+ for its branches.
  const walk = (x: number, y: number, ang: number, len: number, seed: number, gen: number, from: number) => {
    let fx = x + 0.5;
    let fy = y + 0.5;
    let a = ang;
    for (let j = 0; j < len; j++) {
      a += (hash(seed, j, 1) - 0.5) * 0.6;
      if (down) a = Math.max(Math.PI * 0.22, Math.min(Math.PI * 0.78, a)); // keep heading into the ground
      fx += Math.cos(a);
      fy += Math.sin(a);
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      if (stop(cx, cy)) return;
      const step = from + j + 1;
      mark(cx, cy, (1 - (0.6 * step) / reach) * (gen ? 0.8 : 1));
      if (gen < 2 && j > 1 && hash(seed, j, 2) < 0.08) {
        const side = hash(seed, j, 3) < 0.5 ? -1 : 1;
        walk(cx, cy, a + side * (0.6 + 0.5 * hash(seed, j, 4)), len - j - 1, Math.floor(hash(seed, j, 5) * 1e9), gen + 1, step);
      }
    }
  };
  const n = origins.length >> 1;
  for (let k = 0; k < n; k++) mark(origins[2 * k]!, origins[2 * k + 1]!, 1);
  for (let k = 0; n > 0 && k < trunks; k++) {
    const x = origins[2 * (k % n)]!;
    const y = origins[2 * (k % n) + 1]!;
    const seed = Math.floor(hash(x, y, 7 + k) * 1e9);
    const ang = down ? Math.PI / 2 + (hash(seed, 0, 6) - 0.5) * 1.2 : hash(seed, 0, 6) * Math.PI * 2;
    walk(x, y, ang, reach, seed, 0, 0);
  }
  return out;
}
