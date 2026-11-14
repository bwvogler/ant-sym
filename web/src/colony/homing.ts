// Homing (docs/refactor.md S3.3): path integration, where an ant believes home is, route memory and search, the home field, and the way to and out of the hole. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `c` and `goal` becoming `homeGoal`.

import type { Colony } from "./colony.ts";
import { NO_CELL, SOIL_FILL, UP_FIRST, gauss, walkable } from "./grid.ts";
import { CELL, R, cellOf, centreX, centreY, hexDistance, nx as stepX, ny as stepY } from "./hex.ts";
import { LOOP_AT } from "./params.ts";
import { type Mark, swapBroodStore } from "./pheromone.ts";
import {
  EDGE,
  HOLE_SIGHT,
  NEST_SIGHT,
  OUT_FIELD_EVERY,
  PI_DRIFT,
  PI_DRIFT_2D,
  SEARCH_GROW,
  SEARCH_GROW_2D,
  SEARCH_START,
} from "./tuning.ts";
import { FAINT, PLANE, RETURN, trailLevel, type Home } from "./vocab.ts";
import { OPEN, isSky, rockAt, type Nest } from "./world.ts";
import { perceivedPlace } from "./sense.ts";

/** Whether ant i, underground, is home: in its royal chamber, where it homes to. Leaves the shared CELL as it found it. */
export function atHome(c: Colony, i: number): boolean {
  const keepX = CELL[0];
  const keepY = CELL[1];
  c.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  const at = c.inOwnNest(cx, cy) ? perceivedPlace(c, i, c.placeAt(cx, cy)) : null;
  CELL[0] = keepX;
  CELL[1] = keepY;
  return at === "royal";
}

/**
 * The way from cell (cx, cy) up and out of the nest: one step nearer this colony's hole along the tunnels (outField), or
 * −1 at the hole. Greedy steps by straight-line distance to the hole (the first cut) parked old foragers at tunnel tips
 * that lay nearer the hole than anything round them, for good: they don't dig (review of #25). A cell the field doesn't
 * reach (dug since it was built, or not joined to the hole) steps straight toward the hole as before.
 */
export function climbOut(c: Colony, cx: number, cy: number): number {
  const f = outField(c);
  const { w, h } = c.map.size;
  const { x0 } = c.map;
  const here = cx >= x0 && cy >= 0 && cx < x0 + w && cy < h ? f[cy * w + cx - x0] : -1;
  if (here === 0) return -1;
  if (here > 0)
    for (const d of UP_FIRST) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (tx >= x0 && ty >= 0 && tx < x0 + w && ty < h && f[ty * w + tx - x0] === here - 1 && rockAt(c.map, tx, ty) === OPEN) return d;
    }
  c.holeX = (c.entrance as Nest).x;
  return towardHole(c, cx, cy, false);
}

/**
 * The side view: steps from each open cell underground to this colony's hole through the tunnels (−1: not joined to it).
 * Cached for the colony, and rebuilt when the ground has changed (cells dug or filled), at most every OUT_FIELD_EVERY
 * seconds, or at once when the map has grown (one world's curtain, Game.addColony): a breadth-first walk over the nest's
 * own tunnels, a few thousand cells. Cell (x, y) is at y·w + x − x0.
 */
export function outField(c: Colony): Int32Array {
  const map = c.map;
  const version = map.dug + map.filled;
  const { w, h } = map.size;
  const { x0 } = map;
  const kept = c.outDist;
  const have = kept && kept.length === w * h ? kept : null;
  if (have && (c.outVersion === version || c.time - c.outAt < OUT_FIELD_EVERY)) return have;
  const dist = have ?? new Int32Array(w * h).fill(-1);
  c.outDist = dist;
  const cells = c.outCells;
  if (have) for (const k of cells) dist[k] = -1;
  cells.length = 0;
  const start = c.entranceRow * w + c.entranceCol - x0;
  dist[start] = 0;
  cells.push(start);
  for (let q = 0; q < cells.length; q++) {
    const k = cells[q];
    const col = k % w;
    const y = (k - col) / w;
    const x = col + x0;
    const d = dist[k] + 1;
    for (let dir = 0; dir < 6; dir++) {
      const tx = stepX(x, y, dir);
      const ty = stepY(y, dir);
      if (tx < x0 || ty < 0 || tx >= x0 + w || ty >= h) continue;
      const t = ty * w + tx - x0;
      if (dist[t] >= 0 || rockAt(map, tx, ty) !== OPEN || isSky(map, tx, ty)) continue;
      dist[t] = d;
      cells.push(t);
    }
  }
  c.outVersion = version;
  c.outAt = c.time;
  return dist;
}

