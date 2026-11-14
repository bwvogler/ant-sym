// Work in the nest (docs/refactor.md S3.3): porters stock food, nurses carry brood, undertakers take the dead to the midden, and the nest's life (eclosion, castes, alates leaving). Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `col`.

import type { Colony } from "./colony.ts";
import { EGG, GYNE, LARVA, LARVA_FOOD, PUPA, foodOf, isFed, owed, type BroodItem } from "./brood.ts";
import { type Chamber } from "./chambers.ts";
import { NO_CELL, keyX, keyY } from "./grid.ts";
import { CELL, cellOf, centreX, centreY, discOffsets, hexDistance, nx as stepX, ny as stepY } from "./hex.ts";
import {
  ADULT_BEG_BELOW,
  EAT_BELOW,
  ENERGY_PER_FOOD,
  LARVA_DRAIN,
  LARVA_ENERGY_PER_FOOD,
  QUEEN_DRAIN,
  THETA_OLD,
  respond,
} from "./hunger.ts";
import {
  ALATE_FEED,
  ALATE_RESERVE,
  ALATE_STEP,
  ALATE_WAIT,
  BIPOTENT,
  CULL_CUE,
  CULL_MARK,
  GYNE_CUE,
  GYNE_ENERGY,
  GYNE_MARK,
  GYNE_PANTRY,
  GYNE_SPACING,
  GYNE_TIME_X,
  type Alate,
} from "./royal.ts";
import {
  CORPSE_ROT,
  CROWN_RATE,
  EGG_FOOD,
  FEED_RATE,
  HOLD_MAX,
  LAY_INTERVAL,
  MIDDEN_MARK,
  MIDDEN_NEAR,
  PICK_BROOD,
  PICK_CORPSE,
  PORT_RATE,
  QUEEN_FIGHT,
  QUEEN_MARK,
  QUEEN_STOCK,
  RECEPTION_MIN,
  STORE_AFTER,
  T_EGG,
  T_LARVA,
  T_PUPA,
} from "./tuning.ts";
import { ENEMY, EXPLORE, FIGHT, FOLLOW, RETURN } from "./vocab.ts";
import { restFetches } from "./tunnel.ts";
import { isSky } from "./world.ts";
import { climbOut } from "./homing.ts";
import { around, touch } from "./sense.ts";
import { ageWorkers, dropBrood } from "./body.ts";

export function portView(col: Colony): void {
  if (col.portViewAt === col.time) return;
  col.portViewAt = col.time;
  const want = col.want;
  const en = col.enRouteTo;
  want.clear();
  en.clear();
  for (const b of col.brood.items)
    if (b.held < 0 && b.chamber >= 0 && b.stage !== PUPA && col.map.chambers!.list[b.chamber]!.colony === col.params.nest)
      want.set(b.chamber, (want.get(b.chamber) ?? 0) + owed(b));
  if (col.queen?.alive)
    for (const r of col.map.chambers!.list)
      if (r.colony === col.params.nest && r.role === "royal") want.set(r.id, (want.get(r.id) ?? 0) + QUEEN_STOCK);
  // Hungry adults (ja-xu6.1): each wants a meal brought to the chamber it is in (not a brood chamber, whose food is the
  // larvae's): porters took food only to the brood and the queen, and a crowd starved beside a full store.
  const chs = col.map.chambers!;
  for (let i = 0; i < col.n; i++) {
    if (!col.alive[i] || !col.under[i] || col.energy[i] >= ADULT_BEG_BELOW) continue;
    col.antCell(i);
    const id = chs.at(CELL[0], CELL[1]);
    const r = id >= 0 ? chs.list[id] : undefined;
    if (r && r.colony === col.params.nest && r.role !== "brood" && r.role !== "store")
      want.set(id, (want.get(id) ?? 0) + 1 / ENERGY_PER_FOOD);
  }
  for (let i = 0; i < col.n; i++) {
    const to = col.portTo[i];
    if (to >= 0 && col.alive[i] && col.carrying[i]) en.set(to, (en.get(to) ?? 0) + 1);
  }
}

