// Walking a tunnel (docs/refactor.md S3.3): an ant underground steers along the walls, widens a crowded chamber, and goes for food, brood or the way out. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `col`.

import type { Colony } from "./colony.ts";
import { NO_KEY } from "./ants.ts";
import { type Chamber } from "./chambers.ts";
import {
  NO_CELL,
  UP_FIRST,
  besideRefill,
  cellKey,
  chooseDig,
  digChance,
  flipDue,
  gauss,
  handOnWall,
  refilled,
  startable,
  tunnel,
  tunnelEnd,
  walkable,
} from "./grid.ts";
import { CELL, DIR_ANGLE, centreX, centreY, dirOf, hexDistance, nx as stepX, ny as stepY } from "./hex.ts";
import { ADULT_BEG_BELOW, NEED_FETCH, THETA_OLD } from "./hunger.ts";
import {
  BROOD_PULL,
  CHAMBER_DEPTH,
  CHAMBER_MIN_DEPTH,
  FORK,
  GROUND_LOOK,
  MIDDEN_CROWD,
  MIDDEN_SCALE,
  NEW_CHAMBER,
  ROOMY_DIG,
  SIGN_WEIGHT,
  START_HUG,
  TUNNEL_STALL,
  WIDEN,
  WIDEN_DEPTH,
} from "./tuning.ts";
import { crust } from "./dig.ts";
import { EXPLORE, FAINT, FIGHT, FOLLOW, RETURN } from "./vocab.ts";
import { AIR, OPEN, SOIL, isSky, markFork, rockAt, takeFork, tunnelHeading, type Nest } from "./world.ts";
import { believe, climbOut, destMark, holeMetric, searchOn, targetHole, towardHole } from "./homing.ts";
import { around } from "./sense.ts";

/**
 * The chance a raider about to step onto a cell of the raided colony's midden (mark v there) turns back. A lone scout
 * mostly does; a raid in force presses on (review of #26: one saturated cell turned back 98 % of raiders, so none ever
 * got into the rival's nest): the chance falls with its own colony's ants around it (`friends`, within two cells).
 */
export function middenTurn(col: Colony, v: number, cx: number, cy: number): number {
  const company = col.friends ? around(col.friends, cx, cy) : 1;
  return (1 - Math.exp(-v / MIDDEN_SCALE)) * Math.min(1, MIDDEN_CROWD / company);
}

/** The way ahead (not back) from cell (cx, cy) with the most royal and brood mark (the queen's and the brood's chambers), or −1 if none smells of them. */
export function toBrood(col: Colony, cx: number, cy: number, dir: number): number {
  const royal = col.ph.fields.royal;
  const brood = col.ph.fields.brood;
  let best = -1;
  let bestV = FAINT;
  for (const turn of [0, 1, -1, 2, -2]) {
    const d = (dir + turn + 6) % 6;
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if (rockAt(col.map, tx, ty) !== OPEN || isSky(col.map, tx, ty)) continue;
    const v = royal.get(tx, ty) + brood.get(tx, ty);
    if (v > bestV) ((bestV = v), (best = d));
  }
  return best;
}

/** The way ahead (not back) from cell (cx, cy) with the most store mark (where food is kept), or −1 if none smells of it. */
export function toFood(col: Colony, cx: number, cy: number, dir: number): number {
  const store = col.ph.fields.store;
  let best = -1;
  let bestV = FAINT;
  for (const turn of [0, 1, -1, 2, -2]) {
    const d = (dir + turn + 6) % 6;
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if (rockAt(col.map, tx, ty) !== OPEN || isSky(col.map, tx, ty)) continue;
    const v = store.get(tx, ty);
    if (v > bestV) {
      bestV = v;
      best = d;
    }
  }
  return best;
}

/**
 * Whether ant i, exploring empty-jawed in the nest, goes to where food is kept because of the hunger it feels
 * (ja-xu6.1): its felt need at or above its age's threshold (an old forager's is THETA_OLD; the young and middle-aged
 * answer a fainter need, NEED_FETCH). There it takes food on to where it is wanted (port), and eats if it is hungry.
 */