/**
 * Path integration (the side view): the step from (x0, y0) is added to the odometer it walked it under. Coming up out
 * of its own hole starts the surface vector afresh (it points to the hole); in the chamber, the in-nest memory starts
 * afresh. Each fresh start draws that trip's drift.
 */
export function integrate(c: Colony, i: number, x0: number, y0: number, atNest: boolean): void {
  c.antCell(i);
  const under = !isSky(c.map, CELL[0], CELL[1]);
  const step = Math.hypot(c.x[i] - x0, c.y[i] - y0);
  // Only its own hole is where the vector points: up out of another (the rival's, say), its error stands (review of
  // #20: surfacing anywhere made the belief exactly its own hole).
  const ownHole = !under && c.under[i] === 1 && atOwnHole(c, x0, y0);
  c.antCell(i); // CELL is the ant's own again (the caller reads it)
  if (ownHole) {
    c.odoSurf[i] = 0;
    c.driftSurf[i] = gauss(c.rng) * PI_DRIFT;
    c.search[i] = 0;
  } else if (under && !c.under[i]) c.search[i] = 0;
  c.under[i] = under ? 1 : 0;
  if (under || c.mode[i] !== RETURN) c.groundMin[i] = NaN;
  // The error grows with the way out; once the ant heads home it is fixed (the vector it walks home on is the one it
  // brought out; counting the walk home and the search into it moved the believed goal as fast as the ant chased it).
  if (c.mode[i] !== RETURN) {
    if (under) c.odoNest[i] = c.odoNest[i] + step;
    else c.odoSurf[i] = c.odoSurf[i] + step;
  }
  if (atNest) {
    c.odoNest[i] = 0;
    c.driftNest[i] = gauss(c.rng) * PI_DRIFT;
    if (c.goalKind[i] === 0) c.search[i] = 0;
  }
}

/** The side view: whether cell (cx, cy) is in this colony's nest: open ground underground joined to its hole (see outField). */
export function ownTunnels(c: Colony, cx: number, cy: number): boolean {
  const { w, h } = c.map.size;
  const { x0 } = c.map;
  return cx >= x0 && cy >= 0 && cx < x0 + w && cy < h && outField(c)[cy * w + cx - x0] >= 0;
}

/** The side view: whether world point (x, y) is at this colony's hole (its cell, or one beside it). */
export function atOwnHole(c: Colony, x: number, y: number): boolean {
  cellOf(x, y);
  return hexDistance(CELL[0], CELL[1], c.entranceCol, c.entranceRow) <= 1;
}

/** The nest ant i homes to now (see tick): the chamber, or in the side view the entrance (pellet carriers, ants on the ground line). */
export function homeGoal(c: Colony, i: number, pellet: boolean): Nest {
  const ent = c.entrance;
  if (!ent) return c.nest;
  let kind = 1;
  if (!pellet || c.soil[i] === SOIL_FILL) {
    c.antCell(i);
    // Off the ground line it heads for the chamber, but only once in its own nest (in at its own hole, or anywhere in the
    // tunnels joined to it): in at another hole (the rival's), the chamber 340 columns away through soil was no way home
    // (review of #15: a carrier trapped in the rival's shaft for 300 s). There it keeps heading for its hole, and climbs out.
    const cx = CELL[0];
    const cy = CELL[1];
    if (!isSky(c.map, cx, cy)) kind = c.goalKind[i] === 1 && !ownTunnels(c, cx, cy) ? 1 : 0;
  }
  if (kind !== c.goalKind[i]) {
    // A new goal: the wall it was following, and its line home, were for the other one.
    c.goalKind[i] = kind;
    c.bestD[i] = Infinity; // progress is toward the new goal
    c.stallT[i] = 0;
    c.search[i] = 0;
    c.groundMin[i] = NaN;
    c.wall[i] = 0;
    c.mx[i] = NaN;
    c.gx[i] = NO_CELL;
  }
  return kind ? ent : c.nest;
}

