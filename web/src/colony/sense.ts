// Sensing (docs/refactor.md S3.3): what an ant feels around it (nestmates, returning foragers, enemies and their heading), the situation it touches, the raid smell, and the floor marks it reads and lays. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `c` (and `around`, which never read the colony, losing that parameter).

import type { Colony, HoleCell, Layer } from "./colony.ts";
import { cellKey, inReach } from "./grid.ts";
import { CELL, cellOf, centreX, centreY, discOffsets } from "./hex.ts";
import { SEEN } from "./params.ts";
import { MARKS, swapBroodStore, type Mark } from "./pheromone.ts";
import { qualityOf, type Item, type Odds, type Touch, type Where } from "./responses.ts";
import { MARK_DECAY, RETURNS_MANY } from "./tuning.ts";
import { ENEMY, MODES, PLANE, trailLevel, type CellCounts, type Mode } from "./vocab.ts";
import { OPEN, blocked, inBounds, isSky, qualityAt, rockAt } from "./world.ts";
import { atGate } from "./crossing.ts";

/**
 * Ant i's situation for a response, in the shared Touch object (read it, don't keep it): its mode, load and where it
 * is now. `enemy` comes from the caller (the tick's enemy look, or the fights).
 */
export function touch(
  c: Colony,
  i: number,
  enemy: boolean,
  mode: number = c.mode[i],
  item: Item = c.item(i),
  offered: Item = "none",
): Touch {
  const l = c.layer[i];
  if (l === c.cur) return touchOn(c, i, enemy, mode, item, offered);
  const was = c.cur;
  c.bind(l);
  try {
    return touchOn(c, i, enemy, mode, item, offered);
  } finally {
    c.bind(was);
  }
}

/** touch, with ant i's layer bound. */
export function touchOn(c: Colony, i: number, enemy: boolean, mode: number, item: Item, offered: Item): Touch {
  const t = c.t;
  t.mode = MODES[mode] as Mode;
  t.carrying = item;
  t.porter = c.porter[i] === 1;
  t.digging = c.digT[i] > 0;
  c.ti = i; // t.place reads ant i's place when asked
  t.offered = offered;
  t.enemy = enemy;
  t.stance = c.stanceOf(i);
  // Taste (docs/trails.md): the food offered, under the ant; else the food in its jaws.
  if (offered === "food") {
    c.antCell(i);
    t.quality = qualityOf(qualityAt(c.map, CELL[0], CELL[1]));
  } else t.quality = item === "food" ? qualityOf(c.quality[i]) : "fair";
  t.alarm = i === c.alarmAnt ? c.alarmSmelt : "none";
  t.odds = i === c.alarmAnt ? c.oddsNow : "none";
  const few = c.params.leaveGate;
  const met = c.met[i];
  t.returns = few <= 0 || met < few ? "none" : met < RETURNS_MANY * few ? "few" : "many";
  t.raid = raidSmelt(c, i);
  t.crowd = c.crowd[i] >= c.params.crowdAt ? "many" : "few";
  return t;
}

/** place, with ant i's layer bound. */
export function placeOn(c: Colony, i: number): Where {
  const keepX = CELL[0];
  const keepY = CELL[1];
  let p: Where;
  if (c.entrance && c.under[i]) {
    c.antCell(i);
    const cx = CELL[0];
    const cy = CELL[1];
    // (One world, ja-web: at the gate at the top of its shaft it is at its nest's mouth, as on open ground.)
    p = !c.inOwnNest(cx, cy) ? "out" : atGate(c, i) ? "hole" : perceivedPlace(c, i, c.placeAt(cx, cy)) ? "chamber" : "tunnel";
  } else {
    const dx = c.x[i] - c.nest.x;
    const dy = c.y[i] - c.nest.y;
    p = dx * dx + dy * dy < c.nest.r * c.nest.r ? "hole" : "out";
  }
  CELL[0] = keepX;
  CELL[1] = keepY;
  return p;
}

/**
 * What the sensor in direction (dx, dy) (a unit vector) reads on every channel, into s[slot] (food), s[slot + 3] (home) and
 * s[slot + 6] (alarm): the trail, the edge or rock as −1, and food (or the nest, for home) as SEEN.
 */