/** The chamber (not `from`) that wants food most: its brood's unmet needs, or the queen's stock, less what lies there and what porters are taking there; −1 if none. */
export function wanted(col: Colony, from: number): number {
  const ch = col.map.chambers!;
  portView(col);
  let to = -1;
  let most = 0;
  for (const [id, w] of col.want) {
    const d = w - ch.list[id]!.food - (col.enRouteTo.get(id) ?? 0);
    if (d > most && id !== from) {
      most = d;
      to = id;
    }
  }
  return to;
}

/**
 * A porter at cell (cx, cy) not by its target chamber: another of the colony's chambers it is in or beside where it puts
 * its food down instead, or −1. One of the target's role that wants food itself: road signs are by role, so the brood
 * mark leads to the nearest brood chamber, not to the one chosen (a porter circled one 24 columns away that it never
 * reached: seed 2, F1's runs). After HOLD_MAX seconds carrying, any of its chambers, like a nurse with brood; by
 * none then, it takes the food to the royal chamber instead (the nest's heart, where the road signs lead), never
 * down on a tunnel's floor, where a forager would bring it "home" a second time.
 */
export function portInstead(col: Colony, i: number, cx: number, cy: number, target: number, dt: number): number {
  const ch = col.map.chambers!;
  const role = ch.list[target]!.role;
  const late = (col.holdT[i] = col.holdT[i] + dt) > HOLD_MAX;
  for (let d = -1; d < 6; d++) {
    const id = d < 0 ? ch.at(cx, cy) : ch.at(stepX(cx, cy, d), stepY(cy, d));
    if (id < 0 || id === target) continue;
    const c = ch.list[id]!;
    if (c.colony !== col.params.nest) continue;
    if (late) return id;
    if (c.role === role) {
      portView(col);
      if ((col.want.get(id) ?? 0) - c.food - (col.enRouteTo.get(id) ?? 0) > 0) return id;
    }
  }
  if (late && role !== "royal") {
    const royal = ch.list.find((c) => c.colony === col.params.nest && c.role === "royal");
    if (royal) {
      col.enRouteTo.set(target, (col.enRouteTo.get(target) ?? 1) - 1);
      col.enRouteTo.set(royal.id, (col.enRouteTo.get(royal.id) ?? 0) + 1);
      col.portTo[i] = royal.id;
      col.holdT[i] = 0;
      col.homeAfresh(i);
      col.gx[i] = NO_CELL;
    }
  }
  return -1;
}

/** Ant i, carrying food at home, carries it on to chamber `to` as a porter (its food is the colony's, in its jaws). */
export function becomePorter(col: Colony, i: number, to: number): void {
  col.inJaws += 1;
  col.carrying[i] = 1;
  col.porter[i] = 1;
  col.portTo[i] = to;
  col.holdT[i] = 0;
  col.enRouteTo.set(to, (col.enRouteTo.get(to) ?? 0) + 1);
  col.mode[i] = RETURN;
  col.homeAfresh(i);
  col.gx[i] = NO_CELL;
}

/**
 * Food flow inside the nest (slice 5): a carrier in the chamber it takes its food to puts it down there; an idle ant
 * in reception with food there takes some to the chamber that wants it most (brood, or the queen's stock), else down
 * to a store; an idle ant in a store, or in the royal chamber with more than the queen's stock, takes some to where it
 * is wanted. A forager arriving at reception with food already waiting there (the porters aren't keeping up) carries
 * its own on to where it is wanted.
 */