/**
 * Where ant i believes `goal` is (the side view and one world's plane; on the top-down maps, exactly where it is). Its
 * home vector puts the goal drift × distance walked off to one side, plus its search offset; depth is exact (gravity).
 * Local cues snap it to the real goal: the hole within HOLE_SIGHT (seen, and its smell), the chamber in clear view within
 * NEST_SIGHT. On the plane the same in 2D (believePlane).
 */
export function believe(c: Colony, i: number, goal: Nest): Nest {
  if (c.line !== null && c.cur === PLANE) return believePlane(c, i, goal);
  if (!c.entrance) return goal;
  const x = c.x[i];
  const y = c.y[i];
  const toHole = goal === c.entrance;
  // The hole: across the ground, and up out of its crater (the mound's rim stands rows above it; the entrance's smell rises).
  const sees = toHole
    ? Math.abs(x - goal.x) < HOLE_SIGHT && Math.abs(y - goal.y) < 2 * HOLE_SIGHT
    : Math.hypot(x - goal.x, y - goal.y) < NEST_SIGHT && c.clearTo(x, y, goal.x, goal.y);
  if (sees) return goal;
  const under = c.under[i] === 1;
  const off = under ? c.driftNest[i] * c.odoNest[i] : c.driftSurf[i] * c.odoSurf[i];
  const b = c.belief;
  // Never past the ground's ends: a belief off the map left a carrier at the map's edge for good, never reaching the
  // column where it would have searched (review of #20: 473 samples in six games had it off the map). The search is
  // centred on the end it can reach.
  const lo = c.map.x0 + EDGE;
  const hi = c.map.x0 + c.map.size.w - EDGE;
  b.x = Math.max(lo, Math.min(hi, Math.max(lo, Math.min(hi, goal.x + off)) + c.search[i]));
  b.y = goal.y;
  b.r = goal.r;
  return b;
}

/**
 * One world's plane (U3b, docs/one-world.md §4): where ant i believes its hole (`goal`, the plane nest) is. Its vector,
 * started afresh up out of that hole (crossUp), puts it odoSurf × (driftSurf, driftSurfY) off, plus the search's point
 * (search's reach at angle searchA), never past the plane's edges. Within HOLE_SIGHT of the hole (seen, and the
 * entrance's smell), or within NEST_SIGHT with a clear line to it, the belief is the hole itself.
 */
export function believePlane(c: Colony, i: number, goal: Nest): Nest {
  const x = c.x[i];
  const y = c.y[i];
  const d = Math.hypot(x - goal.x, y - goal.y);
  if (d < HOLE_SIGHT || (d < NEST_SIGHT && c.clearTo(x, y, goal.x, goal.y))) return goal;
  if (c.params.moundSmell > 0 && c.search[i] !== 0 && c.onOwnMound(x, y, d)) return goal;
  if (c.routeState[i] === 1) {
    const place = routeBelief(c, i, goal);
    if (place) return place;
  }
  const odo = c.odoSurf[i];
  let s = c.search[i];
  let a = c.searchA[i];
  const p = c.params;
  if (p.searchLoops > 0 && s !== 0) {
    // Loops (ja-lp4.11): loop k heads searchTurn × k on from the first; out to its reach at the heading − half its
    // width, across to + half, then back to where the vector ran out.
    const n = c.searchLeg[i];
    const leg = n % 3;
    if (leg === 2) s = 0;
    else a += ((n - leg) / 3) * p.searchTurn + (leg === 0 ? -0.5 : 0.5) * p.searchPetal;
  }
  const b = c.belief;
  // Never past the plane's edges (as the side view's ground's ends): the search is centred on the point it can reach.
  const lo = EDGE;
  const lx = c.map.x0 + EDGE;
  const hx = c.map.x0 + c.map.size.w - EDGE;
  const hy = c.map.size.h * R - EDGE;
  b.x = Math.max(lx, Math.min(hx, Math.max(lx, Math.min(hx, goal.x + odo * c.driftSurf[i])) + s * Math.cos(a)));
  b.y = Math.max(lo, Math.min(hy, Math.max(lo, Math.min(hy, goal.y + odo * c.driftSurfY[i])) + s * Math.sin(a)));
  b.r = goal.r;
  return b;
}

