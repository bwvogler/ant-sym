// The body (docs/refactor.md S3.3): each ant's energy, hunger and age each tick, dying and what it leaves, feeding, workers aging out, and newborns placed in the nest. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `col`.

import type { Colony } from "./colony.ts";
import { antResets } from "./ants.ts";
import type { ColonyParams } from "./params.ts";
import { LARVA } from "./brood.ts";
import { SOIL_DUG } from "./grid.ts";
import { CELL, cellOf, discOffsets, hexDistance } from "./hex.ts";
import {
  ADULT_DRAIN,
  ADULT_DRAIN_OUT,
  EAT_BELOW,
  ENERGY_PER_FOOD,
  PASS,
  QUEEN_BEG,
  QUEEN_WAIT,
  SHARE_ABOVE,
  adultBegOf,
  begOf,
  feel,
} from "./hunger.ts";
import { SCENT_FADE, SCENT_HELD, SCENT_SHARE, SCENT_SUPPLY } from "./royal.ts";
import { EGG_FOOD, QUEEN_STOCK } from "./tuning.ts";
import { EXPLORE } from "./vocab.ts";
import { dropFood } from "./world.ts";

/** The newborn's resets for one colony's parameters (ants.ts antResets), worked out once: a parameter a reset reads (tolerance, routeStep) is read at the first birth, so a colony does not change it afterwards (asIs reads tolerance live). */
const SPAWN_RESETS = new WeakMap<object, [string, number][]>();
const spawnResets = (params: ColonyParams): [string, number][] => {
  let r = SPAWN_RESETS.get(params);
  if (!r) SPAWN_RESETS.set(params, (r = antResets(params)));
  return r;
};

export function placeNewborn(col: Colony, i: number): void {
  const a = col.rng() * Math.PI * 2;
  const r = col.rng() * col.nest.r * 0.8;
  col.x[i] = col.nest.x + Math.cos(a) * r;
  col.y[i] = col.nest.y + Math.sin(a) * r;
  col.heading[i] = a;
  // Every field the table marks for a newborn goes back to its start (ants.ts `reset`): a newborn is clean, unprimed, nothing walked, nothing carried
  // and born underground, in the nest's own layer.
  const arrays = col as unknown as Record<string, { [i: number]: number }>;
  for (const [name, value] of spawnResets(col.params)) arrays[name]![i] = value;
  col.hand[i] = col.rng() < 0.5 ? -1 : 1;
  // A newborn smells of its colony as the colony smells now.
  col.odour[i] = col.nestOdour;
  col.layer[i] = col.home; // born in the nest, on its layer
  col.lifespan[i] = col.queen || col.params.mortalWithoutQueen ? col.params.lifespan * (0.7 + 0.6 * col.rng()) : Infinity;
  col.gen[i] = (col.gen[i] + 1) >>> 0;
  col.alive[i] = 1;
}

/** spawn, with the home layer bound. */
export function spawnHome(col: Colony, x: number | undefined, y: number | undefined, age: number): boolean {
  const i = col.alive.indexOf(0);
  if (i < 0) return false;
  placeNewborn(col, i);
  if (x !== undefined && y !== undefined) {
    col.x[i] = x;
    col.y[i] = y;
  }
  if (age > 0) col.age[i] = age;
  col.births++;
  return true;
}