export function port(col: Colony, i: number, dt: number, enemy = false): boolean {
  const ch = col.map.chambers!;
  col.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  let here = ch.at(cx, cy);
  if (col.carrying[i]) {
    const target = col.foodTo(i);
    if (target < 0) return false; // no chamber to take it to (a colony always has its royal one: can't happen)
    // In its chamber, or beside it (a store a cell or two wide is passed by more often than stood in: review of slice 5).
    if (here !== target) {
      const standing = here;
      here = -1;
      // (Porters only: a forager put down beside its chamber is an explorer in a tunnel, and dug at its ends.)
      if (col.porter[i]) {
        for (let d = 0; d < 6 && here < 0; d++) if (ch.at(stepX(cx, cy, d), stepY(cy, d)) === target) here = target;
        if (here < 0) here = portInstead(col, i, cx, cy, target, dt);
      } else if (standing >= 0 && col.since[i] > STORE_AFTER) {
        // A forager long on its way (ja-3ifx: food from a pocket the nest's own tunnels opened, its chamber a maze away)
        // puts its food down in the first of its colony's food chambers it stands in: a store, reception (once it is
        // RECEPTION_MIN cells, as foodTo: a smaller one chokes) or the queen's. Porters carry it on to where it is wanted.
        const c = ch.list[standing]!;
        const takes = c.role === "store" || c.role === "royal" || (c.role === "reception" && c.cells >= RECEPTION_MIN);
        if (c.colony === col.params.nest && takes) here = standing;
      }
      if (here < 0) return false;
    }
    const c = ch.list[here]!;
    if (!col.porter[i] && c.role === "reception" && c.food >= 1) {
      // Food waiting here already: the porters aren't keeping up. The forager carries its own on (a seed harvester's
      // foragers drop seeds in the top chambers; with a backlog there, a larva starved below while food piled up).
      const to = wanted(col, here);
      if (to >= 0) {
        col.stored++;
        col.handedOn++;
        becomePorter(col, i, to);
        return false;
      }
    }
    if (!col.responses.drop(touch(col, i, enemy, col.mode[i], "food"))) return false;
    col.carrying[i] = 0;
    col.stock(c, 1);
    if (col.porter[i]) (col.portTrips++, (col.inJaws -= 1));
    else col.stored++;
    col.portTo[i] = -1;
    col.porter[i] = 0;
    col.mode[i] = EXPLORE;
    col.asked[i] = -1;
    col.question[i] = -1;
    col.since[i] = 0;
    return true; // put down: it turns back (the tick turns it: its heading is written after)
  }
  if (
    (col.mode[i] !== EXPLORE && !restFetches(col, i, col.mode[i], cx, cy)) ||
    col.pellet[i] ||
    col.broodHeld[i] ||
    isSky(col.map, cx, cy) ||
    col.rng() > PORT_RATE * dt ||
    !worksInside(col, i)
  )
    return false;
  // Food it can reach: in the reception or store it stands in, or one within two cells (a chamber a cell wide is
  // passed by more often than stood in); in the royal chamber, what is beyond the queen's stock (food a forager brought
  // there, with no reception of RECEPTION_MIN cells yet).
  const stocked = (id: number) => {
    const k = id >= 0 ? ch.list[id]! : undefined;
    return (
      k !== undefined &&
      k.colony === col.params.nest &&
      (((k.role === "reception" || k.role === "store") && k.food >= 1) || (k.role === "royal" && k.food >= QUEEN_STOCK + 1))
    );
  };
  if (!stocked(here)) {
    here = -1;
    const o = discOffsets(2)[cy & 1] as Int16Array;
    for (let k = 2; k < o.length && here < 0; k += 2) {
      const id = ch.at(cx + o[k], cy + o[k + 1]);
      if (stocked(id)) here = id;
    }
    if (here < 0) return false;
  }
  const c = ch.list[here]!;
  // Where food is wanted: each chamber's brood's unmet needs (and the queen's next eggs), less what lies there and
  // what porters are already taking there (worked out once a tick).
  let to = wanted(col, here);
  // Nothing wanted: reception's food (and the royal chamber's beyond her stock) goes down to a store (the least
  // stocked, counting what porters are already taking there), as harvesters keep their seeds deep. Counted by what
  // lay there alone, a store nobody reached stayed least stocked and drew every porter: 41 at once held food over
  // 120 s, all for one single-cell store (F1's runs, PRD §40).
  if (to < 0 && c.role !== "store") {
    portView(col);
    let least = Infinity;
    for (const s of ch.list) {
      if (s.colony !== col.params.nest || s.role !== "store" || s.cells === 0) continue;
      const stock = s.food + (col.enRouteTo.get(s.id) ?? 0);
      if (stock < least) {
        least = stock;
        to = s.id;
      }
    }
  }
  if (to < 0 || to === here) return false;
  col.stock(c, -1);
  becomePorter(col, i, to);
  return false;
}