/** Ant i has no places stored: a fresh trip (ja-lp4.16). Its slot's places are left; routeN says none are in use. A newborn gets the same through the table (ants.ts `reset`): a field added here is marked there too. */
export function routeClear(c: Colony, i: number): void {
  c.routeN[i] = 0;
  c.routeGap[i] = c.params.routeStep;
  c.routeAt[i] = 0;
  c.routeState[i] = 0;
  c.routeGoal[i] = -1;
}

/**
 * One world's plane (ja-lp4.16): ant i, walking out (exploring or following, empty-jawed), has walked on; once it is
 * routeGap cells on from its last stored place (by its odometer) it stores where it stands. A full store keeps every second
 * place and doubles the spacing, so a long trip is kept whole, coarser. Only its own position; no global read.
 */
export function routeRecord(c: Colony, i: number): void {
  const odo = c.odoSurf[i];
  if (odo - c.routeAt[i] < c.routeGap[i]) return;
  const cap = c.routePlaces.length / (2 * c.n); // routeMax as the colony was built, 2 to 255
  const at = i * cap * 2;
  let n = c.routeN[i];
  if (n >= cap) {
    const keep = (n + 1) >> 1;
    for (let k = 0; k < keep; k++) {
      c.routePlaces[at + 2 * k] = c.routePlaces[at + 4 * k];
      c.routePlaces[at + 2 * k + 1] = c.routePlaces[at + 4 * k + 1];
    }
    n = keep;
    c.routeGap[i] = c.routeGap[i] * 2;
  }
  c.routePlaces[at + 2 * n] = c.x[i];
  c.routePlaces[at + 2 * n + 1] = c.y[i];
  c.routeN[i] = n + 1;
  c.routeAt[i] = odo;
}

/**
 * One world's plane (ja-lp4.16): the vector of carrier i has failed (a stall, or its belief reached with no hole there:
 * `stalled`). Retracing, a stall means this place is out of reach: it aims for the one before. Not yet, with routeMemory
 * on, places stored, and food in its jaws: it starts to retrace, from its newest place, once a trip. Returns whether route
 * memory took the failure (the caller's search then waits).
 */
export function routeFail(c: Colony, i: number, stalled: boolean): boolean {
  const p = c.params;
  if (p.routeMemory <= 0 || c.line === null || c.cur !== PLANE) return false;
  if (c.routeState[i] === 1) return stalled ? routeTo(c, i, c.routeGoal[i] - 1) : true;
  if (c.routeState[i] !== 0 || c.routeN[i] === 0 || c.carrying[i] !== 1 || c.pellet[i] === 1 || (!stalled && p.routeMemory < 2))
    return false;
  c.routeState[i] = 1;
  return routeTo(c, i, c.routeN[i] - 1);
}

/** Ant i's goal is its place k, progress judged afresh toward it; none left (k < 0): it has retraced this trip and searches as it did. Always true. */
export function routeTo(c: Colony, i: number, k: number): boolean {
  c.wall[i] = 0;
  c.mx[i] = NaN;
  c.bestD[i] = Infinity;
  c.stallT[i] = 0;
  if (k < 0) {
    c.routeState[i] = 2;
    c.routeGoal[i] = -1;
    searchOn(c, i);
  } else c.routeGoal[i] = k;
  return true;
}

/**
 * One world's plane (ja-lp4.16): where the retracing ant i steers: its goal place. Whenever it is within routeSee of a
 * place it has stored, the earliest of them, it takes that one as reached and aims for the one before (which cuts out the
 * loops of its way out); the goal itself is reached within LOOP_AT. Run out of places, it is done retracing (null, and its
 * search goes on as it did).
 */
