// Foraging on one world's plane (docs/refactor.md S3.3, ja-fnd.4.12): the site an ant remembers and heads back to, milling where food was, the line home it walks (the m-line), and pointing down its hole. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `c`.

import type { Colony } from "./colony.ts";
import { NO_CELL } from "./grid.ts";
import { CELL, DIR_ANGLE, R, cellOf, centreX, centreY, hexDistance, nx as stepX, ny as stepY } from "./hex.ts";
import { outDistAt } from "./homing.ts";
import { LOOP_AT } from "./params.ts";
import { EDGE, MILL_WAYS, M_LINE_WIDTH, PI_DRIFT, SEARCH_GROW_2D, SEARCH_START, WAIT_STEPS } from "./tuning.ts";
import { OPEN, isSky, rockAt } from "./world.ts";

/**
 * Whether ant i at (x, y) is back on its line home: the line from where this trip first met rock
 * to the nest (Bug2's "m-line"). Leaving walls only there is what guarantees getting round: leaving
 * anywhere nearer settles ants in the deepest bay facing the nest.
 */
export function onMLine(c: Colony, i: number, x: number, y: number, width = M_LINE_WIDTH): boolean {
  const ax = c.mx[i];
  const ay = c.my[i];
  if (Number.isNaN(ax)) return true;
  const dx = c.goalX - ax;
  const dy = c.goalY - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  return Math.abs((x - ax) * dy - (y - ay) * dx) / len < width;
}

/**
 * One world's plane (ja-lp4.15): ant i has picked up food where it stands. It keeps where it believes that is, relative to its
 * hole: where it stands less where its vector says the hole is (the hole plus odoSurf × (driftSurf, driftSurfY): its home
 * vector, negated). Only its own odometer and drift; no coordinate of the food or the hole's true place. With the plane bound.
 */
export function rememberSite(c: Colony, i: number): void {
  const odo = c.odoSurf[i];
  c.foodX[i] = c.x[i] - (c.nest.x + odo * c.driftSurf[i]);
  c.foodY[i] = c.y[i] - (c.nest.y + odo * c.driftSurfY[i]);
}

/**
 * One world's plane (ja-lp4.15): the heading an exploring ant i with a remembered spot (foodX, foodY) steers on. Where it
 * believes the spot is: its vector's own hole (the hole plus odoSurf × drift, as believePlane) plus the remembered offset,
 * walked straight; within LOOP_AT of it, it searches round it, U3b's spiral (a point a quarter turn on and SEARCH_GROW_2D
 * further out each time one is reached; the first heads the way it faces). Its search state is the homing ant's
 * (search, searchA), zeroed when it turns for home (homeAfresh) or finds food. Never past the plane's edges.
 */
export function siteAim(c: Colony, i: number): number {
  const odo = c.odoSurf[i];
  const x = c.x[i];
  const y = c.y[i];
  const lx = c.map.x0 + EDGE;
  const hx = c.map.x0 + c.map.size.w - EDGE;
  const hy = c.map.size.h * R - EDGE;
  const tx = Math.max(lx, Math.min(hx, c.nest.x + odo * c.driftSurf[i] + c.foodX[i]));
  const ty = Math.max(EDGE, Math.min(hy, c.nest.y + odo * c.driftSurfY[i] + c.foodY[i]));
  let s = c.search[i];
  if (s === 0) {
    if (Math.hypot(tx - x, ty - y) >= LOOP_AT) return Math.atan2(ty - y, tx - x);
    // There, and nothing in sight: round it, the first point ahead of it.
    c.searchA[i] = c.heading[i];
    s = c.search[i] = SEARCH_START;
  }
  let a = c.searchA[i];
  let px = tx + s * Math.cos(a);
  let py = ty + s * Math.sin(a);
  if (Math.hypot(px - x, py - y) < LOOP_AT) {
    a = c.searchA[i] = a + Math.PI / 2;
    const { w, h } = c.map.size;
    s = c.search[i] = Math.min(Math.max(w, h * R), s * SEARCH_GROW_2D);
    // Widened past what its vector's error covers (a quarter turn each point, so it has been all round at the last): the spot is spent.
    if (c.params.siteGive > 0 && s > c.params.siteGive * PI_DRIFT * Math.hypot(c.foodX[i], c.foodY[i])) {
      c.foodX[i] = c.foodY[i] = NaN;
      c.search[i] = 0;
      c.searchA[i] = 0;
      return c.heading[i];
    }
    px = tx + s * Math.cos(a);
    py = ty + s * Math.sin(a);
  }
  return Math.atan2(py - y, px - x);
}

/**
 * Ant i, held at the gate, mills among the top cells of its shaft: cell by cell, to an open neighbour at the gate (within
 * WAIT_STEPS of the hole) at random. Sets its target cell (as walkTunnel does); false if no cell there is open.
 */
export function mill(c: Colony, i: number, step: number): boolean {
  const map = c.map;
  c.antCell(i);
  const hx = CELL[0];
  const hy = CELL[1];
  const gx = c.gx[i];
  const gy = c.gy[i];
  const fresh = gx === NO_CELL || hexDistance(gx, gy, hx, hy) > 1 || outDistAt(c, gx, gy) < 0 || outDistAt(c, gx, gy) > WAIT_STEPS;
  if (!fresh && Math.hypot(centreX(gx, gy) - c.x[i], centreY(gy) - c.y[i]) > step) return true;
  const cx = fresh ? hx : gx;
  const cy = fresh ? hy : gy;
  const ways = MILL_WAYS;
  let n = 0;
  for (let d = 0; d < 6; d++) {
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    const k = outDistAt(c, tx, ty);
    if (k >= 0 && k <= WAIT_STEPS && rockAt(map, tx, ty) === OPEN && !isSky(map, tx, ty)) ways[n++] = d;
  }
  if (n === 0) {
    c.gx[i] = NO_CELL;
    return false;
  }
  const d = ways[Math.floor(c.rng() * n)];
  c.gdir[i] = d;
  c.gx[i] = stepX(cx, cy, d);
  c.gy[i] = stepY(cy, d);
  return true;
}

/**
 * Ant i, not to go out, has stepped from (x0, y0) up out of the hole onto the ground: back, and pointed down the shaft
 * (its deepest open neighbour underground), the walker aimed at that cell. Only turning it round left it in the hole,
 * which is no tunnel, steering at random into the sky again and again (review of slice 6: ants pinned there up to
 * 45 s, a tenth to a fifth of their time). Returns its heading, h as it was if there is no way down but back.
 */
export function pointDown(c: Colony, i: number, x0: number, y0: number, h: number): number {
  const map = c.map;
  c.x[i] = x0;
  c.y[i] = y0;
  cellOf(x0, y0);
  const bx = CELL[0];
  const by = CELL[1];
  let down = -1;
  let deepest = -Infinity;
  for (let d = 0; d < 6; d++) {
    const tx = stepX(bx, by, d);
    const ty = stepY(by, d);
    if (rockAt(map, tx, ty) === OPEN && !isSky(map, tx, ty) && centreY(ty) > deepest) ((deepest = centreY(ty)), (down = d));
  }
  if (down >= 0) {
    h = DIR_ANGLE[down];
    c.gdir[i] = down;
    c.gx[i] = stepX(bx, by, down);
    c.gy[i] = stepY(by, down);
  } else {
    h += Math.PI;
    c.gx[i] = NO_CELL;
  }
  c.cellAtX[i] = NaN; // its cell is worked out afresh
  return h;
}