export function sense(c: Colony, i: number, dx: number, dy: number, slot: number): void {
  const d = c.params.sensorDistance;
  const sx = c.x[i] + dx * d;
  const sy = c.y[i] + dy * d;
  const s = c.s;
  const { map, nest } = c;
  cellOf(sx, sy);
  const cx = CELL[0];
  const cy = CELL[1];
  // One world's curtain: its surface rows (the sky and the ground strip) are the plane's, solid to an ant underground.
  if (rockAt(map, cx, cy) !== OPEN || cy < (map.surfaceRows ?? 0)) {
    s[slot] = s[slot + 3] = s[slot + 6] = -1;
    return;
  }
  // Scent is read through the ant's perception (gains of 1 and no foreign reading: as it is, exactly).
  const f = c.ph.fields;
  // Food is sensed only through open ground: a pocket sealed off by soil is not, however near (ja-juiu, see inReach).
  if (map.food.get(cx, cy) > 0 && inReach(map, c.x[i], c.y[i], sx, sy)) s[slot] = SEEN;
  else {
    const wf = c.foreignFood[i];
    s[slot] = f.food.get(cx, cy) * c.gainFood[i] + (wf > 0 && c.foreign ? wf * c.foreign.fields.food.get(cx, cy) : 0);
  }
  const ndx = sx - nest.x;
  const ndy = sy - nest.y;
  s[slot + 3] = ndx * ndx + ndy * ndy < nest.r * nest.r ? SEEN : f.home.get(cx, cy) * c.gainHome[i];
  s[slot + 6] = f.alarm.get(cx, cy) * c.gainAlarm[i];
}

/** A chamber's role as ant i smells it (nest slice 8): the fungus can blunt its floor marks (it can't tell) or swap brood and store. */
export function perceivedPlace(c: Colony, i: number, role: Mark | null): Mark | null {
  if (!role) return null;
  // A species without this chamber's mark can't smell which chamber it is in: it reads plain tunnel (owner, review of #127 D1).
  if (!c.ph.has(role)) return null;
  if (c.gainMarks[i] < 0.5) return null;
  return c.swapMarks[i] >= 0.5 ? swapBroodStore(role) : role;
}

/**
 * Floor marks (nest slice 3): underground, ant i lays the mark of the last chamber it was in, fainter the longer since
 * (as walking out lays home trail), so every tunnel smells of what lies back along it: road signs at each junction.
 */
export function layMark(c: Colony, i: number, dt: number): void {
  c.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  if (isSky(c.map, cx, cy)) {
    c.lastRole[i] = 0; // out of the nest: the next chamber it enters starts its marks afresh
    return;
  }
  const role = c.placeAt(cx, cy);
  if (role) {
    c.lastRole[i] = MARKS.indexOf(role) + 1;
    c.sinceRole[i] = 0;
  } else c.sinceRole[i] = c.sinceRole[i] + dt;
  const r = c.lastRole[i];
  if (r === 0) return;
  const laid = c.params.deposit * Math.exp(-c.sinceRole[i] / MARK_DECAY) * dt * c.layGain[i];
  if (laid > 1e-4) c.ph.depositCell(MARKS[r - 1] as Mark, cx, cy, laid);
}

/** Ants on a count grid within two cells of (x, y). */
export function around(g: CellCounts, x: number, y: number): number {
  let s = 0;
  const o = discOffsets(2)[y & 1] as Int16Array;
  for (let k = 0; k < o.length; k += 2) s += g.get(x + o[k], y + o[k + 1]);
  return s;
}

/** Touch: is there rock (or the map's edge) `d` cells from ant i's position along `angle`? */
export function touchProbe(c: Colony, x: number, y: number, angle: number, d: number): boolean {
  return blocked(c.map, x + Math.cos(angle) * d, y + Math.sin(angle) * d);
}

/**
 * The raid trail ant i smells, strongest of its cell and its three sensors (behaviour MR 5.2): what recruits it, what it is asked
 * `leave` with, and what keeps it recruited. "strong" where the colony doesn't recruit raiders by trail.
 */
export function raidSmelt(c: Colony, i: number): "none" | "faint" | "strong" {
  if (c.params.raidGate <= 0) return "strong";
  // One world (ja-web): at the gate at the top of its shaft, the plane's trail where it ends, at its hole.
  if (c.entrance !== null) return atGate(c, i) ? trailLevel(holeRaid(c)) : "strong";
  return trailLevel(raidLevel(c, i));
}

/** The raid trail's level ant i smells: strongest of its cell and its three sensors (one world's curtain: at its hole, holeRaid). */
export function raidLevel(c: Colony, i: number): number {
  if (c.entrance !== null) return c.line !== null ? holeRaid(c) : 0;
  if (!c.ph.live("raid")) return 0;
  const x = c.x[i];
  const y = c.y[i];
  const h = c.heading[i];
  const d = c.params.sensorDistance;
  const a = c.params.sensorAngle;
  const ph = c.ph;
  return Math.max(
    ph.read("raid", x, y),
    ph.read("raid", x + Math.cos(h - a) * d, y + Math.sin(h - a) * d),
    ph.read("raid", x + Math.cos(h) * d, y + Math.sin(h) * d),
    ph.read("raid", x + Math.cos(h + a) * d, y + Math.sin(h + a) * d),
  );
}

