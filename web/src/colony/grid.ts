// The colony's free functions over the map (cells, tunnels, soil, walls, steering helpers): pure, moved out of colony.ts as they were (docs/refactor.md S3.3, the `grid` module).

import { CELL, DIR_ANGLE, R, cellOf, centreX, centreY, dirOf, discOffsets, hexDistance, nx as stepX, ny as stepY } from "./hex.ts";
import { NO_KEY } from "./ants.ts";
import { BACKFILL } from "./params.ts";
import {
  DIG_ALONE,
  DIG_CROWD,
  DIG_FACE,
  GLANCE,
  GROUND_FLIP,
  MOUND_HEIGHT,
  MOUND_REACH,
  NO_FACE,
  SENSE_STEPS,
  START_FACE,
  SWELL,
} from "./tuning.ts";
import { FAINT, type CellCounts } from "./vocab.ts";
import { AIR, OPEN, SOIL, rockAt, type WorldMap } from "./world.ts";

/** No cell: a wall-follower with this as its target decides its next cell from where it stands. */
export const NO_CELL = NO_KEY;

/** No cell: a key no cell takes (it would be row −32768). −1 was the old "none", but that is cell (−1, 0). */
/** What a pellet is (Colony soil): soil an ant dug; loose soil off the mound going out; loose soil going down to fill. */
export const SOIL_DUG = 0;

export const SOIL_LOOSE = 1;

export const SOIL_FILL = 2;

/** inReach's window: cells within SENSE_STEPS of the start, stamped by call (a grid of offsets, so no allocation per call). */
export const REACH_SPAN = 2 * SENSE_STEPS + 3;

/** Whether, after `t` cells on the ground's surface, the ant turns back with the other hand: at GROUND_FLIP × (1, 3, 7, 15, ...) cells, so each leg is twice the last and passes where the one before began. */
export function flipDue(t: number): boolean {
  if (t % GROUND_FLIP !== 0) return false;
  const k = t / GROUND_FLIP + 1;
  return (k & (k - 1)) === 0;
}

/** The ways from a cell, upward ones first (NW, NE), then level, then down: gravity breaks ties when climbing out. */
export const UP_FIRST = [4, 5, 0, 3, 1, 2] as const;

/**
 * Which side to keep a newly met wall on, from touch probes left and right of the home vector:
 * turn toward the open side, so the wall stays on the other (+1 = wall on the right). Both open or
 * both blocked: either.
 */
export function wallSide(leftBlocked: boolean, rightBlocked: boolean, rng: () => number): -1 | 1 {
  if (leftBlocked !== rightBlocked) return leftBlocked ? -1 : 1;
  return rng() < 0.5 ? -1 : 1;
}

/**
 * A cell as one number, y·65536 + x: the midden's and returns' keys, and an ant's remembered cells. A column may be
 * negative (one world's curtain, whose columns start at the line's sMin), down to −32768; rows never are.
 */
export function cellKey(x: number, y: number): number {
  return y * 65536 + x;
}

/** The row of a cellKey: right for negative columns too (a plain floor of k / 65536 would give the row above). */
export function keyY(k: number): number {
  return Math.floor((k + 32768) / 65536);
}

/** The column of a cellKey. */
export function keyX(k: number): number {
  return k - keyY(k) * 65536;
}

/** A standard normal draw (Box–Muller). */
export function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** The signed difference a − b, wrapped into −π..π. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Whether an ant may choose to step into cell (x, y): open ground, or one world's ground strip (the curtain's last surface
 * row, sky: the side view draws the plane there, one-world §8 item 6), where a step from the hole under it is a crossing
 * up onto the plane (tick). The strip touches the curtain's open cells only at the holes, the crust being solid elsewhere,
 * so it reads as the walkway over a hole, as the side view's ground does. On every other map, open ground alone.
 * openAt and #walkTunnel need it (an ant at a hole's top must see the way up). #upOut, the scent walk and #towardHole use
 * it only to agree with openAt: none meets the strip today (PR #64 review N1: 0 disagreements with the open check, seeds
 * 1-3, 300 s), since a step into it crosses up at once.
 */