export function fetches(col: Colony, i: number): boolean {
  // With restFetch (ja-4rfr), its own hunger too: a worker hungry enough to beg goes for food. Without it, the old felt
  // their nestmates' hunger just under THETA_OLD while starving themselves, and climbed out to forage, and died.
  if (col.params.restFetch > 0 && col.energy[i] < ADULT_BEG_BELOW) return true;
  return col.need[i] >= (col.band(i) === 2 ? THETA_OLD : NEED_FETCH);
}

/**
 * Whether ant i, in "return" with empty jaws underground and hungry enough to fetch, may take food on from a store it is
 * by, as an explorer does (restFetch, ja-4rfr: the old foragers retire inside in "return", and they were the ones who
 * felt it).
 */
export function restFetches(col: Colony, i: number, mode: number, cx: number, cy: number): boolean {
  return (
    col.params.restFetch > 0 &&
    mode === RETURN && // its one caller (port) asks only for ants not exploring: this keeps it to returners
    col.queen !== null &&
    !col.carrying[i] &&
    !col.pellet[i] &&
    !col.broodHeld[i] &&
    !isSky(col.map, cx, cy) &&
    fetches(col, i)
  );
}

/** The way from cell (cx, cy), underground away from its own nest (in at another's hole), up toward the ground: onto it if it can, else the open neighbour highest up; −1 if none is higher. */
export function upOut(col: Colony, cx: number, cy: number): number {
  let best = -1;
  let bestY = centreY(cy) - 1e-6;
  for (const d of UP_FIRST) {
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if (!walkable(col.map, tx, ty)) continue;
    if (isSky(col.map, tx, ty)) return d;
    if (centreY(ty) < bestY) {
      bestY = centreY(ty);
      best = d;
    }
  }
  return best;
}

/**
 * Walking a tunnel, cell by cell (thigmotaxis: ants keep to walls). True while ant i is in a tunnel
 * (see tunnel) and steering by its target cell (gx, gy); false in open ground, where it steers freely.
 * At each cell's centre it takes the next way: an explorer by
 * its hand on the wall, so it visits every branch in turn, and at a dead end of soil it faces the
 * end (sometimes the side: a fork) to dig it; a follower by the strongest food trail ahead; a
 * homing ant by the other hand, which walks a hand-on-wall walk back the way it came. An explorer
 * that touched soil a moment ago keeps its hand on a chamber's wall too (see hug).
 */
