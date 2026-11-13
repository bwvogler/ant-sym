// Digging and spoil (docs/refactor.md S3.3): picking up and putting down pellets, dropping spoil on the mound or the midden, backfilling stale tunnels, unburying, the crust and where a chamber is dug. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `self`.

import type { Colony, Corpse, HoleCell } from "./colony.ts";
import { NO_KEY } from "./ants.ts";
import { type Role } from "./chambers.ts";
import { NO_CELL, SOIL_DUG, SOIL_FILL, SOIL_LOOSE, cellKey, floorGround, keyX, keyY, stub } from "./grid.ts";
import { CELL, centreX, centreY, dirOf, hexDistance, nx as stepX, ny as stepY } from "./hex.ts";
import {
  CHAMBER_SCAN,
  ENTRANCE_ZONE,
  LOOSE_FILL_PICK,
  LOOSE_SPREAD,
  LOOSE_SPREAD_PICK,
  MIDDEN_MARK,
  MIDDEN_MIN,
  PLANE_STEEP,
  RECEPTION_ABOVE,
  STORE_BELOW,
  SWELL,
} from "./tuning.ts";
import { FAINT, PLANE } from "./vocab.ts";
import { OPEN, dropFood, fillCell, groundTop, heapMound, heapPlane, isSky, openCell, rockAt, takePlane, type Nest } from "./world.ts";
import { fromHomePlane } from "./homing.ts";

/** The middle of the midden: its column (side view). */
export function middenCol(self: Colony): number {
  return self.entranceCol + self.middenSide() * self.middenAt();
}

/**
 * Ant i dug its chamber face (x, y): it joins that chamber, or founds one. The face was chosen a while ago, and chambers
 * round it may have grown since, so it is judged again now it is open (review of slice 2: two chambers joined at 73 s
 * and 352 s on seed 5): if it would join another chamber, lie outside its chamber's rows, or lie too near the ground,
 * it stays a plain tunnel.
 */
export function chamberDug(self: Colony, i: number, x: number, y: number): void {
  const ch = self.map.chambers!;
  let id = self.chamberFor[i] - 1;
  if (id < 0) {
    if (!self.chamberRoom(x, y, y - self.soilTop(x)) || !self.chamberSpot(null, x, y)) return; // another was started near it meanwhile: a tunnel stub
    id = ch.add(self.params.nest, y, roleFor(self, y)).id;
  } else {
    const c = ch.list[id];
    if (!c || c.colony !== self.params.nest || !self.chamberSpot(c, x, y)) return;
  }
  ch.claim(id, x, y, openCell(self.map));
}

/**
 * Backfill: a pellet carrier at cell (cx, cy) drops its pellet into a neighbouring cell that nobody
 * uses, filling it back with soil, instead of hauling it all the way out. Leaf-cutting ants put most of
 * their soil back inside this way, refilling unused space (Pielström & Roces); harvester ants very
 * little (≈ 2.5 %, Tschinkel et al. 2015). A cell may be filled when:
 * - its open neighbours form one unbroken run (stub with BACKFILL.maxOpen), so no passage is cut;
 * - it smells unused against the path: its home + food scent is under staleBelow (judged from where
 *   the carrier stands, raised next to fresh pellets);
 * - it holds no food and no ant of either colony, and is not by any nest;
 * - it is not the cell this carrier dug its pellet from (that would undo its own dig), nor any cell dug in the
 *   last BACKFILL.young seconds: fresh digging is where the colony is going (tunnels toward food), not excess
 *   space. Leaf-cutters refill older galleries they no longer use (Pielström & Roces). Except the ground a
 *   chamber's floor stands on (see floorGround): filling a tunnel dug down out of a chamber builds its floor
 *   back, which is construction, not spare soil put away. Put back under a chamber cell, it stays (see builtFloor).
 */