/** kill, with ant i's layer bound. */
export function killOn(col: Colony, i: number, lost: boolean): void {
  if (!col.alive[i]) return;
  if (col.broodHeld[i]) dropBrood(col, i);
  if (col.carrying[i] && col.porter[i]) {
    // A porter's food is already home: it stays the colony's, in the chamber it was taking it to (on the floor, a
    // forager would bring it "home" a second time).
    const t = col.map.chambers?.list[col.portTo[i]];
    if (t) col.stock(t, 1);
    else col.feed(1);
    col.inJaws -= 1;
    col.carrying[i] = 0;
    col.porter[i] = 0;
    col.portTo[i] = -1;
  }
  if (col.carrying[i]) dropFood(col.map, col.x[i], col.y[i], 1, col.quality[i]);
  col.antCell(i);
  if (col.onDie) {
    const x = CELL[0];
    const y = CELL[1];
    col.onDie(i, col.layer[i] as number, x, y);
    CELL[0] = x;
    CELL[1] = y;
  }
  if (col.corpse[i]) {
    // The corpse it carried falls where it falls, with it (one world: on the layer it was on; on the plane it lies there and rots).
    for (const k of col.corpses) if (k.held === i) ((k.held = -1), (k.x = CELL[0]), (k.y = CELL[1]), (k.layer = col.layer[i]));
    col.corpse[i] = 0;
  } else if (col.pellet[i]) {
    if (col.soil[i] !== SOIL_DUG) col.looseLost++;
    else col.soilLost++;
  }
  // In the side view with a queen, the dead lie where they fall until an undertaker takes them out (slice 7). One world:
  // only underground, the nest's layer; the dead on the plane leave no corpse, as top-down (U3c: only the corpses
  // undertakers carry up go to the plane's midden).
  if (col.queen && col.layer[i] === col.home)
    col.corpses.push({
      x: CELL[0],
      y: CELL[1],
      held: -1,
      died: col.time,
      load: col.load[i],
      strain: col.strain[i],
      layer: col.home,
    });
  col.clearPellet(i);
  col.alive[i] = 0;
  col.carrying[i] = 0;
  col.digT[i] = 0;
  if (lost) {
    col.losses++;
    col.recentLosses++;
  }
}

/** feed, with the home layer bound. */
export function feedHome(col: Colony, n: number): void {
  const ch = col.map.chambers;
  if (!col.queen || !ch) {
    col.larder += n;
    return;
  }
  // With a queen the larder is the food in the chambers: put anywhere else, the two would drift apart.
  const royal = ch.list.find((c) => c.colony === col.params.nest && c.role === "royal");
  if (!royal) throw new Error(`colony ${col.params.nest} has a queen but no royal chamber`);
  col.stock(royal, n);
}

/** Ant i puts down the brood it holds where it stands (in the chamber it was taking it to, or wherever it died). */
export function dropBrood(col: Colony, i: number, atX = NaN, atY = NaN): void {
  const ch = col.map.chambers;
  col.antCell(i);
  const cx = Number.isNaN(atX) ? CELL[0] : atX;
  const cy = Number.isNaN(atY) ? CELL[1] : atY;
  for (const b of col.brood.items)
    if (b.held === i) {
      b.held = -1;
      b.x = cx;
      b.y = cy;
      b.chamber = ch ? ch.at(cx, cy) : -1;
      if (b.chamber >= 0) ch!.list[b.chamber]!.brood++;
    }
  col.broodHeld[i] = 0;
  col.broodTo[i] = -1;
  col.holdT[i] = 0;
  col.mode[i] = EXPLORE;
  col.asked[i] = -1;
  col.question[i] = -1;
}

/**
 * Energy and felt hunger, once a tick before the ants move (the side view; ja-xu6.1, hunger.ts). Every ant uses energy
 * (twice as fast out on the ground). Once below EAT_BELOW it eats from food lying in its own nest within two cells, not
 * in a brood chamber (that food is the larvae's; nurses there are fed by mouth) nor the queen's stock (a chamber a cell wide is passed by more often than stood in, as for porters), or takes food by mouth from the best-fed
 * nestmate it touches (trophallaxis, above SHARE_ABOVE); at 0 it dies of hunger. Then what can be felt by touch: a
 * begging larva, a hungry adult, a queen who can't lay for want of food, and what each ant felt last tick, passed on at
 * PASS; each ant's need moves toward the strongest it feels within one cell.
 */