export function walkTunnel(col: Colony, i: number, mode: number, step: number): boolean {
  const { map } = col;
  const x = col.x[i];
  const y = col.y[i];
  col.antCell(i);
  const hx = CELL[0];
  const hy = CELL[1];
  // A target that isn't this cell or a neighbour is stale (from before a detour, say): decide afresh.
  // So is one that has been filled since (backfill), unless it is an explorer's face to dig: a cell it
  // chose to dig (digAim set), not one it was walking to, and not one put back moments ago (see refilled).
  // Kept, a walkway filled in front of an explorer was dug straight back out (the review of MR 12).
  // (One world's ground strip over a hole is walkable: a step there crosses up, so it is a target to keep.)
  const gWalk = col.gx[i] !== NO_CELL && walkable(map, col.gx[i], col.gy[i]);
  const fresh =
    col.gx[i] === NO_CELL ||
    hexDistance(col.gx[i], col.gy[i], hx, hy) > 1 ||
    (!gWalk &&
      (mode !== EXPLORE || Number.isNaN(col.digAim[i]) || refilled(map, col.gx[i], col.gy[i], col.time, col.params.backfill.hold))) ||
    (!gWalk && rockAt(map, col.gx[i], col.gy[i]) === AIR); // sky (the ground under a walkway dug away) is no face to dig
  if (!fresh && Math.hypot(centreX(col.gx[i], col.gy[i]) - x, centreY(col.gy[i]) - y) > step) return true;
  const hugging = mode === EXPLORE && col.hugT[i] > 0;
  const packed = cellKey(hx, hy);
  // Homing on the ground line (side view) goes cell by cell to the hole wherever the walkway is, one cell
  // thick or two (on the mound's slopes, where it is no tunnel and steering freely wandered off round them).
  const carryingOut = mode === RETURN && col.pellet[i] === 1 && col.entrance !== null && !Number.isNaN(col.spoilTo[i]);
  // Raiding in the side view (slice 7): out of its own nest, along the ground to the rival's hole, cell by cell.
  const raiding = mode === FIGHT && col.entrance !== null && col.stanceOf(i) === "raid" && col.raidTarget !== null;
  const onSky = isSky(map, fresh ? hx : col.gx[i], fresh ? hy : col.gy[i]);
  // Homing underground with the hole still its goal: in at another hole than its own (see homeGoal). It climbs back out.
  const climbing = mode === RETURN && col.entrance !== null && !onSky && col.goalKind[i] === 1 && col.pellet[i] === 0;
  const groundHome = carryingOut || climbing || ((mode === RETURN || raiding) && col.entrance !== null && onSky);
  if (fresh && !hugging && !groundHome && col.noTunnel[i] === packed) {
    col.gx[i] = NO_CELL; // looked here already: open ground
    return false;
  }
  const cx = fresh ? hx : col.gx[i];
  const cy = fresh ? hy : col.gy[i];
  if (!groundHome && !tunnel(map, cx, cy)) {
    if (hugging) return hug(col, i, cx, cy, fresh);
    col.gx[i] = NO_CELL;
    if (fresh) col.noTunnel[i] = packed;
    return false;
  }
  col.noTunnel[i] = NO_KEY;
  let dir = fresh ? dirOf(col.heading[i]) : col.gdir[i];
  const ent = col.entrance;
  if (carryingOut) {
    // Carrying a pellet out (side view): up to the hole if it is still in the shaft, then on along the ground away
    // from it to where it drops it (away from the hole from inside the shaft is down it).
    const inShaft = !isSky(map, cx, cy) && !(cx === col.entranceCol && cy === col.entranceRow);
    const best = inShaft ? towardHole(col, cx, cy, false) : awayFromHole(col, cx, cy, col.spoilSide[i]);
    if (best < 0) col.spoilTo[i] = Math.min(0, col.spoilTo[i]); // the map's edge, or nowhere farther: it drops it here (one carried back to the midden walks on: undertake)
    dir = best < 0 ? handOnWall(map, cx, cy, dir, -col.hand[i]) : best;
  } else if (raiding) {
    const t = col.raidTarget as Nest;
    let best: number;
    if (isSky(map, cx, cy)) {
      col.holeX = t.x;
      best = towardHole(col, cx, cy, true, NaN, t.y);
      // The rival's midden marks its ground (Pogonomyrmex badius): a raider about to step onto it may turn back, the
      // more surely the stronger it smells and the fewer of its own colony are with it (middenTurn).
      const m = col.raidMarks?.fields.midden;
      if (best >= 0 && m) {
        const v = m.get(stepX(cx, cy, best), stepY(cy, best));
        if (v >= FAINT && col.rng() < middenTurn(col, v, cx, cy))
          best = rockAt(map, stepX(cx, cy, (dir + 3) % 6), stepY(cy, (dir + 3) % 6)) === OPEN ? (dir + 3) % 6 : -1;
      }
    } else if (col.inOwnNest(cx, cy) || !col.raidNest) best = climbOut(col, cx, cy);
    else {
      // In at the rival's hole: down to its chamber (review of slice 7: it climbed back out, to its own hole).
      col.holeX = col.raidNest.x;
      best = towardHole(col, cx, cy, false, NaN, col.raidNest.y);
    }
    dir = best < 0 ? handOnWall(map, cx, cy, dir, -col.hand[i]) : best;
    col.digAim[i] = NaN;
  } else if (climbing) {
    const up = upOut(col, cx, cy);
    dir = up >= 0 ? up : handOnWall(map, cx, cy, dir, -col.hand[i]);
  } else if (mode === RETURN && ent && isSky(map, cx, cy)) {
    // On the ground line (side view), homing is to the hole: the way nearer it along the ground (home scent lies
    // along the walkway both sides of the hole, so the most-scent rule below walks a carrier past it and on).
    // A surface it was following round toward one hole (believed, or the real one once in sight) says nothing about
    // the other: start afresh if the target changed.
    if (col.groundRef[i] !== col.holeX) col.groundMin[i] = NaN;
    const min = col.groundMin[i];
    let best = towardHole(col, cx, cy, true, min);
    if (best >= 0) col.groundMin[i] = NaN;
    else if (Number.isNaN(min) && col.holeX !== ent.x && Math.abs(centreX(cx, cy) - col.holeX) < 1) {
      // At the column where it believed the hole was, and no hole in sight: search to either side, farther each time.
      // (Only there: blocked anywhere else, it goes round the obstacle below, or every blocked step would widen the search.)
      searchOn(col, i);
      col.holeX = believe(col, i, ent).x;
      best = towardHole(col, cx, cy, true);
    } else if (Number.isNaN(min)) {
      // No open way nearer the hole it heads for (spoil heaped between, a pit beside the mound, a step in the ground):
      // Bug2 on the ground, a hand on the surface until it is somewhere nearer that hole than here. Rocking between
      // the nearest cell and a step away kept whole colonies in such a pit.
      col.groundMin[i] = holeMetric(col, cx, cy);
      col.groundRef[i] = col.holeX;
      col.groundT[i] = 0;
      // Which hand: feel ahead along the surface both ways (a gully between two heaps: one side leads over toward the
      // hole, the other along the far heap and away) and take the one that gets nearer than here sooner.
      const m = col.groundMin[i];
      const ka = groundLook(col, cx, cy, dir, 1, m);
      const kb = groundLook(col, cx, cy, dir, -1, m);
      if (ka !== kb) col.hand[i] = ka < kb ? -1 : 1; // handOnWall below takes −hand
    } else if (flipDue((col.groundT[i] = Math.min(65535, col.groundT[i] + 1)))) {
      // The long way round: the other hand, and turned back. Each leg is twice the last (GROUND_FLIP, then 2×, 4×...):
      // with equal legs, the walk back after a flip ended where it started, and flipped there again, for ever (a pit
      // on the mound whose only other way out was back: both hands left it the same way).
      col.hand[i] = -col.hand[i];
      dir = (dir + 3) % 6;
    }
    dir = best < 0 ? groundHand(col, cx, cy, dir, -col.hand[i]) : best;
  } else if (mode === RETURN || mode === FOLLOW) {
    // The way ahead (not back, unless it's a dead end) with the most scent: home scent, laid by
    // ants walking out, for a homing ant; food scent for a follower. No scent at all: a hand on the wall.
    // Homing with no progress for TUNNEL_STALL seconds (scent can lead round a ring of tunnels for
    // ever): the way that points most nearly to its goal instead (the nest, or the entrance), by its home vector.
    const field = mode === RETURN ? col.ph.fields.home : col.ph.fields.food;
    // Underground in the side view, homing follows the road signs of where it is going (its chamber's mark); the home
    // trail only where there are none.
    const signs = mode === RETURN && col.entrance && !isSky(map, cx, cy) ? col.ph.fields[destMark(col, i)] : null;
    const signGain = SIGN_WEIGHT * col.gainHome[i] * col.gainMarks[i]; // the fungus's home and marks levers bend road signs
    const byVector = mode === RETURN && col.stallT[i] > TUNNEL_STALL;
    const hx = col.goalX - centreX(cx, cy);
    const hy = col.goalY - centreY(cy);
    let best = -1;
    let bestV = byVector ? -Infinity : 0;
    for (const turn of [0, 1, -1, 2, -2]) {
      const d = (dir + turn + 6) % 6;
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (!walkable(map, tx, ty)) continue;
      const v = byVector
        ? Math.cos(DIR_ANGLE[d]) * hx + Math.sin(DIR_ANGLE[d]) * hy
        : (signs ? signs.get(tx, ty) * signGain : 0) + field.get(tx, ty);
      if (v > bestV) {
        bestV = v;
        best = d;
      }
    }
    dir = best < 0 ? handOnWall(map, cx, cy, dir, -col.hand[i]) : best;
  } else if (mode === EXPLORE && ent && isSky(map, cx, cy)) {
    // On the ground line (side view) an explorer walks on along the ground the way it is going, turning back only
    // at its end. A hand on the wall (searching a tunnel's branches) turned explorers round at every step of the
    // ground and kept them within a few dozen cells of the hole, short of the food lying farther out.
    let best = -1;
    for (const turn of [0, 1, -1, 2, -2]) {
      const d = (dir + turn + 6) % 6;
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(map, tx, ty) === OPEN && isSky(map, tx, ty)) {
        best = d;
        break;
      }
    }
    if (best < 0)
      best =
        rockAt(map, stepX(cx, cy, (dir + 3) % 6), stepY(cy, (dir + 3) % 6)) === OPEN
          ? (dir + 3) % 6
          : handOnWall(map, cx, cy, dir, col.hand[i]);
    dir = best;
    col.digAim[i] = NaN;
  } else if (
    mode === EXPLORE &&
    col.queen &&
    !col.carrying[i] &&
    !col.pellet[i] &&
    !col.broodHeld[i] &&
    !isSky(map, cx, cy) &&
    fetches(col, i) &&
    toFood(col, cx, cy, dir) >= 0
  ) {
    // Feeling the brood's or the queen's hunger, or a nestmate's (ja-xu6.1): along the stores' marks to where food is
    // kept, to take some on to where it is wanted (port). (Reception's marks too drew fetchers to an empty reception.)
    dir = toFood(col, cx, cy, dir);
    col.digAim[i] = NaN;
  } else if (mode === EXPLORE && col.queen && col.band(i) === 0 && !isSky(map, cx, cy) && toBrood(col, cx, cy, dir) >= 0) {
    // A young ant keeps with the queen and brood (slice 6): along their marks, deeper into the nest.
    dir = toBrood(col, cx, cy, dir);
    col.digAim[i] = NaN;
  } else if (mode === EXPLORE && ent && col.outbound(i) && !isSky(map, cx, cy) && climbOut(col, cx, cy) >= 0) {
    // An old forager inside the nest heads up and out (slice 6: foragers leave by the shaft, climbing: gravity).
    dir = climbOut(col, cx, cy);
    col.digAim[i] = NaN;
  } else {
    const side = col.hand[i];
    let next = handOnWall(map, cx, cy, dir, side);
    // An inside worker at the top of the shaft turns back down rather than step out onto the ground (zoned by age).
    if (
      col.staysIn(i) &&
      isSky(map, stepX(cx, cy, next), stepY(cy, next)) &&
      rockAt(map, stepX(cx, cy, (dir + 3) % 6), stepY(cy, (dir + 3) % 6)) === OPEN
    )
      next = (dir + 3) % 6;
    // A digger in the side view's nest, crowded: it builds chambers.
    const builds = mode === EXPLORE && col.entrance !== null && col.mayDig(cx, cy) && col.digs(i) && !col.forageDigs(i) && col.crowded();
    const chamberHere = builds ? (map.chambers?.at(cx, cy) ?? -1) : -1;
    // In a chamber still narrow enough to walk like a tunnel (a new one, a cell or two): widen it along its floor.
    const widen = chamberHere >= 0 && col.rng() < WIDEN ? widenWay(col, cx, cy, dir) : -1;
    const start = widen < 0 && builds ? newChamberWay(col, cx, cy) : -1;
    if (widen >= 0) {
      dir = widen;
      col.digAim[i] = DIR_ANGLE[widen];
      aimChamber(col, i, stepX(cx, cy, widen), stepY(cy, widen), chamberHere + 1);
    } else if (start >= 0) {
      // A new chamber, sideways off this tunnel (see newChamberWay).
      dir = start;
      col.digAim[i] = DIR_ANGLE[start];
      aimChamber(col, i, stepX(cx, cy, start), stepY(cy, start), 0);
    } else if (next === (dir + 3) % 6 || rockAt(map, stepX(cx, cy, next), stepY(cy, next)) !== OPEN) {
      // A dead end: dig on. The tunnel carries a heading (the one its end was dug at), which drifts a
      // little each cell: the end cell nearest that heading is dug, so tunnels wander at any angle
      // rather than run straight along the grid. Now and then it forks, 60° to one side.
      const run = tunnelHeading(map, cx, cy);
      let aim = (Number.isNaN(run) ? DIR_ANGLE[dir] : run) + gauss(col.rng) * col.params.tunnelDrift;
      // A fork is a Y: this arm 60° to one side, the other 60° to the other, dug by the next digger to pass.
      let forkSide = 0;
      if (col.rng() < FORK) {
        forkSide = col.rng() < 0.5 ? -1 : 1;
        aim += forkSide * (Math.PI / 3);
      }
      // A dead end the colony is filling back (a cell beside it put back moments ago) is left, not dug
      // on: filling a branch from its tip leaves a new dead end, and digging there undid the fill.
      let dug =
        !col.mayDig(cx, cy) || !col.digs(i) || besideRefill(map, cx, cy, col.time, col.params.backfill.hold)
          ? -1
          : chooseDig(map, cx, cy, aim, col.rng(), col.time, col.params.backfill.hold);
      // Digging is social: the more nestmates round it, the likelier an ant is to dig (and, as the nest
      // grows roomy and they spread out, the less). That is how real colonies stop excavating once
      // they have room (Rasse & Deneubourg 2001); a lone ant at a far tunnel's end still digs now and then.
      // A forager on a foraging dig digs on alone and whatever the room (ja-16rp): its tunnels run out to the soil's food.
      const foraging = col.forageDigs(i);
      if (dug >= 0 && !foraging && col.friends && col.rng() > digChance(col.friends, cx, cy)) dug = -1;
      // A roomy nest (the side view's chambers have floor enough) barely digs on (ja-wii: digging stops with room).
      if (dug >= 0 && !foraging && !col.crowded() && col.rng() > ROOMY_DIG) dug = -1;
      // The other arm two ways round from the way actually dug, on the other side: never next to it, so both
      // stay a tunnel's end (taken from the aim, a dithered dig put the two arms side by side about 1 fork in 8).
      // It carries on at the mirrored heading, drift and all, so its run wanders like any tunnel's.
      if (dug >= 0 && forkSide !== 0) markFork(map, cx, cy, (dug - 2 * forkSide + 12) % 6, aim - forkSide * ((2 * Math.PI) / 3));
      if (dug < 0 && rockAt(map, stepX(cx, cy, next), stepY(cy, next)) !== OPEN) {
        col.gx[i] = NO_CELL; // walled in on every side (it can't be, having walked in): steer freely
        return false;
      }
      col.digAim[i] = dug >= 0 ? aim : NaN;
      dir = dug < 0 ? next : dug;
    } else {
      // Passing a fork's undug arm: dig it (if it is still a tunnel's end), else walk on.
      const fork = takeFork(map, cx, cy);
      let fd = fork ? fork.dir : -1;
      // Social, like any dig, and rare in a roomy nest (ROOMY_DIG, as at a tunnel's end); only a digger's job (slice 6):
      // a passer-by who won't dig now leaves the fork for the next.
      if (
        fork &&
        (!col.digs(i) ||
          (!col.forageDigs(i) &&
            ((col.friends && col.rng() > digChance(col.friends, cx, cy)) || (!col.crowded() && col.rng() > ROOMY_DIG))))
      ) {
        markFork(map, cx, cy, fork.dir, fork.aim);
        fd = -1;
      }
      if (
        fork &&
        fd >= 0 &&
        col.mayDig(cx, cy) &&
        rockAt(map, stepX(cx, cy, fd), stepY(cy, fd)) === SOIL &&
        tunnelEnd(map, stepX(cx, cy, fd), stepY(cy, fd))
      ) {
        dir = fd;
        col.digAim[i] = fork.aim;
      } else {
        dir = next;
        col.digAim[i] = NaN; // walking on, not to a face
      }
    }
  }
  col.gdir[i] = dir;
  col.gx[i] = stepX(cx, cy, dir);
  col.gy[i] = stepY(cy, dir);
  return true;
}