export function backfill(self: Colony, i: number, cx: number, cy: number): boolean {
  const { map } = self;
  const home = self.ph.fields.home;
  const food = self.ph.fields.food;
  for (let d = 0; d < 6; d++) {
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if (cellKey(tx, ty) === self.lastDug[i]) continue; // the cell it just dug: not straight back in
    if (self.time - map.dugAt.get(tx, ty) < self.params.backfill.young && !floorGround(map, tx, ty)) continue; // dug lately: the live frontier, not excess
    if (rockAt(map, tx, ty) !== OPEN || !stub(map, tx, ty, self.params.backfill.maxOpen)) continue;
    if (map.food.get(tx, ty) > 0 || home.get(tx, ty) + food.get(tx, ty) >= staleBelow(self, cx, cy, tx, ty)) continue;
    self.enemies?.look?.(self.odour[i], -1); // any ant of another colony, stranger or not (a tolerance below 0 counts every band)
    if ((self.friends?.get(tx, ty) ?? 0) > 0 || (self.enemies?.get(tx, ty) ?? 0) > 0) continue;
    if (byANest(self, tx, ty)) continue;
    if (self.brood.items.some((b) => b.held < 0 && b.x === tx && b.y === ty)) continue; // brood lies there (a nurse died carrying it)
    if (self.entrance && (isSky(map, tx, ty) || self.byAnEntrance(tx, ty))) continue; // the ground line and the holes stay open
    // The grids are a tick old: a nestmate that stepped in earlier this tick isn't in them (and walling it
    // in would bury it). Rare enough (every other test passed) to look at each ant.
    if (occupied(self, tx, ty)) continue;
    if (!fillCell(map, tx, ty, self.time)) continue;
    // A fresh trip out from here. (Letting its trip clock run on instead, so it lays only faint home scent
    // this deep, was measured worse: it soon tires and walks home empty. Seeds 3, 4, 6–8: 12 % less food home.)
    if (self.soil[i] !== SOIL_DUG) self.looseFilled++;
    else self.soilFilled++;
    self.clearPellet(i);
    self.since[i] = 0;
    return true;
  }
  return false;
}

/**
 * The scent (home + food) below which cell (tx, ty), seen from the carrier's cell (cx, cy), counts as
 * unused. Scent diffuses into every side passage, so a fixed threshold (FAINT) finds almost nothing
 * unused (0.6 % of dug soil, MR 11); what an ant can tell is that a side passage smells far fainter than
 * the path it is on. Fresh pellets nearby raise it: workers build where building is going on (pellets
 * carry a building pheromone, Khuong et al. 2016; fresh pellets draw more work, Pielström & Roces 2013).
 */
export function staleBelow(self: Colony, cx: number, cy: number, tx: number, ty: number): number {
  const f = self.ph.fields;
  const here = f.home.get(cx, cy) + f.food.get(cx, cy);
  const base = Math.max(FAINT, self.params.backfill.staleRatio * here);
  // Never above the scent where it stands: a cell as busy as its own is in use, fresh pellets or not.
  return Math.min(base * (1 + self.params.backfill.pelletPull * pelletScent(self, tx, ty)), Math.max(base, here));
}

/** The smell of fresh pellets at cell (x, y): from the freshest fill among it and its neighbours, fading over BACKFILL.pelletTau seconds. */
export function pelletScent(self: Colony, x: number, y: number): number {
  const at = self.map.filledAt;
  let t = at.get(x, y);
  for (let d = 0; d < 6; d++) t = Math.max(t, at.get(stepX(x, y, d), stepY(y, d)));
  return t === -Infinity ? 0 : Math.exp(-(self.time - t) / self.params.backfill.pelletTau);
}

