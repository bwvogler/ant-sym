// Crossing between layers (docs/refactor.md S3.3): an ant going up out of the hole onto the plane or down into it, what it carries out, and the gate it waits at. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `c`.

import type { Colony, HoleCell } from "./colony.ts";
import { NO_KEY } from "./ants.ts";
import { NO_CELL, SOIL_FILL, SOIL_LOOSE, gauss, planeMoundReach } from "./grid.ts";
import { CELL, R, centreX, centreY, hexDistance } from "./hex.ts";
import { outDistAt, routeClear } from "./homing.ts";
import { MIDDEN_MIN, PI_DRIFT_2D, WAIT_STEPS } from "./tuning.ts";
import { CURTAIN, EXPLORE, FIGHT, FOLLOW, PLANE, RETURN } from "./vocab.ts";

/**
 * One world's plane (U3c): ant i, with a pellet or corpse just carried up its hole (or a rival's), walks it out on a
 * heading drawn now (a new draw, one world only). Spoil goes the side view's way out, farther as the mound grows; a
 * corpse to the midden, at least MIDDEN_MIN from home by its vector and off the mound.
 */
export function carryOut(c: Colony, i: number): void {
  c.spoilA[i] = c.rng() * 2 * Math.PI;
  c.spoilT[i] = 0;
  if (c.corpse[i]) c.spoilTo[i] = MIDDEN_MIN;
  else {
    // The side view's draw (2 + reach × √u: uniform over a disc), with the disc's reach grown so its area tracks the soil
    // brought out at MOUND_HEIGHT levels deep (Tschinkel 2015), as the side view's length does along the ground: grown as
    // the side view's (linearly), the 2D disc thinned to under a pellet a cell.
    c.spoilTo[i] = 2 + planeMoundReach(c.heaped) * Math.sqrt(c.rng());
  }
  c.wall[i] = 0;
  c.mx[i] = NaN;
  c.gx[i] = NO_CELL;
}

// ——— one world: the gate at the top of the shaft (ja-web, PRD §48.6) ———

/**
 * Whether ant i, in the curtain, is held at the gate at the top of its own shaft: an old forager going out (exploring or
 * following, or a recruited raider), its jaws empty, not a finder going home to tell, with no pass (`leaveOk`), at the
 * gate (atGate). Porters, and ants carrying spoil, a corpse or brood, are never held.
 */
export function holdsAt(c: Colony, i: number): boolean {
  const m = c.mode[i];
  return (
    c.leaveOk[i] === 0 &&
    (m === EXPLORE || m === FOLLOW || (m === FIGHT && c.recruited[i] === 1)) &&
    !c.carrying[i] &&
    !c.pellet[i] &&
    !c.broodHeld[i] &&
    !c.porter[i] &&
    !c.reporting[i] &&
    c.band(i) === 2 &&
    atGate(c, i)
  );
}

/**
 * Whether ant i is at the gate: one world's curtain, within WAIT_STEPS steps of its own hole along its own tunnels (the
 * way-out field, outField), where it senses its place as "hole". Leaves the shared CELL as it found it.
 */
export function atGate(c: Colony, i: number): boolean {
  if (c.line === null || c.entrance === null) return false;
  // Deeper than WAIT_STEPS rows below the hole, it can't be (most of the nest: no field read).
  if (c.y[i] > centreY(c.entranceRow + WAIT_STEPS) + R) return false;
  const keepX = CELL[0];
  const keepY = CELL[1];
  c.antCell(i);
  const d = outDistAt(c, CELL[0], CELL[1]);
  CELL[0] = keepX;
  CELL[1] = keepY;
  return d >= 0 && d <= WAIT_STEPS;
}

/**
 * Whether ant i, at the top of a shaft, may climb out onto the plane: not with brood in its jaws, not a porter (food
 * moved between chambers stays in), and with spoil or a corpse to put out, or of an age to go out (mayGoOut) and not
 * homing to its chamber (goal: a carrier just in at its hole, or a returner, whose walker turned up the shaft;
 * crossing, each went straight back down: in the spike, up to 68 carriers a colony in 300 s). One lost in another
 * nest's tunnels heads for the hole, and climbs out.
 */
export function mayCrossUp(c: Colony, i: number): boolean {
  if (c.broodHeld[i] === 1 || c.porter[i] === 1) return false;
  if (c.pellet[i] === 1) return true;
  // Held at the gate at the top of its own shaft (ja-web): not until it has a pass.
  if (c.params.leaveGate > 0 && holdsAt(c, i)) return false;
  return c.mayGoOut(i) && !(c.mode[i] === RETURN && c.goalKind[i] === 0);
}