/**
 * Keeping a hand on a chamber's wall, cell by cell (it touched soil): so it finds the tunnels
 * leading off the chamber, and now and then (START_HUG a cell) starts one of its own into the wall.
 */
export function hug(col: Colony, i: number, cx: number, cy: number, fresh: boolean): boolean {
  const { map } = col;
  const side = col.hand[i];
  let dir = col.gdir[i];
  const wallDir = (dir + side + 6) % 6; // the wall cell ahead on the hand side
  const wx = stepX(cx, cy, wallDir);
  const wy = stepY(cy, wallDir);
  const crowded = col.crowded();
  const here = map.chambers?.at(cx, cy) ?? -1;
  const brood = here >= 0 ? map.chambers!.list[here]!.brood : 0;
  const widen =
    !fresh &&
    here >= 0 &&
    crowded &&
    col.mayDig(cx, cy) &&
    col.digs(i) &&
    !col.forageDigs(i) &&
    col.rng() < WIDEN * (1 + BROOD_PULL * Math.min(brood, 10))
      ? widenWay(col, cx, cy, wallDir)
      : -1;
  if (widen >= 0) {
    // Widen the chamber along its floor (dug like any face; the cell joins the chamber when it is open: see tick).
    dir = widen;
    col.digAim[i] = DIR_ANGLE[widen];
    aimChamber(col, i, stepX(cx, cy, widen), stepY(cy, widen), here + 1);
  } else if (
    !fresh &&
    rockAt(map, wx, wy) === SOIL &&
    col.rng() < START_HUG &&
    (crowded || col.rng() < ROOMY_DIG) &&
    col.mayDig(cx, cy) &&
    col.digs(i) &&
    startable(map, wx, wy, wallDir) &&
    !refilled(map, wx, wy, col.time, col.params.backfill.hold)
  ) {
    dir = wallDir;
    col.digAim[i] = DIR_ANGLE[wallDir];
  } else {
    dir = handOnWall(map, cx, cy, dir, side);
    col.digAim[i] = NaN;
  }
  col.gdir[i] = dir;
  col.gx[i] = stepX(cx, cy, dir);
  col.gy[i] = stepY(cy, dir);
  return true;
}