/**
 * A nurse (nest slice 4): an idle ant in its royal chamber picks up an egg lying near it and takes it to the brood
 * chamber with the least brood; there, it lays it down. Its brood goes where it goes.
 */
export function nurse(col: Colony, i: number, dt: number, enemy: boolean): void {
  const ch = col.map.chambers!;
  col.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  if (col.broodHeld[i]) {
    for (const b of col.brood.items)
      if (b.held === i) {
        b.x = cx;
        b.y = cy;
      }
    // In its chamber, or beside it (a chamber a cell or two wide can be passed by), it puts the brood down there;
    // holding it too long (lost round a ring of tunnels: review of slice 4), wherever it is (a held larva goes unfed).
    const to = col.broodTo[i];
    if (ch.at(cx, cy) === to) dropBrood(col, i);
    else {
      for (let d = 0; d < 6; d++) {
        const ax = stepX(cx, cy, d);
        const ay = stepY(cy, d);
        if (ch.at(ax, ay) === to) {
          dropBrood(col, i, ax, ay);
          return;
        }
      }
      if ((col.holdT[i] = col.holdT[i] + dt) > HOLD_MAX) dropBrood(col, i);
    }
    return;
  }
  // Zoned by age (slice 6): the young nurse; the middle-aged also take in stray brood; the old forage.
  if (
    col.mode[i] !== EXPLORE ||
    col.carrying[i] ||
    col.pellet[i] ||
    isSky(col.map, cx, cy) ||
    col.rng() > PICK_BROOD * dt ||
    !worksInside(col, i)
  )
    return;
  const inRoyal = col.placeAt(cx, cy) === "royal" && col.band(i) === 0;
  let to = -1;
  let least = Infinity;
  let royal = -1;
  for (const c of ch.list) {
    if (c.colony !== col.params.nest || c.cells === 0) continue;
    if (c.role === "brood" && c.brood < least) ((least = c.brood), (to = c.id));
    if (c.role === "royal") royal = c.id;
  }
  // Eggs by the queen go to a brood chamber (with none yet, brood stays with her); brood lying outside any chamber
  // (a nurse put it down on the way, or died carrying it: unfed there) is taken in from anywhere, to the queen if
  // there is no brood chamber (review of slice 5: stray larvae starved for good).
  for (const b of col.brood.items)
    if (b.held < 0 && hexDistance(b.x, b.y, cx, cy) <= 2 && ((inRoyal && b.stage === EGG && to >= 0) || b.chamber < 0)) {
      if (to < 0) to = royal;
      if (to < 0) return;
      if (!col.responses.get(touch(col, i, enemy, col.mode[i], "none", "brood"))) return;
      b.held = i;
      if (b.chamber >= 0) ch.list[b.chamber]!.brood--;
      b.chamber = -1;
      col.broodHeld[i] = 1;
      col.broodTo[i] = to;
      col.holdT[i] = 0;
      col.homeAfresh(i);
      col.gx[i] = NO_CELL;
      return;
    }
}

/**
 * An undertaker (slice 7): an idle middle-aged ant underground with a corpse lying within two cells picks it up and
 * carries it out like spoil, up the shaft and along the ground, to the midden. `calm`: no enemy is near it.
 */