/**
 * A pellet carrier walking a stale branch (see enterStale) goes on along it, by the stalest way ahead (never
 * back), to its end, where it fills the last cell (backfill, on arriving beside it): unused branches are
 * filled back from the tip, a cell per pellet, as leaf-cutting ants refill the excess space they dug
 * (Pielström & Roces). Only early in the trip home (BACKFILL.staleSearch), so a carrier that finds nothing to
 * fill still gets home; at the branch's end with nothing filled (an ant in its last cell, say) it heads home.
 * Decided here, not in walkTunnel: a branch's first cells touch the tunnel it leaves, so they are no tunnel
 * cells. True while it walks the branch (its target cell is gx, gy).
 */
export function staleStep(self: Colony, i: number, step: number): boolean {
  const s = self.since[i];
  if (s <= self.params.backfill.after || s >= self.params.backfill.staleSearch) {
    self.staleWalk[i] = 0;
    return false;
  }
  const { map } = self;
  const x = self.x[i];
  const y = self.y[i];
  self.antCell(i);
  const hx = CELL[0];
  const hy = CELL[1];
  const gx = self.gx[i];
  const gy = self.gy[i];
  const live = gx !== NO_CELL && rockAt(map, gx, gy) === OPEN && hexDistance(gx, gy, hx, hy) <= 1;
  if (live && Math.hypot(centreX(gx, gy) - x, centreY(gy) - y) > step) return true; // on its way to the next cell
  const cx = live ? gx : hx;
  const cy = live ? gy : hy;
  const f = self.ph.fields;
  const ahead = self.gdir[i];
  let way = -1;
  let wayV = Infinity;
  for (const turn of [0, 1, -1, 2, -2]) {
    const d = (ahead + turn + 6) % 6;
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if (rockAt(map, tx, ty) !== OPEN) continue;
    const v = f.home.get(tx, ty) + f.food.get(tx, ty);
    if (v < wayV) {
      wayV = v;
      way = d;
    }
  }
  if (way < 0) {
    self.staleWalk[i] = 0;
    self.gx[i] = NO_CELL;
    return false;
  }
  self.gdir[i] = way;
  self.gx[i] = stepX(cx, cy, way);
  self.gy[i] = stepY(cy, way);
  return true;
}

/**
 * At a cell it has just entered, a pellet carrier that sees a far staler way than where it stands (a branch
 * nobody walks) now and then turns into it (BACKFILL.enterStale), to fill its end (see staleStep). Forks
 * are never tunnel cells on hexes (the branch's mouth sits beside the way on), so this is looked at on
 * arrival, not in walkTunnel. True if it turned in: its target cell (gx, gy) is the branch's first cell.
 *
 * Never back the way it came: home scent falls away from the nest along every path, so the cell behind
 * always smells fainter than here, and judged against here alone it passed for a stale branch (40 % of
 * turn-ins were straight reversals, MR 12's review). A branch must smell stale against the way it came
 * too: only then is it a side way nobody walks, not just the path's own far end.
 */
export function enterStale(self: Colony, i: number, cx: number, cy: number): boolean {
  const s = self.since[i];
  if (self.staleWalk[i] || s >= self.params.backfill.staleSearch) return false;
  const { map } = self;
  const f = self.ph.fields;
  // The way it came: the cell it looked from last, if that is beside it; else the way behind its heading.
  const from = self.cameFrom[i];
  let bx = keyX(from);
  let by = keyY(from);
  if (from === NO_KEY || hexDistance(bx, by, cx, cy) !== 1) {
    const back = dirOf(self.heading[i] + Math.PI);
    bx = stepX(cx, cy, back);
    by = stepY(cy, back);
  }
  let way = -1;
  let wayV = Infinity;
  for (let d = 0; d < 6; d++) {
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if ((tx === bx && ty === by) || rockAt(map, tx, ty) !== OPEN) continue;
    const v = f.home.get(tx, ty) + f.food.get(tx, ty);
    if (v < wayV) {
      wayV = v;
      way = d;
    }
  }
  if (way < 0) return false;
  const tx = stepX(cx, cy, way);
  const ty = stepY(cy, way);
  if (wayV >= staleBelow(self, cx, cy, tx, ty)) return false;
  if (rockAt(map, bx, by) === OPEN && wayV >= staleBelow(self, bx, by, tx, ty)) return false; // no staler than the path behind
  if (self.rng() >= self.params.backfill.enterStale) return false;
  self.staleWalk[i] = 1;
  self.gdir[i] = way;
  self.gx[i] = tx;
  self.gy[i] = ty;
  self.wall[i] = 0;
  return true;
}