export function routeBelief(c: Colony, i: number, goal0: Nest): Nest | null {
  const at = (i * c.routePlaces.length) / c.n;
  const x = c.x[i];
  const y = c.y[i];
  const goal = c.routeGoal[i];
  const see = c.params.routeSee;
  let e = -1;
  for (let k = 0; k <= goal && see > 0; k++) {
    if (Math.hypot(c.routePlaces[at + 2 * k] - x, c.routePlaces[at + 2 * k + 1] - y) < see) {
      e = k;
      break;
    }
  }
  if (e < 0 && Math.hypot(c.routePlaces[at + 2 * goal] - x, c.routePlaces[at + 2 * goal + 1] - y) < LOOP_AT) e = goal;
  if (e >= 0) routeTo(c, i, e - 1);
  if (c.routeState[i] !== 1) return null;
  const g = c.routeGoal[i];
  const b = c.belief;
  b.x = c.routePlaces[at + 2 * g];
  b.y = c.routePlaces[at + 2 * g + 1];
  b.r = goal0.r;
  return b;
}

/**
 * Ant i got to where it believed its goal was and found nothing: it searches, in loops of growing size to either side
 * (Wehner's systematic search). The loops keep widening for as long as it searches (Müller & Wehner 1994: centred on
 * where the vector ran out, they grow without limit in time), up to the whole ground; capped at 80 cells, a carrier
 * whose vector was off by more than about 86 never found its hole (review of #20). On one world's plane, the loops go
 * round where the vector ran out: each next point a quarter turn on, the first ahead of the ant, each loop of four
 * SEARCH_GROW times wider. That simplifies the sources' 2D geometry: their loops grow but start and end at the search's
 * centre (Müller & Wehner 1994, from its abstract; modelled by Waldner & Merkle 2018), where this spiral circles the
 * centre and never goes back to it (docs/nest-and-home.md §1, §3.1; centred loops are ja-lp4.11). No random draw there.
 * It also searches on whenever it gets no nearer its point for SEARCH_STALL seconds, and the home trail leads it (tick).
 */
export function searchOn(c: Colony, i: number, stalled = false): void {
  const s = c.search[i];
  const p = c.params;
  if (c.line !== null && c.cur === PLANE && p.searchLoops > 0) {
    // Loops (ja-lp4.11, docs/nest-search.md): the next point, three a loop; stalled, with searchStall 0, the next loop's
    // first. The first loop heads the way the ant faces (no random draw). Each loop reaches searchLoops σ + searchGrow σ
    // a loop, σ from its own trip (the vector's error per axis), at least SEARCH_START; no cap but the plane's longer side.
    const leg = c.searchLeg[i];
    const n = s === 0 ? 0 : stalled && p.searchStall === 0 ? leg - (leg % 3) + 3 : leg + 1;
    if (s === 0) c.searchA[i] = c.heading[i];
    c.searchLeg[i] = n;
    const sigma = PI_DRIFT_2D * c.odoSurf[i];
    const { w, h } = c.map.size;
    c.search[i] = Math.min(Math.max(w, h * R), Math.max(SEARCH_START, sigma * (p.searchLoops + p.searchGrow * Math.floor(n / 3))));
  } else if (c.line !== null && c.cur === PLANE) {
    const { w, h } = c.map.size;
    c.searchA[i] = s === 0 ? c.heading[i] : c.searchA[i] + Math.PI / 2;
    // A safety cap at the plane's longer side: games don't reach it (no search passed 100 cells in seeds 1–3, review of #60).
    c.search[i] = s === 0 ? SEARCH_START : Math.min(Math.max(w, h * R), s * SEARCH_GROW_2D);
  } else {
    const most = c.map.size.w;
    c.search[i] = s === 0 ? SEARCH_START * (c.rng() < 0.5 ? -1 : 1) : Math.max(-most, Math.min(most, -s * SEARCH_GROW));
  }
  c.wall[i] = 0;
  c.mx[i] = NaN;
  // Progress is judged toward the goal it now believes in.
  c.bestD[i] = Infinity;
  c.stallT[i] = 0;
}

/** The situation's home field for ant i: the home trail ahead (sensor readings hl, hf, hr), or, underground in the side view, where it is. */
export function homeField(c: Colony, i: number, hl: number, hf: number, hr: number): Home {
  if (c.entrance) {
    c.antCell(i);
    const cx = CELL[0];
    const cy = CELL[1];
    if (!isSky(c.map, cx, cy)) return perceivedPlace(c, i, c.placeAt(cx, cy)) ?? "tunnel";
  }
  return trailLevel(Math.max(hl, hf, hr));
}