export function undertake(col: Colony, i: number, dt: number, calm: boolean): void {
  if (col.corpses.length === 0 || col.carrying[i] || col.pellet[i] || col.broodHeld[i]) return;
  const mode = col.mode[i];
  // A raiding colony's middle-aged are all fighters (raid stance): one with no enemy near, still in its own nest, buries
  // its dead too (review of #26: a raiding colony buried nothing, and its dead lay in its own chambers).
  if (mode !== EXPLORE && mode !== FOLLOW && !(mode === FIGHT && calm && col.under[i] && col.band(i) === 1)) return;
  if (col.rng() > PICK_CORPSE * dt) return;
  col.antCell(i);
  const cx = CELL[0];
  const cy = CELL[1];
  // Inside, the middle-aged do it; on the ground near the hole (fights fall there too), whoever is out.
  const outside = isSky(col.map, cx, cy);
  if (outside ? Math.abs(cx - col.entranceCol) > MIDDEN_NEAR : col.band(i) !== 1 || (mode === FIGHT && !col.inOwnNest(cx, cy))) return;
  for (const k of col.corpses)
    if (k.held < 0 && (k.layer ?? col.home) === col.cur && hexDistance(k.x, k.y, cx, cy) <= 2) {
      if (!col.responses.get(touch(col, i, !calm, mode, "none", "corpse"))) return;
      k.held = i;
      col.clearPellet(i);
      col.corpse[i] = 1;
      col.pellet[i] = 1;
      if (outside) {
        // Already out: straight along the ground to the midden (it won't come up out of the hole, where that is set).
        // From past the midden, back toward it: carried out from there, it was put down at once where it lay, off the
        // midden, and picked up again (review of #26: one corpse nine times).
        const side = col.middenSide();
        const past = side * (cx - col.entranceCol) > col.middenAt();
        col.spoilTo[i] = past ? -col.middenAt() : col.middenAt();
        col.spoilSide[i] = past ? -side : side;
        col.spoilT[i] = 0;
      }
      col.mode[i] = RETURN;
      col.homeAfresh(i);
      col.gx[i] = NO_CELL;
      return;
    }
}

/**
 * The midden keeps smelling of the colony while corpses lie on it (a tenth of MIDDEN_MARK a second each, up to 20 counted).
 * One world's midden is the plane's (U3c): its cells are plane cells, marked on the plane's scent.
 */
export function middenSmell(col: Colony, dt: number): void {
  for (let k = col.corpses.length - 1; k >= 0; k--) {
    const c = col.corpses[k]!;
    if (c.held < 0 && col.time - c.died > CORPSE_ROT) col.corpses.splice(k, 1); // off the midden, it rots (the buried are counted in `midden`)
  }
  for (const k of col.corpses)
    if (k.held >= 0) {
      // Carried: it goes where its undertaker goes, on its layer.
      col.antCell(k.held);
      k.x = CELL[0];
      k.y = CELL[1];
      if (col.line !== null) k.layer = col.layer[k.held];
    }
  let left = 20;
  for (const [key, count] of col.midden) {
    if (left <= 0) break;
    const n = Math.min(left, count);
    left -= n;
    if (col.line !== null) col.markMiddenPlane(keyX(key), keyY(key), MIDDEN_MARK * dt * 0.1 * n);
    else col.markMidden(keyX(key), MIDDEN_MARK * dt * 0.1 * n);
  }
}

/**
 * Whether ant i answers the hunger it feels by working inside (carrying food in, taking in brood): the young and
 * middle-aged always may, as before; an old one (age band 2, a forager) with the chance respond(need, THETA_OLD)
 * a step it is asked (ja-xu6.1). Before, the old never did, and when births stalled nobody carried food to the brood.
 */
export function worksInside(col: Colony, i: number): boolean {
  if (col.band(i) !== 2) return true;
  const s = col.need[i];
  return s > 0 && col.rng() < respond(s, THETA_OLD);
}

/**
 * The colony's life cycle, once a tick (the side view): workers age and die; the queen, alive, lays an egg every
 * LAY_INTERVAL while food is in the larder and there is room for more workers; eggs hatch into larvae, nurses near a
 * larva feed it from the larder, a fed larva pupates, and a pupa becomes a worker where it lies.
 */