export function chamberGoal(self: Colony, id: number): Nest {
  const ch = self.map.chambers;
  const c = ch?.list[id];
  if (!ch || !c || c.cells === 0) return self.nest;
  let g = self.goalCells.get(id);
  if (!g || g.cells !== c.cells) {
    const mx = c.sumX / c.cells;
    const my = c.sumY / c.cells;
    g = { cells: c.cells, x: centreX(Math.round(mx), Math.round(my)), y: centreY(Math.round(my)) };
    let best = Infinity;
    for (let y = Math.floor(my) - CHAMBER_SCAN; y <= Math.ceil(my) + CHAMBER_SCAN; y++)
      for (let x = c.x0; x <= c.x1; x++) {
        if (ch.at(x, y) !== id) continue;
        const d = (x - mx) ** 2 + (y - my) ** 2;
        if (d < best) {
          best = d;
          g.x = centreX(x, y);
          g.y = centreY(y);
        }
      }
    self.goalCells.set(id, g);
  }
  self.chamberNest.x = g.x;
  self.chamberNest.y = g.y;
  return self.chamberNest;
}

/** The role a new chamber with its floor on row y takes (its column plays no part): the colony's first one well above the royal chamber is reception; below it, store; else brood. */
export function roleFor(self: Colony, y: number): Role {
  const ch = self.map.chambers!;
  const mine = ch.list.filter((c) => c.colony === self.params.nest && c.cells > 0);
  const royal = mine.find((c) => c.role === "royal");
  if (!royal) return "brood";
  if (y < royal.floorRow - RECEPTION_ABOVE && !mine.some((c) => c.role === "reception")) return "reception";
  if (y > royal.floorRow + STORE_BELOW) return "store";
  return "brood";
}

/**
 * The side view: whether soil cell (x, y) is the ground line's crust (it touches the sky). Ants leave it: digging
 * it would undermine the walkway or hole the ground everywhere; the hole they keep is their entrance. Loose soil
 * (the mound) is no crust.
 */
export function crust(self: Colony, x: number, y: number): boolean {
  const ent = self.entrance;
  if (!ent) return false;
  if (self.map.loose?.get(x, y) === 1) return false; // the mound: loose pellets, never dug (picked up off its top: pickLoose)
  // Round the hole too: it is their way in already, and digging round it once hollowed the ground under the walkway
  // above the hole, which fell to sky and left the hole with no way out onto the ground.
  for (let d = 0; d < 6; d++) {
    const tx = stepX(x, y, d);
    const ty = stepY(y, d);
    // The ground under the mound is crust too: dug out under a blanket of spoil, the next pellet picked off the
    // top opened a new hole into the tunnels, away from every entrance (agent review of MR 15).
    if (isSky(self.map, tx, ty) || self.map.loose?.get(tx, ty) === 1) return true;
  }
  return false;
}

/**
 * The side view: an ant whose cell has become solid (spoil heaped on it, or round it by the other colony) climbs
 * out to an open neighbour, upward first; one left in the sky (the spoil under it picked up) drops to the ground. Six heaps round an ant, three a second by the hole, could otherwise
 * wall it in for good (agent review of MR 14: ants buried for the rest of the run).
 */