export function walkable(map: WorldMap, x: number, y: number): boolean {
  const t = rockAt(map, x, y);
  return t === OPEN || (t === AIR && map.surfaceRows !== undefined && y === map.surfaceRows - 1);
}

const reachStamp = new Uint32Array(REACH_SPAN * REACH_SPAN);

const reachQueue = new Int32Array(REACH_SPAN * REACH_SPAN * 2);

let reachCall = 0;

/**
 * Whether world point (x1, y1) can be reached from (x0, y0) through open ground below any surface rows (one world's
 * curtain) in at most `steps` steps between cells (`steps` ≤ SENSE_STEPS): how a sensor at (x1, y1) senses food there.
 * Food in a pocket sealed off by soil or rock is not sensed, however near (ja-juiu: sensed through the wall, it turned
 * explorers off their tunnels three cells short of every pocket, which no tunnel then reached); food round a bend is.
 */
export function inReach(map: WorldMap, x0: number, y0: number, x1: number, y1: number, steps = SENSE_STEPS): boolean {
  cellOf(x1, y1);
  const bx = CELL[0];
  const by = CELL[1];
  cellOf(x0, y0);
  const ax = CELL[0];
  const ay = CELL[1];
  if (ax === bx && ay === by) return true;
  if (hexDistance(ax, ay, bx, by) > steps) return false;
  const top = map.surfaceRows ?? 0;
  if (straightReach(map, x0, y0, x1, y1, ax, ay, bx, by, steps, top)) return true;
  const half = SENSE_STEPS + 1;
  const stamp = ++reachCall;
  reachStamp[half * REACH_SPAN + half] = stamp;
  reachQueue[0] = ax;
  reachQueue[1] = ay;
  let head = 0;
  let tail = 2;
  for (let depth = 0; depth < steps; depth++) {
    const end = tail;
    for (; head < end; head += 2) {
      const x = reachQueue[head]!;
      const y = reachQueue[head + 1]!;
      for (let d = 0; d < 6; d++) {
        const tx = stepX(x, y, d);
        const ty = stepY(y, d);
        const ox = tx - ax + half;
        const oy = ty - ay + half;
        if (ox < 0 || oy < 0 || ox >= REACH_SPAN || oy >= REACH_SPAN) continue;
        const k = oy * REACH_SPAN + ox;
        if (reachStamp[k] === stamp) continue;
        reachStamp[k] = stamp;
        if (rockAt(map, tx, ty) !== OPEN || ty < top) continue;
        if (tx === bx && ty === by) return true;
        reachQueue[tail++] = tx;
        reachQueue[tail++] = ty;
      }
    }
  }
  return false;
}

/**
 * inReach's fast path: the straight line from (x0, y0) to (x1, y1), walked in quarter-cell steps, crosses only open cells
 * below `top`, each a neighbour of the last, and at most `steps` of them after the first: a path inReach's search would
 * find too, so it answers the same (false here only means "search"). Most sensor tips lie straight along a tunnel.
 */
function straightReach(
  map: WorldMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  steps: number,
  top: number,
): boolean {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.25);
  let px = ax;
  let py = ay;
  let moves = 0;
  for (let k = 1; k <= n; k++) {
    cellOf(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
    const x = CELL[0];
    const y = CELL[1];
    if (x === px && y === py) continue;
    if (hexDistance(px, py, x, y) !== 1 || ++moves > steps || rockAt(map, x, y) !== OPEN || y < top) return false;
    px = x;
    py = y;
  }
  return px === bx && py === by;
}

/** Whether cell (x, y)'s neighbour the way `d` is open (walkable). */
function openAt(map: WorldMap, x: number, y: number, d: number): boolean {
  return walkable(map, stepX(x, y, ((d % 6) + 6) % 6), stepY(y, ((d % 6) + 6) % 6));
}