export function nestLife(col: Colony, dt: number): void {
  const ch = col.map.chambers!;
  const p = col.params;
  ageWorkers(col, dt);
  const q = col.queen!;
  if (q.alive) {
    cellOf(q.x, q.y);
    const qx = CELL[0];
    const qy = CELL[1];
    // Her pheromone: the royal mark, strongest where she lies, drawing nurses to her.
    // × her signal: the fungus in her can damp it (its queen-signal lever, ja-lo8.7; 1 as she is).
    col.ph.depositCell("royal", qx, qy, QUEEN_MARK * q.signal * dt);
    // Strangers at her side kill her (a raid that reaches the royal chamber).
    const g = col.enemies;
    if (g) {
      g.look?.(col.nestOdour, p.tolerance);
      let strangers = 0;
      const o = discOffsets(1)[qy & 1] as Int16Array;
      for (let k = 0; k < o.length; k += 2) strangers += g.get(qx + o[k], qy + o[k + 1]);
      if (strangers >= ENEMY && col.rng() < 1 - Math.exp(-QUEEN_FIGHT * strangers * dt)) q.alive = false;
    }
  }
  // The fungus's crown (nest slice 8, lethal): a host running it kills the queen and the brood it touches, each at
  // CROWN_RATE × its regicide (its load) a second: the spores it passes on as it tends them (at once, spores painted
  // on the royal chamber orphaned the colony in its first second; from a high load only, grooming kept every host
  // below it within seconds and no queen ever died: review of #27).
  for (let i = 0; i < col.n; i++) {
    const r = col.regicide[i];
    if (!col.alive[i] || r <= 0 || !col.under[i]) continue; // the queen and brood are underground
    const crown = 1 - Math.exp(-CROWN_RATE * r * dt);
    col.antCell(i);
    const hx = CELL[0];
    const hy = CELL[1];
    if (q.alive) {
      cellOf(q.x, q.y);
      if (hexDistance(hx, hy, CELL[0], CELL[1]) <= 1 && col.rng() < crown) q.alive = false;
    }
    for (let k = col.brood.items.length - 1; k >= 0; k--) {
      const b = col.brood.items[k] as BroodItem;
      if (b.held < 0 && hexDistance(hx, hy, b.x, b.y) <= 1 && col.rng() < crown) {
        if (b.chamber >= 0) ch.list[b.chamber]!.brood--;
        col.brood.items.splice(k, 1);
        col.broodKilled++;
      }
    }
  }
  if (q.alive) {
    cellOf(q.x, q.y);
    const qx = CELL[0];
    const qy = CELL[1];
    // Her own energy (ja-xu6.1): she eats from what lies in her chamber; at 0 she dies.
    {
      const royalC = ch.list[ch.at(qx, qy)];
      q.energy -= QUEEN_DRAIN * dt;
      if (q.energy < EAT_BELOW && royalC) {
        const bite = Math.min(royalC.food, (1 - q.energy) / ENERGY_PER_FOOD);
        if (bite > 0) {
          col.stock(royalC, -bite);
          col.eaten += bite;
          q.energy += bite * ENERGY_PER_FOOD;
        }
      }
      if (q.energy <= 0) {
        q.energy = 0;
        q.alive = false;
      }
    }
    col.layT += dt;
    // She lays only while the larder holds, beyond what the brood already laid will be fed, a whole worker's food:
    // eggs laid into an empty larder starve as larvae.
    let due = col.brood.owed();
    while (q.alive && col.layT >= LAY_INTERVAL) {
      col.layT -= LAY_INTERVAL;
      const royalC = ch.list[ch.at(qx, qy)];
      if (
        col.larder + col.inJaws < due + EGG_FOOD + LARVA_FOOD ||
        col.population + col.brood.size >= p.maxAnts ||
        !royalC ||
        royalC.food < EGG_FOOD
      ) {
        col.layT = 0;
        break;
      }
      col.stock(royalC, -EGG_FOOD); // she eats from what lies in her chamber
      due += LARVA_FOOD;
      const at = ch.at(qx, qy);
      col.brood.add(qx, qy, at).nanitic = col.founding;
      if (at >= 0) ch.list[at]!.brood++;
    }
  }
  for (let k = col.brood.items.length - 1; k >= 0; k--) {
    const b = col.brood.items[k] as BroodItem;
    b.t += dt;
    if (b.stage === EGG && b.t >= T_EGG) {
      b.stage = LARVA;
      b.t = 0;
    } else if (b.stage === LARVA) {
      // It uses energy as it waits (ja-xu6.1): unfed for long, it begs (body), and at 0 it dies.
      b.energy -= LARVA_DRAIN * dt;
      const pantry = b.chamber >= 0 ? ch.list[b.chamber] : undefined;
      const food = foodOf(b);
      if (b.held < 0 && b.fed < food && pantry && pantry.food > 0) {
        // Fed by the nurses round it (the colony's own ants within two cells), from the food lying in its chamber:
        // to its energy first, the rest to its growth. A young colony's queen feeds the brood by her: all of her first
        // brood while she founds alone (ja-lo8.9), then what her nanitics, out foraging, leave untended (ja-lo8.10).
        let nurses = col.friends ? around(col.friends, b.x, b.y) : 2;
        if ((col.founding || col.incipient) && q.alive) {
          // She feeds as two nurses would, beside whatever workers are there (PR #54 review: one nanitic by the brood
          // halved its feeding when she stood in only for none).
          cellOf(q.x, q.y);
          if (hexDistance(b.x, b.y, CELL[0], CELL[1]) <= 2) nurses = Math.max(nurses, 2);
        }
        const lack = Math.max(0, (1 - b.energy) / LARVA_ENERGY_PER_FOOD);
        const take = Math.min(pantry.food, food - b.fed + lack, FEED_RATE * Math.min(1, nurses / 2) * dt);
        const toEnergy = Math.min(take, lack);
        b.energy += toEnergy * LARVA_ENERGY_PER_FOOD;
        col.eaten += toEnergy;
        b.fed += take - toEnergy;
        col.stock(pantry, -take);
      }
      if (b.energy <= 0) {
        // Starved: its food leaves the economy with it.
        if (b.chamber >= 0) ch.list[b.chamber]!.brood--;
        col.eaten += 1 + b.fed;
        col.broodStarved++;
        col.brood.items.splice(k, 1);
        continue;
      }
      if (b.held < 0 && caste(col, b, pantry, dt)) {
        // Culled: nurses who perceived the queen's scent strong killed a gyne larva; its food leaves the economy.
        if (b.chamber >= 0) ch.list[b.chamber]!.brood--;
        col.eaten += 1 + b.fed;
        col.gynesCulled++;
        col.brood.items.splice(k, 1);
        continue;
      }
      if (isFed(b) && b.t >= T_LARVA * (b.caste === GYNE ? GYNE_TIME_X : 1)) {
        b.stage = PUPA;
        b.t = 0;
      }
    } else if (
      b.stage === PUPA &&
      b.t >= T_PUPA * (b.caste === GYNE ? GYNE_TIME_X : 1) &&
      b.held < 0 &&
      (b.caste === GYNE
        ? eclose(col, b)
        : col.spawn(centreX(b.x, b.y), centreY(b.y), b.nanitic ? col.params.middleShare * col.params.lifespan : 0))
    ) {
      if (b.chamber >= 0) ch.list[b.chamber]!.brood--;
      col.brood.items.splice(k, 1);
      if (b.caste !== GYNE) {
        col.founding = false; // her first worker: the colony feeds its brood from now on
        if (!b.nanitic) col.incipient = false; // the first her workers reared: the queen nurses no more
      }
    }
  }
  if (col.alates.length) alatesOut(col, dt);
}