export function unbury(self: Colony, i: number): void {
  self.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  if (rockAt(self.map, cx, cy) === OPEN) return;
  // Never up into one world's surface rows (the plane's: crossUp is the only way there).
  const surface = self.map.surfaceRows ?? 0;
  for (const d of [4, 5, 3, 0, 2, 1]) {
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if (rockAt(self.map, tx, ty) !== OPEN || ty < surface) continue;
    self.x[i] = centreX(tx, ty);
    self.y[i] = centreY(ty);
    self.gx[i] = NO_CELL;
    self.digT[i] = 0;
    return;
  }
  // Buried deeper (several heaps in one tick), or left in the air (the mound taken from under it): up or down its
  // column to the ground line.
  const top = groundTop(self.map, cx) - 1;
  if (top >= surface && top !== cy && rockAt(self.map, cx, top) === OPEN) {
    self.x[i] = centreX(cx, top);
    self.y[i] = centreY(top);
    self.gx[i] = NO_CELL;
    self.digT[i] = 0;
  }
}

/** Whether cell (x, y) is within a nest's radius + 2 (any colony's: a rival's chamber is no dead end to fill either). */
export function byANest(self: Colony, x: number, y: number): boolean {
  if ((self.map.chambers?.at(x, y) ?? -1) >= 0) return true; // a chamber is never filled
  for (const n of self.map.nests ?? [self.nest]) if (Math.hypot(centreX(x, y) - n.x, centreY(y) - n.y) < n.r + 2) return true;
  return false;
}

/**
 * The side view: drop ant i's pellet on the ground where it stands, in column `col`: heaped there and slid
 * downhill to the angle of repose. A dug pellet is the soil brought out (soilOut), every whole cell of it
 * (× SWELL) heaped; a loose one, moved, is one cell back on the mound.
 */
export function dropOut(self: Colony, i: number, col: number): void {
  const { map, ph } = self;
  if (self.corpse[i]) {
    // On the midden: the corpse lies on the ground there, and the midden smells of the colony (a boundary: see raids).
    // A carrier that gave up short of it (SPOIL_GIVE_UP) leaves the corpse lying, unmarked, for another to take on.
    const row = groundTop(map, col) - 1;
    const onMidden = Math.abs(col - middenCol(self)) <= 3;
    for (let n = self.corpses.length - 1; n >= 0; n--) {
      const k = self.corpses[n] as Corpse;
      if (k.held !== i) continue;
      k.held = -1;
      k.x = col;
      k.y = row;
      if (onMidden) {
        self.corpses.splice(n, 1);
        const key = cellKey(col, row);
        self.midden.set(key, (self.midden.get(key) ?? 0) + 1);
        self.markMidden(col, MIDDEN_MARK);
        self.buried++;
        self.onBury?.(k);
      }
    }
    self.clearPellet(i);
    return;
  }
  const side = (self.spoilSide[i] || 1) as -1 | 1;
  const heap = (): void => {
    const cell =
      heapMound(map, self.entranceCol, side, 0, self.holes, col) ??
      heapMound(map, self.entranceCol, side === 1 ? -1 : 1, 0, self.holes, col);
    if (!cell) {
      self.moundLost++;
      return;
    }
    // The trail lying on the walkway cell just buried rides up onto the new one above it, so heaps don't cut trails.
    for (const ch of ["food", "home"] as const) {
      const v = ph.fields[ch].get(cell[0], cell[1]);
      const above = ph.fields[ch].get(cell[0], cell[1] - 1);
      if (v > above) ph.depositCell(ch, cell[0], cell[1] - 1, v - above);
    }
  };
  if (self.soil[i] !== SOIL_DUG) {
    self.looseDropped++;
    heap();
  } else {
    self.soilOut++;
    const due = Math.floor(self.soilOut * SWELL + 1e-9); // counted, not summed: 1.2 added five times isn't 6 in floats
    while (self.heaped < due) {
      self.heaped++;
      heap();
    }
  }
  self.clearPellet(i);
  self.since[i] = 0;
}

/**
 * One world's plane (U3c): whether ant i, at plane cell (cx, cy), is out on its midden ring: at least MIDDEN_MIN from
 * home by its own vector, and off the mound (no spoil underfoot, which it can feel). With the plane bound.
 */