/**
 * Which way to dig on from tunnel cell (x, y) toward heading `aim`: of the two ways either side of
 * it, the far one with probability ∝ how near the heading is to it (`u` uniform in 0..1), so over
 * many cells the tunnel runs at the heading itself, not along one of the six ways. If that cell can't
 * be dug, the other; failing both, the diggable way nearest the heading; −1 if none. A cell filled
 * back less than BACKFILL.hold seconds before `now` is never dug (see refilled).
 */
export function chooseDig(
  map: WorldMap,
  x: number,
  y: number,
  aim: number,
  u: number,
  now = Infinity,
  hold: number = BACKFILL.hold,
): number {
  const a = (((aim / (Math.PI / 3)) % 6) + 6) % 6;
  const lo = Math.floor(a) % 6;
  const hi = (lo + 1) % 6;
  const first = u < a - Math.floor(a) ? hi : lo;
  let dug = -1;
  let off = Infinity;
  for (const d of [first, first === lo ? hi : lo, 0, 1, 2, 3, 4, 5]) {
    const tx = stepX(x, y, d);
    const ty = stepY(y, d);
    if (rockAt(map, tx, ty) !== SOIL || !diggable(map, tx, ty, d) || refilled(map, tx, ty, now, hold)) continue;
    if (d === hi || d === lo) return d;
    const o = Math.abs(angleDiff(DIR_ANGLE[d], aim));
    if (o < off) {
      off = o;
      dug = d;
    }
  }
  return dug;
}

/**
 * Whether cell (x, y) is in a tunnel: one cell wide wherever it is, so no two of its neighbours next to
 * each other are both open (three open cells round a corner are a chamber's, the hex grid's 2×2).
 * Junctions and crossings of tunnels count; a chamber's edge doesn't.
 */
export function narrow(map: WorldMap, x: number, y: number): boolean {
  let prev = openAt(map, x, y, 5);
  for (let d = 0; d < 6; d++) {
    const o = openAt(map, x, y, d);
    if (o && prev) return false;
    prev = o;
  }
  return true;
}

/** A cell of a dug tunnel: narrow, with soil on at least one side. (A gap between rocks on the open surface isn't one.) */
export function tunnel(map: WorldMap, x: number, y: number): boolean {
  if (!map.hasSoil || !narrow(map, x, y)) return false;
  for (let d = 0; d < 6; d++) if (rockAt(map, stepX(x, y, d), stepY(y, d)) === SOIL) return true;
  return false;
}

/**
 * The way (0–5) a step from world (x, y) to (px, py) crossed into the next cell: toward the solid it
 * ran into. Not into a neighbour (no crossing): the way nearest the step's own direction.
 */
export function crossedDir(map: WorldMap, x: number, y: number, px: number, py: number): number {
  cellOf(x, y);
  const cx = CELL[0];
  const cy = CELL[1];
  cellOf(px, py);
  const tx = CELL[0];
  const ty = CELL[1];
  for (let d = 0; d < 6; d++) if (stepX(cx, cy, d) === tx && stepY(cy, d) === ty) return d;
  void map;
  return dirOf(Math.atan2(py - y, px - x));
}

/**
 * The wall-follower's next way from cell (x, y), facing `dir`, keeping the wall on `side` (+1 right,
 * −1 left): the first open one going round from the hand side (60°) through straight on to the
 * other side, then the sharp turn hand-ward (120°), back last. It turns hand-ward only round a wall that is there (a solid cell on
 * the hand side): in open ground, turning hand-ward every cell would circle three cells for ever.
 */