/**
 * Caste (ja-lo8.9, royal.ts), for larva b lying in chamber `pantry`, from the queen's scent as the nurses within two
 * cells perceive it. Bipotent (its first BIPOTENT seconds), well fed, with food lying by it, and every nurse perceiving
 * the scent faint (below GYNE_MARK) for GYNE_CUE seconds: it is reared as a gyne. A gyne larva by a nurse perceiving it
 * strong (CULL_MARK) for CULL_CUE seconds is culled: returns true. A queen founding alone rears no gynes.
 */
export function caste(col: Colony, b: BroodItem, pantry: Chamber | undefined, dt: number): boolean {
  const felt = col.perceived.near(b.x, b.y, 2);
  if (b.caste === GYNE) {
    b.cue = felt >= CULL_MARK ? b.cue + dt : Math.max(0, b.cue - dt);
    return b.cue >= CULL_CUE;
  }
  if (
    !col.founding &&
    b.t < BIPOTENT &&
    felt > 0 &&
    felt < GYNE_MARK &&
    b.energy >= GYNE_ENERGY &&
    pantry &&
    pantry.food >= GYNE_PANTRY &&
    !royalNear(col, b.x, b.y)
  ) {
    b.cue += dt;
    if (b.cue >= GYNE_CUE) {
      b.caste = GYNE;
      b.cue = 0;
      col.gynes++;
    }
  } else b.cue = 0;
  return false;
}