/**
 * Ant i climbs out of the hole at curtain cell (cx, cy) (or beside it) onto the plane, at that hole's cell: any hole
 * (lost in a rival's tunnels, it climbs out there; a raider leaves a rival's shaft). Its vector home resets at its own
 * hole only, as integrate's does (its search, as every crossing's: crossed). Spoil and corpses it keeps, to carry out
 * on the plane (U3c, carryOut): a loose pellet taken down to backfill comes back up as spoil to spread (looseBack).
 * Its heading is the caller's to write.
 */
export function crossUp(c: Colony, i: number, cx: number, cy: number): void {
  const hs = c.holeCells;
  let k = 0;
  let best = Infinity;
  for (let n = 0; n < hs.length; n++) {
    const d = hexDistance(cx, cy, (hs[n] as HoleCell).col, (hs[n] as HoleCell).row);
    if (d < best) {
      best = d;
      k = n;
    }
  }
  const hc = hs[k] as HoleCell;
  if (c.pellet[i] && c.soil[i] === SOIL_FILL) {
    // Taken down to backfill and found nowhere: back out with it, to spread (as at the chamber: looseBack).
    c.soil[i] = SOIL_LOOSE;
    c.looseBack++;
  } else if (c.carrying[i]) c.carriedUp++;
  c.layer[i] = PLANE;
  c.x[i] = centreX(hc.px, hc.py);
  c.y[i] = centreY(hc.py);
  c.under[i] = 0;
  c.goalKind[i] = 1;
  if (k === c.params.nest) {
    // Up out of its own hole the vector starts afresh, pointing at it, with this trip's drift in 2D (U3b). Up out of a
    // rival's it runs on, its error standing (the side view's rule, integrate; review of #20).
    c.odoSurf[i] = 0;
    c.driftSurf[i] = gauss(c.rng) * PI_DRIFT_2D;
    c.driftSurfY[i] = gauss(c.rng) * PI_DRIFT_2D;
    routeClear(c, i); // a fresh trip out: no places of the last
  }
  c.lastRole[i] = 0; // out of the nest: the next chamber it enters starts its marks afresh
  c.leaveOk[i] = 0; // its pass through the gate is used (ja-web)
  crossed(c, i);
  if (c.pellet[i]) carryOut(c, i);
  c.crossedUp++;
}

/**
 * Ant i, on the plane at colony k's hole, goes down it: into the curtain at that hole (the crust's open cell), heading
 * down. With food it is home with it, and the side view's code takes it on to reception and the chambers. Where the
 * colony gates leaving (ja-web), at its own hole: a carrier is a return the ants held at the top of the shaft meet next
 * tick, and has a pass back out (a successful forager never waits, PRD §48); a rested, empty forager's trip ends here,
 * just inside, and it is held at the gate at once (the owner's choice, 2026-11-10: it doesn't go down first).
 */
export function crossDown(c: Colony, i: number, k: number): void {
  const hc = c.holeCells[k] as HoleCell;
  const p = c.params;
  const gated = k === p.nest && p.leaveGate > 0;
  if (c.carrying[i]) {
    c.carriedDown++;
    if (gated) {
      c.holeIn++;
      c.leaveOk[i] = 1;
    }
  } else if (gated && p.arrive !== "return" && c.mode[i] === RETURN && !c.pellet[i] && c.band(i) === 2 && !c.isTired(i)) {
    // `p.follows` here is defensive (review of #121, N1): no shipped species sets arrive "follow", and the policy guard turns a follower to explore anyway.
    c.mode[i] = p.arrive === "follow" && p.follows && !c.recruited[i] ? FOLLOW : EXPLORE;
    c.asked[i] = -1;
    c.restT[i] = 0;
  }
  c.reporting[i] = 0; // a finder has told: its trail ends here, at the hole (ja-web)
  c.layer[i] = CURTAIN;
  c.x[i] = centreX(hc.col, hc.row);
  c.y[i] = centreY(hc.row);
  c.heading[i] = Math.PI / 2;
  c.under[i] = 1;
  c.search[i] = 0;
  c.goalKind[i] = 1;
  c.defending[i] = 0;
  crossed(c, i);
  c.crossedDown++;
}

/** Ant i has changed layer: what it held of the old map (walls, cells, faces, targets, its cell cache) is dropped, as placeNewborn starts an ant. */
export function crossed(c: Colony, i: number): void {
  c.homeAfresh(i);
  c.gx[i] = NO_CELL;
  c.byCell[i] = 0;
  c.digT[i] = 0;
  c.digAim[i] = NaN;
  c.hugT[i] = 0;
  c.loopX[i] = NO_CELL;
  c.followT[i] = 0;
  c.noTunnel[i] = NO_KEY;
  c.looked[i] = NO_KEY;
  c.cameFrom[i] = NO_KEY;
  c.lastDug[i] = NO_KEY;
  c.putAt[i] = NO_KEY;
  c.chamberCell[i] = NO_KEY;
  c.staleWalk[i] = 0;
  c.spoilTo[i] = NaN;
  c.cellAtX[i] = NaN;
  c.groundRef[i] = NaN;
  c.restT[i] = 0;
}