/** Ant i is going to dig cell (x, y) for a chamber: `forId` = its id + 1, or 0 for a new chamber there. */
export function aimChamber(col: Colony, i: number, x: number, y: number, forId: number): void {
  col.chamberCell[i] = cellKey(x, y);
  col.chamberFor[i] = forId;
}

/**
 * An explorer touching a wall of its own colony's chamber, the nest crowded: the wall cell (a neighbour of (cx, cy),
 * the way `prefer` first) that widens the chamber along its floor (within CHAMBER_HEIGHT rows of it), or −1.
 */
export function widenWay(col: Colony, cx: number, cy: number, prefer: number): number {
  const ch = col.map.chambers;
  if (!ch) return -1;
  const id = ch.at(cx, cy);
  if (id < 0) return -1;
  const c = ch.list[id]!;
  if (c.colony !== col.params.nest) return -1;
  // Chambers near the top are widened most (traffic: every forager passes them), so the nest is top-heavy (Tschinkel).
  if (col.rng() > Math.exp(-Math.max(0, c.floorRow - col.soilTop(cx)) / WIDEN_DEPTH)) return -1;
  for (let k = 0; k < 6; k++) {
    const d = (prefer + (k & 1 ? (k + 1) >> 1 : -(k >> 1)) + 6) % 6; // the preferred way, then alternately either side of it
    if (chamberFace(col, stepX(cx, cy, d), stepY(cy, d), c)) return d;
  }
  return -1;
}