/** Whether gyne brood (a gyne larva or pupa) or an alate lies within GYNE_SPACING cells of (x, y): its nurses are feeding a gyne already. */
export function royalNear(col: Colony, x: number, y: number): boolean {
  if (GYNE_SPACING <= 0) return false;
  for (const o of col.brood.items) if (o.caste === GYNE && o.stage !== EGG && hexDistance(x, y, o.x, o.y) <= GYNE_SPACING) return true;
  for (const a of col.alates) {
    cellOf(a.x, a.y);
    if (hexDistance(x, y, CELL[0], CELL[1]) <= GYNE_SPACING) return true;
  }
  return false;
}

/**
 * A gyne pupa ecloses as an alate (royal.ts) where it lay. Her food (her egg and what she was fed) becomes her body
 * (Alate.food), held apart from the larder: it founds her daughter (Game.found) or is lost with her (Game.lose).
 */
export function eclose(col: Colony, b: BroodItem): boolean {
  col.alates.push({ x: centreX(b.x, b.y), y: centreY(b.y), t: 0, step: 0, load: 0, strain: 0, resist: 0, food: 1 + b.fed });
  return true;
}

/**
 * Alates (ja-lo8.9): each waits ALATE_WAIT in the nest, among her nestmates (the fungus can reach her there), then walks
 * up and out along the tunnels a cell every ALATE_STEP, and flies at the hole: into `flown`, for the game to found
 * with (Game.tick).
 */
export function alatesOut(col: Colony, dt: number): void {
  for (let k = col.alates.length - 1; k >= 0; k--) {
    const a = col.alates[k] as Alate;
    a.t += dt;
    if (a.t < ALATE_WAIT) {
      // She fattens as she waits: the nestmates by her feed her from the chamber she is in, up to ALATE_RESERVE. What
      // she takes goes from the larder into her body (PR #47 review, S1). Like larval feeding, it reads her chamber's
      // food from the chamber table (ja-k4k.4).
      if (a.food < ALATE_RESERVE && col.map.chambers) {
        cellOf(a.x, a.y);
        const cx = CELL[0];
        const cy = CELL[1];
        const room = col.map.chambers.list[col.map.chambers.at(cx, cy)];
        if (room && room.colony === col.params.nest && room.food > 0) {
          const nurses = col.friends ? around(col.friends, cx, cy) : 2;
          const take = Math.min(room.food, ALATE_RESERVE - a.food, ALATE_FEED * Math.min(1, nurses / 2) * dt);
          if (take > 0) {
            a.food += take;
            col.stock(room, -take);
          }
        }
      }
      continue;
    }
    a.step -= dt;
    while (a.step <= 0) {
      a.step += ALATE_STEP;
      cellOf(a.x, a.y);
      const cx = CELL[0];
      const cy = CELL[1];
      const d = isSky(col.map, cx, cy) ? -1 : climbOut(col, cx, cy);
      if (d < 0) {
        col.alates.splice(k, 1);
        col.flown.push(a);
        col.flights++;
        break;
      }
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      a.x = centreX(tx, ty);
      a.y = centreY(ty);
    }
  }
}