export function handOnWall(map: WorldMap, x: number, y: number, dir: number, side: number): number {
  const lost = openAt(map, x, y, dir + side) && openAt(map, x, y, dir + 2 * side);
  // The sharp 120° turn hand-ward comes last but for going back: it always leads into a cell touching
  // the one it came from, so taking it first spins round three open cells that meet at a corner (the
  // stall scan of MR 9 found carriers doing that for over a minute). One-cell tunnels never need it.
  const order = lost ? [0, -side, -2 * side, side, 2 * side, 3] : [side, 0, -side, -2 * side, 2 * side, 3];
  for (const turn of order) {
    const d = (((dir + turn) % 6) + 6) % 6;
    if (openAt(map, x, y, d)) return d;
  }
  return dir;
}

/**
 * The outer radius (world units) of the mound of `pellets` dug cells heaped round a nest of radius
 * `nestR`: excavated soil goes up and out and is dumped round the entrance (Tschinkel 2015), so the
 * mound holds every pellet, loosened by SWELL. Its area is pellets × SWELL × a hex cell's area (√3/2).
 */
export function moundRadius(pellets: number, nestR: number): number {
  return Math.sqrt(nestR * nestR + (Math.max(0, pellets) * SWELL * R) / Math.PI);
}

/**
 * One world's plane (U3c, #carryOut): the reach of the disc spoil is spread over once `heaped` pellets are out: grown so
 * its area tracks the soil brought out at MOUND_HEIGHT levels deep (Tschinkel 2015), at most MOUND_REACH. A pellet goes
 * 2 + reach × √u out.
 */
export function planeMoundReach(heaped: number): number {
  return Math.min(MOUND_REACH, 3 + Math.sqrt((heaped * R) / (Math.PI * MOUND_HEIGHT)));
}

/** The chance an ant at tunnel cell (x, y) digs on, from the nestmates within two cells of it (itself not counted). */
export function digChance(friends: CellCounts, x: number, y: number): number {
  let n = -1;
  const o = discOffsets(2)[y & 1] as Int16Array;
  for (let k = 0; k < o.length; k += 2) n += friends.get(x + o[k], y + o[k + 1]);
  return Math.min(1, DIG_ALONE + Math.max(0, n) / DIG_CROWD);
}

/**
 * What a step from world (x, y) to (px, py) heading `h` does at soil: NO_FACE (it doesn't cross into
 * soil), DIG_FACE (it meets a tunnel's end head-on, or the cell it is walking to (aimX, aimY): dig it),
 * START_FACE (it meets a flat wall head-on: a tunnel may start here), or GLANCE (it touches the soil
 * at a slant: slide along it). Head-on is crossing the edge the heading points at: every heading is
 * within 30° of one of the six. Only a tunnel's end is dug (see tunnelEnd): that is what makes
 * tunnels rather than caverns. Soil put back less than BACKFILL.hold seconds before `now` is only
 * ever glanced off (see refilled).
 */
export function soilFace(
  map: WorldMap,
  x: number,
  y: number,
  px: number,
  py: number,
  h: number,
  aimX = NO_CELL,
  aimY = 0,
  now = Infinity,
  hold: number = BACKFILL.hold,
): number {
  cellOf(px, py);
  const tx = CELL[0];
  const ty = CELL[1];
  if (rockAt(map, tx, ty) !== SOIL) return NO_FACE;
  if (refilled(map, tx, ty, now, hold)) return GLANCE;
  cellOf(x, y);
  const cx = CELL[0];
  const cy = CELL[1];
  let d = -1;
  for (let k = 0; k < 6; k++) if (stepX(cx, cy, k) === tx && stepY(cy, k) === ty) d = k;
  if (d < 0) return NO_FACE;
  const headOn = dirOf(h) === d;
  const aimed = aimX === tx && aimY === ty;
  if ((headOn || aimed) && diggable(map, tx, ty, d)) return DIG_FACE;
  if (aimed && startable(map, tx, ty, d)) return DIG_FACE;
  if (headOn && startable(map, tx, ty, d)) return START_FACE;
  return GLANCE;
}