/**
 * Whether soil cell (x, y) is a face an explorer may dig for chamber `c` (null: a new chamber): soil, not the mound's
 * loose soil nor the crust, not put back lately (refilled: dug at, it glances off), and a place a chamber cell may be (chamberSpot).
 */
export function chamberFace(col: Colony, x: number, y: number, c: Chamber | null): boolean {
  return (
    rockAt(col.map, x, y) === SOIL &&
    col.map.loose?.get(x, y) !== 1 &&
    !crust(col, x, y) &&
    !refilled(col.map, x, y, col.time, col.params.backfill.hold) &&
    col.chamberSpot(c, x, y)
  );
}

/**
 * An explorer in a tunnel of the side view's nest, crowded: start a new chamber sideways off it, here? Likelier near
 * the top (exp(−depth / CHAMBER_DEPTH)), and only CHAMBER_GAP + depth × CHAMBER_GAP_GROWTH rows from the colony's
 * nearest chamber round it, so they come out top-heavy with the gaps growing with depth (Tschinkel). The way, or −1.
 */
export function newChamberWay(col: Colony, cx: number, cy: number): number {
  const ch = col.map.chambers;
  if (!ch || isSky(col.map, cx, cy) || ch.at(cx, cy) >= 0) return -1;
  const depth = cy - col.soilTop(cx);
  if (depth < CHAMBER_MIN_DEPTH || col.rng() > NEW_CHAMBER * Math.exp(-depth / CHAMBER_DEPTH)) return -1;
  if (!col.chamberRoom(cx, cy, depth)) return -1;
  const first = col.rng() < 0.5 ? 0 : 3; // east or west, along the row
  for (const d of [first, 3 - first]) if (chamberFace(col, stepX(cx, cy, d), stepY(cy, d), null)) return d;
  return -1;
}