export function onMiddenRing(self: Colony, i: number, cx: number, cy: number): boolean {
  return fromHomePlane(self, i) >= MIDDEN_MIN && (self.map.spoil?.get(cx, cy) ?? 0) === 0;
}

/** One world: every nest's hole on the plane (its cell), whose ring no mound fills (heapPlane). */
export function planeHoles(self: Colony): { x: number; y: number }[] {
  return self.holeCells.map((h) => ({ x: h.px, y: h.py }));
}

/**
 * One world's plane (U3c): ant i puts down the pellet or corpse it carries out where it stands, with the plane bound.
 * Spoil is heaped there (heapPlane: it slides to the angle of repose, clear of every hole's ring), counted as dropOut
 * counts it: a dug pellet is soil brought out (soilOut), every whole cell of it × SWELL heaped; a loose one is one back
 * on the mound. A corpse goes on the midden there (U3c's stopgap: a ring set by the ant's own vector; one pile by corpse
 * scent is a follow-up), marked on the plane's scent, and a sporulating host's spores land there (onBury).
 * `atWill`: put down by the ant's own answer (carry "put down", contact "drop and run"), not at the end of its walk out.
 * Then a corpse goes on the midden only out on its ring (onMiddenRing); anywhere else it lies on the plane, unmarked,
 * as a corpse whose carrier died there does (owner, 2026-11-09, review of #61 D1).
 */
export function dropPlane(self: Colony, i: number, atWill = false): void {
  self.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  if (self.corpse[i]) {
    const midden = !atWill || onMiddenRing(self, i, cx, cy);
    for (let n = self.corpses.length - 1; n >= 0; n--) {
      const k = self.corpses[n] as Corpse;
      if (k.held !== i) continue;
      k.held = -1;
      k.x = cx;
      k.y = cy;
      k.layer = PLANE;
      if (!midden) continue; // it lies here
      self.corpses.splice(n, 1);
      const key = cellKey(cx, cy);
      self.midden.set(key, (self.midden.get(key) ?? 0) + 1);
      self.markMiddenPlane(cx, cy, MIDDEN_MARK);
      self.buried++;
      self.onBury?.(k, PLANE);
    }
    self.clearPellet(i);
    return;
  }
  const holes = planeHoles(self);
  const heap = (): void => {
    if (!heapPlane(self.map, cx, cy, holes)) self.moundLost++;
  };
  if (self.soil[i] !== SOIL_DUG) {
    self.looseDropped++;
    heap();
  } else {
    self.soilOut++;
    const due = Math.floor(self.soilOut * SWELL + 1e-9);
    while (self.heaped < due) {
      self.heaped++;
      heap();
    }
  }
  self.clearPellet(i);
  self.since[i] = 0;
}

/**
 * One world's plane (U3c): the side view's pickLoose on the plane's height field. An explorer on a mound cell, not
 * within ENTRANCE_ZONE of any hole, now and then picks a pellet off it: from a flank at the angle of repose (a cell out
 * from its hole a level lower or more beside it), LOOSE_SPREAD_PICK, to carry it LOOSE_SPREAD × (0.5 + u) farther out by
 * its vector and heap it there; from anywhere on it, LOOSE_FILL_PICK, to take it home and down to backfill (ja-lft).
 * Asked by the `get` response with soil offered, as pickLoose is. True if it picked one up. With the plane bound.
 */