/**
 * The plane's raid trail where it ends at this colony's hole: strongest of the hole's cell and the six round it. What an
 * ant held at the gate smells of it (a finder lays it home to the hole, and recruits at its own entrance: Topoff et al.
 * 1987, docs/raid-recruitment.md).
 */
export function holeRaid(c: Colony): number {
  const L = c.layers[PLANE] as Layer;
  const ph = L.ph;
  if (!ph.live("raid")) return 0;
  const hc = c.holeCells[c.params.nest] as HoleCell;
  const f = ph.fields.raid;
  const o = discOffsets(1)[hc.py & 1] as Int16Array;
  let best = 0;
  for (let k = 0; k < o.length; k += 2) {
    const x = hc.px + o[k];
    const y = hc.py + o[k + 1];
    if (inBounds(L.map, x, y)) best = Math.max(best, f.get(x, y));
  }
  return best;
}

/** Nestmates in cell (cx, cy) and the six round it, as the colony's count grid has them (docs/stance.md: crowding). */
export function nestmatesAround(c: Colony, cx: number, cy: number): number {
  const f = c.nestmates;
  if (!f) return 0;
  const map = c.map;
  const o = discOffsets(1)[cy & 1] as Int16Array;
  let s = 0;
  for (let k = 0; k < o.length; k += 2) {
    const x = cx + o[k];
    const y = cy + o[k + 1];
    if (inBounds(map, x, y)) s += f.get(x, y);
  }
  return s;
}

/** Last tick's returns with food in cell (cx, cy) and the six round it (behaviour MR 5). */
export function returnsAround(c: Colony, cx: number, cy: number): number {
  const g = c.returned;
  if (g.size === 0) return 0;
  const o = discOffsets(1)[cy & 1] as Int16Array;
  let s = 0;
  for (let k = 0; k < o.length; k += 2) s += g.get(cellKey(cx + o[k], cy + o[k + 1])) ?? 0;
  return s;
}

/**
 * Nestmates against strangers in ant i's cell and the six round it, as it feels them (behaviour MR 4): outnumbered
 * under two thirds as many, outnumbering over half as many again. Call after enemyHeading (strangers as it perceives
 * them). Leaves the shared CELL as it found it.
 */
export function odds(c: Colony, i: number): Odds {
  const g = c.enemies;
  const f = c.nestmates;
  if (!g || !f) return "even";
  const keepX = CELL[0];
  const keepY = CELL[1];
  c.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  const map = c.map;
  const o = discOffsets(1)[cy & 1] as Int16Array;
  let mine = 0;
  let them = 0;
  for (let k = 0; k < o.length; k += 2) {
    const x = cx + o[k];
    const y = cy + o[k + 1];
    if (!inBounds(map, x, y)) continue;
    mine += f.get(x, y);
    them += g.get(x, y);
  }
  CELL[0] = keepX;
  CELL[1] = keepY;
  mine = Math.max(1, mine);
  return mine > 1.5 * them ? "outnumbering" : mine * 1.5 < them ? "outnumbered" : "even";
}

/** The nearest cell holding enemies within enemyRange of ant i, as a heading, or null. */
export function enemyHeading(c: Colony, i: number): number | null {
  const g = c.enemies;
  if (!g) return null;
  // Strangers to this ant, as it perceives them: its own odour, its own tolerance.
  g.look?.(c.odour[i], c.tolerance[i]);
  const map = c.map;
  c.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  const ENEMY_RANGE = c.params.enemyRange;
  if (!g.any(cx - ENEMY_RANGE - 1, cy - ENEMY_RANGE, cx + ENEMY_RANGE + 1, cy + ENEMY_RANGE)) return null;
  // The hex disc round the ant: the nearest cell (by distance, not ring order) holding enough strangers to react to.
  const o = discOffsets(ENEMY_RANGE)[cy & 1] as Int16Array;
  const ax = c.x[i];
  const ay = c.y[i];
  let best = Infinity;
  let heading: number | null = null;
  for (let k = 0; k < o.length; k += 2) {
    const x = cx + o[k];
    const y = cy + o[k + 1];
    if (!inBounds(map, x, y) || g.get(x, y) < ENEMY) continue;
    const dx = centreX(x, y) - ax;
    const dy = centreY(y) - ay;
    const d = dx * dx + dy * dy;
    // Not through soil: a raider on the ground charged strangers in a tunnel under it, into the soil, for good (review of
    // #26: raiders stuck in the pits by the rival's mound, none in at its hole).
    if (d < best && (!c.map.hasSoil || c.clearTo(ax, ay, centreX(x, y), centreY(y)))) {
      best = d;
      heading = Math.atan2(dy, dx);
    }
  }
  return heading;
}