/**
 * Whether cell (x, y) was filled back with soil less than BACKFILL.hold seconds before `now` (the
 * default, Infinity: long after any fill). Such soil is left alone: a pellet put back is not dug out
 * again for a good while. Without this, 38–46 % of all digs re-dug filled cells (MR 12's review). Soil put back under
 * a chamber cell (builtFloor) is left for good.
 */
export function refilled(map: WorldMap, x: number, y: number, now: number, hold: number): boolean {
  return now - map.filledAt.get(x, y) < hold || builtFloor(map, x, y);
}

/** Whether any neighbour of cell (x, y) was filled back less than BACKFILL.hold seconds before `now` (a branch being filled from its tip; floor built back for good doesn't count). */
export function besideRefill(map: WorldMap, x: number, y: number, now: number, hold: number): boolean {
  for (let d = 0; d < 6; d++) if (now - map.filledAt.get(stepX(x, y, d), stepY(y, d)) < hold) return true;
  return false;
}

/**
 * The side view: whether cell (x, y) is ground a chamber's floor stands on: directly under a chamber cell, or beside
 * one on that chamber's floor row (a tunnel dug down, or out at floor level, from a chamber). Open, it takes floor
 * from the chamber; filled back, it gives it back (see Colony #backfill: it may be filled however lately it was dug).
 */
export function floorGround(map: WorldMap, x: number, y: number): boolean {
  const ch = map.chambers;
  if (!ch) return false;
  if (ch.at(stepX(x, y, 4), stepY(y, 4)) >= 0 || ch.at(stepX(x, y, 5), stepY(y, 5)) >= 0) return true;
  for (const d of [0, 3]) {
    const id = ch.at(stepX(x, y, d), stepY(y, d));
    if (id >= 0 && ch.list[id]!.floorRow === y) return true;
  }
  return false;
}

/**
 * Whether soil cell (x, y) was put back (filled, and not dug since) right under a chamber cell: floor the colony built
 * back, which stays for good. Held only for BACKFILL.hold like any fill, floor fills were dug out again at 2–7× the rate
 * of other fills once the hold ran out (35–49 % against 5–17 % over 1,200 s, with #14's guards merged into the nest:
 * PRD §31), and the floor went with them. (Not a cell beside a chamber on its floor row: that is where it widens.)
 */
export function builtFloor(map: WorldMap, x: number, y: number): boolean {
  const ch = map.chambers;
  if (!ch || map.filledAt.get(x, y) === -Infinity) return false;
  return ch.at(stepX(x, y, 4), stepY(y, 4)) >= 0 || ch.at(stepX(x, y, 5), stepY(y, 5)) >= 0;
}

/** Whether soil cell (x, y), entered going `d`, may be dug: a tunnel's end, or a wall with open ground straight beyond it (breaking through). */
export function diggable(map: WorldMap, x: number, y: number, d: number): boolean {
  return tunnelEnd(map, x, y) || openAt(map, x, y, d);
}

/**
 * Whether a new tunnel may start into wall cell (x, y), going `d`: no open ground within two steps
 * of it except on the side it is dug from (the side its own open neighbours are on: the chamber).
 * New tunnels keep their distance from other passages, so the ground isn't combed into parallel slots.
 */
export function startable(map: WorldMap, x: number, y: number, d: number): boolean {
  const fx = centreX(x, y);
  const fy = centreY(y);
  // Which way the chamber lies: toward the face's open neighbours (or back the way it is dug from).
  let nx = 0;
  let ny = 0;
  for (let k = 0; k < 6; k++)
    if (openAt(map, x, y, k)) {
      nx += Math.cos(DIR_ANGLE[k]);
      ny += Math.sin(DIR_ANGLE[k]);
    }
  if (Math.hypot(nx, ny) < 1e-6) {
    nx = -Math.cos(DIR_ANGLE[d]);
    ny = -Math.sin(DIR_ANGLE[d]);
  }
  const len = Math.hypot(nx, ny);
  const o = discOffsets(2)[y & 1] as Int16Array;
  for (let k = 2; k < o.length; k += 2) {
    const ax = x + o[k];
    const ay = y + o[k + 1];
    if (rockAt(map, ax, ay) !== OPEN) continue;
    if (((centreX(ax, ay) - fx) * nx + (centreY(ay) - fy) * ny) / len > 0.25) continue; // on the chamber's side
    return false;
  }
  return true;
}