export function pickPlane(self: Colony, i: number, cx: number, cy: number, enemy: boolean): boolean {
  const { map } = self;
  const spoil = map.spoil;
  if (!spoil) return false;
  const here = spoil.get(cx, cy);
  if (here === 0) return false;
  const u = self.rng();
  if (u >= LOOSE_SPREAD_PICK + LOOSE_FILL_PICK) return false;
  const fill = u < LOOSE_FILL_PICK;
  const hc = self.holeCells[self.params.nest] as HoleCell;
  for (const h of self.holeCells)
    if (Math.hypot(centreX(cx, cy) - centreX(h.px, h.py), centreY(cy) - centreY(h.py)) < ENTRANCE_ZONE) return false;
  if (!fill) {
    const out = hexDistance(cx, cy, hc.px, hc.py);
    let steep = false;
    for (let d = 0; d < 6 && !steep; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      steep = hexDistance(tx, ty, hc.px, hc.py) > out && rockAt(map, tx, ty) === OPEN && spoil.get(tx, ty) <= here - PLANE_STEEP;
    }
    if (!steep) return false;
  }
  if (!self.responses.get(self.touch(i, enemy, self.mode[i], "none", "soil"))) return false;
  if (!takePlane(map, cx, cy)) return false;
  self.pellet[i] = 1;
  self.soil[i] = fill ? SOIL_FILL : SOIL_LOOSE;
  self.loosePicked++;
  self.since[i] = 0;
  self.homeAfresh(i);
  self.gx[i] = NO_CELL;
  if (fill) self.looseDown++;
  else {
    // Away from where its vector says home is, farther out by LOOSE_SPREAD on average.
    const odo = self.odoSurf[i];
    const bx = self.nest.x + odo * self.driftSurf[i];
    const by = self.nest.y + odo * self.driftSurfY[i];
    self.spoilA[i] = Math.atan2(self.y[i] - by, self.x[i] - bx);
    self.spoilTo[i] = fromHomePlane(self, i) + LOOSE_SPREAD * (0.5 + self.rng());
    self.spoilT[i] = 0;
  }
  return true;
}

/**
 * Ant i puts its load down where it stands (its carry response said so). Food lies on the ground for anyone to take
 * (a porter's only in one of its chambers, where it is stocked: it was counted home already, and on the floor a
 * forager would bring it home twice); soil and corpses only on the ground (soil heaps there, a corpse lies there, or
 * goes on the midden if that is where it is; underground the walls have no room for them); brood where it is.
 * What it can't put down here it keeps.
 */
export function putDown(self: Colony, i: number): void {
  self.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  if (self.carrying[i]) {
    if (self.porter[i]) {
      const here = self.map.chambers ? self.map.chambers.at(cx, cy) : -1;
      const c = here >= 0 ? self.map.chambers!.list[here]! : null;
      if (!c || c.colony !== self.params.nest) return;
      self.stock(c, 1);
      self.portTrips++;
      self.inJaws -= 1;
      self.porter[i] = 0;
      self.portTo[i] = -1;
    } else {
      dropFood(self.map, self.x[i], self.y[i], 1, self.quality[i]);
      self.putAt[i] = cellKey(cx, cy);
    }
    self.carrying[i] = 0;
  } else if (self.pellet[i]) {
    if (self.line !== null && self.cur === PLANE)
      dropPlane(self, i, true); // one world's plane: spoil heaped where it stands, a corpse on the midden if out on its ring
    else if (!self.entrance) {
      // Top-down: a pellet is only a count: put down at the nest it is soil out (as the nest branch counts it), elsewhere lost.
      const dx = self.x[i] - self.nest.x;
      const dy = self.y[i] - self.nest.y;
      if (dx * dx + dy * dy < self.nest.r * self.nest.r) self.soilOut++;
      else self.soilLost++;
      self.clearPellet(i);
    } else if (isSky(self.map, cx, cy)) dropOut(self, i, cx);
    else return;
  } else if (self.broodHeld[i]) self.dropBrood(i);
  self.mx[i] = NaN;
  self.gx[i] = NO_CELL;
}

/** Whether any of this colony's ants stands in cell (x, y) now. */
export function occupied(self: Colony, x: number, y: number): boolean {
  for (let j = 0; j < self.n; j++) {
    if (!self.alive[j]) continue;
    self.antCell(j);
    if (CELL[0] === x && CELL[1] === y) return true;
  }
  return false;
}