/** Steps a hand-on-wall walk (`side`) from (cx, cy), facing `dir`, takes on the side view's ground to a cell nearer the hole than `min` (Infinity if not within GROUND_LOOK). */
export function groundLook(col: Colony, cx: number, cy: number, dir: number, side: number, min: number): number {
  let x = cx;
  let y = cy;
  let d = dir;
  for (let k = 1; k <= GROUND_LOOK; k++) {
    d = groundHand(col, x, y, d, side);
    x = stepX(x, y, d);
    y = stepY(y, d);
    if (rockAt(col.map, x, y) !== OPEN || !isSky(col.map, x, y)) return Infinity;
    if (holeMetric(col, x, y) < min - 1e-6) return k;
  }
  return Infinity;
}

/** handOnWall on the ground line: over the walkway (sky cells) and into the hole it heads for, never into another (see towardHole). */
export function groundHand(col: Colony, cx: number, cy: number, dir: number, side: number): number {
  const hy = (col.entrance as Nest).y;
  const ok = (d: number) => {
    const k = ((d % 6) + 6) % 6;
    const tx = stepX(cx, cy, k);
    const ty = stepY(cy, k);
    return rockAt(col.map, tx, ty) === OPEN && (isSky(col.map, tx, ty) || targetHole(col, tx, ty, hy));
  };
  const lost = ok(dir + side) && ok(dir + 2 * side);
  for (const turn of lost ? [0, -side, -2 * side, side, 2 * side, 3] : [side, 0, -side, -2 * side, 2 * side, 3]) {
    const d = (((dir + turn) % 6) + 6) % 6;
    if (ok(d)) return d;
  }
  return dir;
}

/** The side view: the way from cell (cx, cy) to an open neighbour farther from the hole on `side`, on the ground if it can, or −1. */
export function awayFromHole(col: Colony, cx: number, cy: number, side: number): number {
  const ex = (col.entrance as Nest).x;
  let best = -1;
  let bestV = side * (centreX(cx, cy) - ex) + 1e-6;
  for (let d = 0; d < 6; d++) {
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if (rockAt(col.map, tx, ty) !== OPEN) continue;
    const v = side * (centreX(tx, ty) - ex) + (isSky(col.map, tx, ty) ? 0.25 : 0); // up out of the hole onto the ground first
    if (v > bestV) {
      bestV = v;
      best = d;
    }
  }
  return best;
}