export function body(col: Colony, dt: number): void {
  const ch = col.map.chambers;
  const { felt, donors, energy, scent, scentSum, perceived } = col;
  felt.reset();
  donors.reset();
  scentSum.reset();
  perceived.reset();
  for (const b of col.brood.items) if (b.stage === LARVA && b.held < 0) felt.put(b.x, b.y, begOf(b.energy));
  const q = col.queen;
  // Her cell, when she lives in a nest: a column can be negative (one world's curtain), so whether there is one is its own flag.
  let queenHere = false;
  let qx = 0;
  let qy = 0;
  let touching = 0; // ants within one cell of the queen: her scent is split among them
  if (q && q.alive && ch) {
    queenHere = true;
    cellOf(q.x, q.y);
    qx = CELL[0];
    qy = CELL[1];
    // She begs once she has gone QUEEN_WAIT without laying for want of food in her chamber (the death spiral's mark),
    // not whenever her chamber is briefly bare (early on she lays two eggs a second: begging then jammed the tunnels
    // with porters, A8 and G, PRD §50.18).
    const royal = ch.list[ch.at(qx, qy)];
    q.unfed = !royal || royal.food < EGG_FOOD ? q.unfed + dt : 0;
    felt.put(qx, qy, QUEEN_BEG * Math.min(1, Math.max(0, (q.unfed - QUEEN_WAIT) / QUEEN_WAIT)));
  }
  for (let i = 0; i < col.n; i++) {
    if (!col.alive[i]) continue;
    col.antCell(i);
    const cx = CELL[0];
    const cy = CELL[1];
    const under = col.under[i] === 1;
    let e = energy[i] - (under ? ADULT_DRAIN : ADULT_DRAIN_OUT) * dt;
    if (e < EAT_BELOW && under && ch) {
      const o = discOffsets(2)[cy & 1] as Int16Array;
      for (let k = 0; k < o.length; k += 2) {
        const c = ch.list[ch.at(cx + o[k], cy + o[k + 1])];
        if (!c || c.colony !== col.params.nest || c.role === "brood") continue; // the brood's food is the larvae's
        // The queen's stock is hers (a crowd resting in her chamber ate it, and she stopped laying): only what is beyond it.
        const spare = c.role === "royal" ? c.food - QUEEN_STOCK : c.food;
        if (spare <= 0) continue;
        const bite = Math.min(spare, (1 - e) / ENERGY_PER_FOOD);
        col.stock(c, -bite);
        col.eaten += bite;
        e += bite * ENERGY_PER_FOOD;
        break;
      }
    }
    if (e <= 0) {
      energy[i] = 0;
      col.kill(i, false);
      col.diedHungry++;
      continue;
    }
    energy[i] = e;
    if (!under) continue;
    scentSum.add(cx, cy, scent[i]);
    if (queenHere && hexDistance(cx, cy, qx, qy) <= 1) touching++;
    felt.put(cx, cy, Math.max(PASS * col.feltLast[i], adultBegOf(e)));
    if (e > SHARE_ABOVE) donors.put(cx, cy, i, energy);
  }
  // The queen's scent (ja-lo8.9, royal.ts): it fades; underground it moves toward the mean the ants within one cell
  // carry, and the ants touching her share her supply, × her signal.
  const fade = Math.exp(-dt / SCENT_FADE);
  const share = 1 - Math.exp(-dt / SCENT_SHARE);
  let supply = 0;
  if (q && q.alive && queenHere) {
    q.held = Math.min(SCENT_SUPPLY * q.signal * SCENT_HELD, q.held + SCENT_SUPPLY * q.signal * dt);
    if (touching > 0) {
      supply = q.held / touching;
      q.held = 0;
    }
  }
  for (let i = 0; i < col.n; i++) {
    if (!col.alive[i]) continue;
    let now = 0;
    let sc = scent[i] * fade;
    if (col.under[i] === 1) {
      col.antCell(i);
      const cx = CELL[0];
      const cy = CELL[1];
      const m = scentSum.mean(cx, cy);
      if (!Number.isNaN(m)) sc += (m - sc) * share;
      if (supply > 0 && hexDistance(cx, cy, qx, qy) <= 1) sc += supply;
      perceived.put(cx, cy, sc * col.scentGain[i]);
      const e = energy[i];
      if (e < EAT_BELOW) {
        // Food by mouth from the best-fed nestmate it touches: half the gap between them, keeping the giver above SHARE_ABOVE.
        const d = donors.near(cx, cy, energy);
        if (d >= 0 && d !== i) {
          const give = Math.min(energy[d] - SHARE_ABOVE, (energy[d] - e) / 2);
          if (give > 0) {
            energy[d] = energy[d] - give;
            energy[i] = e + give;
          }
        }
      }
      now = felt.near(cx, cy);
    }
    scent[i] = sc;
    col.feltLast[i] = now;
    col.need[i] = feel(col.need[i], now, dt);
  }
}

/** Workers age and die of it (the colony's life cycle; a colony with no queen runs it only if its species is `mortalWithoutQueen`). */
export function ageWorkers(col: Colony, dt: number): void {
  for (let i = 0; i < col.n; i++) {
    if (!col.alive[i]) continue;
    if ((col.age[i] = col.age[i] + dt) > col.lifespan[i]) {
      col.kill(i, false);
      col.diedOld++;
    }
  }
}