/** Where ant i heads when it homes into the nest (the chamber it reads its road signs for): a nurse with brood, a brood chamber; else royal, the queen's (slice 5: carriers to reception). */
export function destMark(c: Colony, i: number): Mark {
  const m = trueDestMark(c, i);
  // The fungus can swap brood and store (nest slice 8): it follows the other one's signs. A muddled nurse takes brood
  // toward the stores, and a porter takes the larvae's food there: muddle costs a colony births (PRD §39, an intended
  // cost: exempting brood carriers did not bring the births back).
  return c.swapMarks[i] >= 0.5 ? swapBroodStore(m) : m;
}

export function trueDestMark(c: Colony, i: number): Mark {
  if (c.broodHeld[i]) return "brood";
  if (c.carrying[i] && c.queen) {
    const role = c.map.chambers?.list[c.foodTo(i)]?.role;
    if (role && role !== "none") return role;
  }
  return "royal";
}

/**
 * The side view: the way from cell (cx, cy) to an open neighbour nearer the hole (along the ground: by
 * column, then straight-line distance; else by straight-line distance), or −1 if none is nearer.
 */
export function towardHole(c: Colony, cx: number, cy: number, alongGround: boolean, below = NaN, hy = (c.entrance as Nest).y): number {
  let best = -1;
  let bestD = (Number.isNaN(below) ? holeMetric(c, cx, cy, alongGround, hy) : below) - 1e-6;
  for (let d = 0; d < 6; d++) {
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if (!walkable(c.map, tx, ty)) continue;
    // Along the ground, off it only into the hole it heads for: in at another (the rival's, nearer by column on the way
    // past), a carrier was trapped in that shaft (review of #15).
    if (alongGround && !isSky(c.map, tx, ty) && !targetHole(c, tx, ty, hy)) continue;
    const m = holeMetric(c, tx, ty, alongGround, hy);
    if (m < bestD) {
      bestD = m;
      best = d;
    }
  }
  return best;
}

/** The distance to the hole (holeX, row y `hy`) from cell (cx, cy) that towardHole steps by: along the ground, by column first, then straight-line distance; else straight-line distance. */
export function holeMetric(c: Colony, cx: number, cy: number, alongGround = true, hy = (c.entrance as Nest).y): number {
  const x = centreX(cx, cy);
  return (alongGround ? Math.abs(x - c.holeX) * 1000 : 0) + Math.hypot(x - c.holeX, centreY(cy) - hy);
}

/** Whether cell (x, y) is the hole being headed for (holeX, row y `hy`): the one cell off the ground line a walk along it may take. */
export function targetHole(c: Colony, x: number, y: number, hy: number): boolean {
  return Math.abs(centreX(x, y) - c.holeX) < 0.5 && Math.abs(centreY(y) - hy) < 0.5;
}

/**
 * One world's plane (U3c): how far ant i believes it is from home, by its own vector (U3b): from where it believes its
 * hole is, the hole plus odoSurf × (driftSurf, driftSurfY). Not its search's point: that is where it looks, not where
 * it believes home is. With the plane bound.
 */
export function fromHomePlane(c: Colony, i: number): number {
  const odo = c.odoSurf[i];
  const bx = c.nest.x + odo * c.driftSurf[i];
  const by = c.nest.y + odo * c.driftSurfY[i];
  return Math.hypot(c.x[i] - bx, c.y[i] - by);
}

/** Whether any open neighbour of cell (x, y) holds home scent an ant would notice (FAINT or more). */
export function homeScentNear(c: Colony, x: number, y: number): boolean {
  const home = c.ph.fields.home;
  for (let d = 0; d < 6; d++) {
    const tx = stepX(x, y, d);
    const ty = stepY(y, d);
    if (rockAt(c.map, tx, ty) === OPEN && home.get(tx, ty) >= FAINT) return true;
  }
  return false;
}

/** Steps from cell (cx, cy) to this colony's hole along its tunnels (outField), or −1: off the map, or not joined to it. */
export function outDistAt(c: Colony, cx: number, cy: number): number {
  const { w, h } = c.map.size;
  const { x0 } = c.map;
  return cx >= x0 && cy >= 0 && cx < x0 + w && cy < h ? outField(c)[cy * w + cx - x0] : -1;
}