/**
 * Whether open cell (x, y) is a stub: a dead end whose open neighbours (one or two) lie next to each
 * other, so filling it can't cut any passage (on offset rows a one-cell stub off a straight tunnel
 * touches two cells of it). With a larger maxOpen, any cell whose open neighbours (up to maxOpen) form one
 * unbroken run: the edge of a chamber, the side of a wide tunnel. Filling such a cell never cuts a passage
 * either (in digital topology, a "simple" cell: the ground stays connected the same way).
 */
export function stub(map: WorldMap, x: number, y: number, maxOpen = 2): boolean {
  let open = 0;
  let runs = 0;
  let prev = openAt(map, x, y, 5);
  for (let d = 0; d < 6; d++) {
    const o = openAt(map, x, y, d);
    if (o) open++;
    if (o && !prev) runs++;
    prev = o;
  }
  if (open === 6) runs = 1;
  return open >= 1 && open <= maxOpen && runs === 1;
}

/**
 * Whether soil cell (x, y) is a tunnel's end: just one of its six neighbours open (`most`). The cell
 * past a tunnel's end is, and so is a fork's first cell beside it; a tunnel's side wall (two open,
 * next to each other) or a chamber's wall is not. So tunnels lengthen and branch but stay one cell
 * wide, turning at most 60° a cell.
 */
export function tunnelEnd(map: WorldMap, x: number, y: number, most = 1): boolean {
  let open = 0;
  for (let d = 0; d < 6; d++) if (openAt(map, x, y, d) && ++open > most) return false;
  return true;
}

/**
 * A follower's turn by Deneubourg's choice function (Deneubourg et al. 1990; Goss et al. 1989; docs/trails.md): left,
 * ahead or right with chances (k + C)², each sensor's scent C. Where two trails part, the stronger takes more than its
 * share of followers, which is what lets a colony settle on one of two sources (A2a) and on the richer (A2b). On one
 * trail the sides read alike and it turns either way, held on by the trail's centre. (`climb`, always to the
 * strongest, sent followers down whichever trail lay ahead of them: behaviour MR 3, PRD §45.)
 */
export function choose(left: number, front: number, right: number, max: number, k: number, rng: () => number): number {
  const wl = (k + left) ** 2;
  const wf = (k + front) ** 2;
  const wr = (k + right) ** 2;
  const u = rng() * (wl + wf + wr);
  return u < wl ? -max : u < wl + wf ? 0 : max;
}

/** Turn toward the strongest of three sensors, at most `max` radians. */
export function climb(left: number, front: number, right: number, max: number): number {
  if (front >= left && front >= right) return 0;
  return left > right ? -max : max;
}

/** Turn toward the weakest of three alarm sensors, at most `max` radians; nothing when no sensor smells alarm. */
export function avoid(left: number, front: number, right: number, max: number): number {
  if (Math.max(left, front, right) < FAINT) return 0;
  // Rock or the map's edge reads −1: never the way out of alarm (ja-dul: it read as the least, and steered ants into walls).
  const l = left < 0 ? Infinity : left;
  const f = front < 0 ? Infinity : front;
  const r = right < 0 ? Infinity : right;
  if (f <= l && f <= r) return 0;
  return l < r ? -max : max;
}

/** Turn `h` toward `target` by at most `max` radians, the short way round. */
export function turnToward(h: number, target: number, max: number): number {
  const d = Math.atan2(Math.sin(target - h), Math.cos(target - h));
  return h + Math.max(-max, Math.min(max, d));
}
