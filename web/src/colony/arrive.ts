// Arrive (docs/refactor.md S3.4): the last stage of an ant's step in tick. Where the step landed it: food picked up, spoil or a corpse carried out and dropped, a pellet onto the mound or back as fill, a loose pellet or the plane's spoil taken up, home at the nest (food stored, a hand chosen, rest), tiredness, home and leaving again, and the bookkeeping of its home vector, floor marks, nest work and route on the plane. Moved out of Colony.tick verbatim but for `this` becoming `colony` (the moved code has its own `col` and `c`); a pellet carrier crossing up at its hole, or an ant on the plane going down a hole (its own, or a raided foe's), ends its step here (returns true).
import { NO_KEY } from "./ants.ts";
import type { Colony } from "./colony.ts";
import { crossDown, crossUp } from "./crossing.ts";
import { dropOut, dropPlane, pickPlane } from "./dig.ts";
import { cellKey, NO_CELL, SOIL_FILL, SOIL_LOOSE } from "./grid.ts";
import { CELL } from "./hex.ts";
import { atHome, destMark, fromHomePlane, integrate, routeRecord } from "./homing.ts";
import { nurse, port, undertake } from "./nestWork.ts";
import { layMark, nestmatesAround, returnsAround, touch } from "./sense.ts";
import type { AntStep } from "./step.ts";
import { fetches } from "./tunnel.ts";
import { CORPSE_GIVE_UP, MOUND_HEIGHT, MOUND_REACH, REST, ROAD_SIGN, SPOIL_GIVE_UP } from "./tuning.ts";
import { EXPLORE, FIGHT, FOLLOW, PLANE, RETURN, STRONG } from "./vocab.ts";
import { isSky, qualityAt, takeFoodCell } from "./world.ts";

export function arrive(colony: Colony, i: number, s: AntStep): boolean {
  const p = s.p;
  const rng = s.rng;
  const map = s.map;
  const ph = s.ph;
  const home = s.home;
  const dt = s.dt;
  const gate = s.gate;
  const hold = s.hold;
  const leak = s.leak;
  const metLeak = s.metLeak;
  const sgate = s.sgate;
  const crowdKeep = s.crowdKeep;
  let h = s.h;
  const toEnemy = s.toEnemy;
  const held = s.held;
  const carrying = s.carrying;
  const pellet = s.pellet;
  const nursing = s.nursing;
  const outward = s.outward;
  const x0 = s.x0;
  const y0 = s.y0;
  const mode = s.mode;
  const item = s.item;
  const resp = s.resp;
  let rolled = s.rolled;
  // Mechanics: pick up food where there is some (not mid-fight), put it down at the nest; the nest rests a tired ant.
  const ndx = colony.x[i] - home.x;
  const ndy = colony.y[i] - home.y;
  const atNest = ndx * ndx + ndy * ndy < home.r * home.r;
  const ent = colony.entrance;
  const atEntrance = ent !== null && Math.hypot(colony.x[i] - ent.x, colony.y[i] - ent.y) < ent.r;
  colony.antCell(i);
  // Activation (behaviour MR 5, docs/activation.md): an empty-jawed ant at home meets each nestmate that comes home
  // with food beside it (its cell and the six round it) once, in a count that leaks away; only successful returns
  // count. Counted as seconds of contact instead, a carrier, which turns round the moment its food is down, was met
  // for a tick: the count stayed under the threshold, and only scouts went out.
  // One world (ja-web): held at the gate, it meets every carrier that came down the hole last tick (holeSeen): each
  // walks down the shaft past all of them. Its count leaks on both layers, so a wait's count fades on its trip out.
  if (leak) {
    let m = colony.met[i] * metLeak;
    if (gate ? atNest && !carrying : held) m += gate ? returnsAround(colony, CELL[0], CELL[1]) : colony.holeSeen;
    colony.met[i] = m;
  }
  // How crowded home is (docs/stance.md), felt by a waiting ant: nestmates in its cell and the six round it, but itself.
  // (One world, ja-web: by an ant held at the gate, at the top of its shaft.)
  if (sgate || hold) {
    const c = colony.crowd[i];
    colony.crowd[i] = (sgate ? atNest && !carrying : held)
      ? c * crowdKeep + (nestmatesAround(colony, CELL[0], CELL[1]) - 1) * (1 - crowdKeep)
      : c * crowdKeep;
  }
  // A load just put down here isn't taken straight back up: not until the ant has stepped off the cell.
  const here = cellKey(CELL[0], CELL[1]);
  if (colony.putAt[i] !== here) colony.putAt[i] = NO_KEY;
  if (
    !carrying &&
    !pellet &&
    colony.putAt[i] === NO_KEY &&
    map.food.get(CELL[0], CELL[1]) > 0 &&
    resp.get(touch(colony, i, toEnemy !== null, mode, item, "food")) &&
    takeFoodCell(map, CELL[0], CELL[1])
  ) {
    colony.carrying[i] = 1;
    colony.quality[i] = qualityAt(map, CELL[0], CELL[1]);
    // Remembered too while ants ask for steering weights (staging, ja-ykmu): the `memory` weight steers by it.
    if ((p.siteFidelity > 0 || p.steerLane > 0) && colony.line !== null && colony.cur === PLANE) colony.rememberSite(i);
    colony.homeAfresh(i);
    colony.since[i] = 0;
    colony.fatigue[i] = 0; // found food: the search succeeded
    colony.tired[i] = 0;
    h += Math.PI;
  } else if (outward) {
    // One world's plane (U3c): carrying out by its own vector. Spoil is heaped once it believes itself spoilTo from
    // home; a corpse goes on the midden once it is at least that far and off the mound (no spoil underfoot, which it can
    // feel). Either is put down where it stands after its give-up time.
    colony.spoilT[i] = colony.spoilT[i] + dt;
    const corpse = colony.corpse[i] === 1;
    const far = fromHomePlane(colony, i) >= colony.spoilTo[i] && (!corpse || (map.spoil?.get(CELL[0], CELL[1]) ?? 0) === 0);
    if (far || colony.spoilT[i] > (corpse ? CORPSE_GIVE_UP : SPOIL_GIVE_UP)) dropPlane(colony, i);
  } else if (pellet && ent && !Number.isNaN(colony.spoilTo[i])) {
    // Carrying a pellet out along the ground (side view): dropped where it stands once far enough out (or stuck).
    colony.spoilT[i] = colony.spoilT[i] + dt;
    const col = CELL[0];
    const onGround = isSky(map, col, CELL[1]);
    if (
      (onGround && colony.spoilSide[i] * (col - colony.entranceCol) >= colony.spoilTo[i]) ||
      colony.spoilT[i] > (colony.corpse[i] ? CORPSE_GIVE_UP : SPOIL_GIVE_UP)
    )
      dropOut(colony, i, col);
    // Dropped, it doesn't turn back: out on the ground, it is asked afresh (most explore it), so the ground near the
    // nest is searched. Turned straight back in, almost nobody was on the ground to find the food there.
  } else if (pellet && atEntrance && colony.soil[i] !== SOIL_FILL && colony.line !== null) {
    // One world: the spoil (or the dead) goes up the hole onto the plane, where it is put down (crossUp).
    crossUp(colony, i, colony.entranceCol, colony.entranceRow);
    colony.heading[i] = h;
    s.h = h;
    s.rolled = rolled;
    return true;
  } else if (pellet && atEntrance && colony.soil[i] !== SOIL_FILL) {
    // Up and out of the hole: it carries the pellet on out along the ground to drop it, farther as the mound grows
    // (MOUND_REACH at most; more of them farther out, √ of a uniform draw), so the mound spreads as a disc, its area
    // tracking the nest's volume (Tschinkel 2015), where you see them drop it.
    const reach = Math.min(MOUND_REACH, 3 + colony.heaped / (2 * MOUND_HEIGHT));
    if (colony.corpse[i]) {
      // A corpse goes to the midden: one heap just past the mound's edge (harvesters: at the edge of the cleared disc).
      colony.spoilTo[i] = colony.middenAt();
      colony.spoilSide[i] = colony.middenSide();
    } else {
      colony.spoilTo[i] = 2 + reach * Math.sqrt(rng());
      colony.spoilSide[i] = rng() < 0.5 ? -1 : 1;
    }
    colony.spoilT[i] = 0;
    colony.staleWalk[i] = 0;
    colony.wall[i] = 0;
    colony.mx[i] = NaN;
    colony.gx[i] = NO_CELL;
  } else if (pellet && colony.soil[i] === SOIL_FILL && atNest && !(colony.line !== null && colony.cur === PLANE)) {
    // A loose pellet taken down to fill unused space, and none found on the way: it carries it back out. Most do (over
    // 90 %: PRD §40), and that is the rule as meant: see LOOSE_FILL_PICK.
    colony.soil[i] = SOIL_LOOSE;
    colony.looseBack++;
    colony.wall[i] = 0;
    colony.mx[i] = NaN;
  } else if (
    ent &&
    !carrying &&
    !pellet &&
    mode === EXPLORE &&
    isSky(map, CELL[0], CELL[1]) &&
    colony.enteredCell(i) &&
    colony.pickLoose(i, CELL[0], CELL[1], toEnemy !== null)
  ) {
    // Picked up a loose pellet off the mound (see pickLoose).
  } else if (
    colony.line !== null &&
    colony.cur === PLANE &&
    !carrying &&
    !pellet &&
    mode === EXPLORE &&
    colony.enteredCell(i) &&
    pickPlane(colony, i, CELL[0], CELL[1], toEnemy !== null)
  ) {
    // One world's plane: picked up a pellet off the mound (see pickPlane).
  } else if (atNest && !(pellet && ent)) {
    colony.wall[i] = 0;
    colony.mx[i] = NaN;
    colony.untouched[i] = 0;
    colony.bestD[i] = Infinity;
    colony.stallT[i] = 0;
    if (colony.since[i] > 0) colony.hand[i] = rng() < 0.5 ? -1 : 1; // just in: the next trip out keeps whichever hand on the walls
    if (carrying && !colony.queen && resp.drop(touch(colony, i, toEnemy !== null, mode, item))) {
      colony.carrying[i] = 0;
      colony.stored++;
      colony.larder++;
      if (gate) colony.returning.set(here, (colony.returning.get(here) ?? 0) + 1);
      h += Math.PI;
    } else if (pellet && !ent && colony.line === null) {
      // The soil goes on the mound: real ants dump it round the entrance, which is how mounds grow. (One world's plane:
      // spoil is carried out by vector, dropPlane; a pellet going home to backfill goes on down its hole.)
      colony.pellet[i] = 0;
      colony.soilOut++;
      h += Math.PI;
    }
    colony.since[i] = 0;
    // Home and resting in "return" (its policy said so, or a cached answer did: ja-qnx): after REST seconds it is
    // asked afresh as an explorer, once it is no longer tired (fatigue rests it first: ja-q47).
    // (One world's returners on the plane don't rest at the hole: they go in, crossDown.)
    if (
      mode === RETURN &&
      !carrying &&
      !pellet &&
      // Tired, it rests; hungry enough to fetch, it gets up (restFetch, ja-4rfr: the old retired inside sat by the
      // starving brood).
      (!colony.isTired(i) || (p.restFetch > 0 && colony.under[i] === 1 && fetches(colony, i))) &&
      !colony.inbound(i, mode) &&
      (colony.restT[i] = colony.restT[i] + dt) > REST &&
      (!gate || ((rolled = true), colony.leaves(i, dt, toEnemy !== null)))
    ) {
      colony.mode[i] = EXPLORE;
      colony.asked[i] = -1;
      colony.restT[i] = 0;
    }
  } else colony.since[i] = colony.since[i] + dt;
  if (!atNest) colony.restT[i] = 0;
  // Fatigue (ja-q47, docs/tiredness.md): what makes a forager tired is an unsuccessful search, and rest is a stay
  // inside. It grows only while the ant is out with empty jaws, exploring, following or fighting (a raid or a defence
  // tires it too: with fights left out, nothing sent a fighter home, raids never ended and combat losses rose 56-72 %,
  // review of #36), and falls while it is inside its own nest (its hole on the ground or its tunnels and chambers),
  // a full rest taking restTime. Finding food clears it (above). Digging, carrying spoil or nursing
  // neither tire nor rest it. Before, a timer that only the hole reset made every inside worker "tired".
  {
    const inside = atNest || (ent !== null && colony.under[i] === 1 && colony.ownNestHere(i));
    // Both run on the ant's clock (the fungus's lever slows tiring and resting alike), and fatigue stops at twice
    // patience, so an ant kept out (by Jev, say) needs no more than twice restTime to rest (review of #36).
    const m = colony.mode[i];
    if (inside) colony.fatigue[i] = Math.max(0, colony.fatigue[i] - ((p.patience / p.restTime) * dt) / colony.clock[i]);
    else if (!colony.carrying[i] && !colony.pellet[i] && !colony.broodHeld[i] && (m === EXPLORE || m === FOLLOW || m === FIGHT))
      colony.fatigue[i] = Math.min(2 * p.patience, colony.fatigue[i] + dt / colony.clock[i]);
    // Tired once past patience, and until fully rested: resting only to just under the line sent foragers out to
    // tire again at once (G: up to 8 held, food home -9 %, in the first sweep).
    if (colony.fatigue[i] > colony.patience(i)) {
      // Tired where it searches round its last find's spot, with nothing found: that spot is spent (ja-lp4.15).
      if (colony.tired[i] === 0 && p.siteFidelity > 0 && colony.search[i] !== 0 && colony.line !== null && colony.cur === PLANE)
        colony.foodX[i] = colony.foodY[i] = NaN;
      colony.tired[i] = 1;
    } else if (colony.fatigue[i] === 0) colony.tired[i] = 0;
  }
  // Home (ja-qnx): going home is a trip, and it ends there. An ant asked what to do with "return" as its mode keeps
  // returning (Jev answered "return" to every returner, home or not: PRD §42.4), so a fresh one that has got home with
  // empty jaws is no longer returning: it is asked afresh as `arrive` says. In the side view a tired one stays in, as
  // before: nothing underground rests it, so the colony's tired foragers retire inside (resting them sent them out
  // again, and more food than the porters could carry piled up at reception, A8). On a top-down map rest is instant:
  // the nest has just reset `since` above, so every returner there reads fresh and goes out at once (a timer artefact
  // that ja-q47 replaces). Home is the nest on a top-down
  // map. In the side view it is the royal chamber, where a returner homes to, and only for foragers (the old, zoned
  // by age), as measured:
  // - at its hole (passed on the way in, where a returner is asked afresh anyway) the trip's end sent explorers down
  //   the carriers' food scent into the nest, where they jammed carriers (A8);
  // - in any chamber, it left the young off the queen's side (zoning.test);
  // - for the young and middle-aged, who work inside, it sent porters out and the queen starved on 1-2 of 4 worlds in
  //   the hour-long economy run (slow/economy.test).
  // (One world: a returner's trip ends inside, as the side view's does; on the plane it is still going in.)
  if (
    p.arrive !== "return" &&
    colony.mode[i] === RETURN &&
    !carrying &&
    !pellet &&
    !nursing &&
    !colony.isTired(i) &&
    // A hot one (the desert ant's heat, ja-rf5.5) rests to cool first, as a tired one rests (review of #155, N6); always 0 without heat.
    !colony.hot[i] &&
    !colony.inbound(i, RETURN) &&
    (ent === null ? atNest : colony.under[i] === 1 && colony.band(i) === 2 && atHome(colony, i)) &&
    (!gate || (!rolled && colony.leaves(i, dt, toEnemy !== null)))
  ) {
    // A raid scout starts exploring, not on a food trail (review of #53, N6).
    // `p.follows`: defensive, as at the gated hole (review of #121, N1).
    colony.mode[i] = p.arrive === "follow" && p.follows && !colony.recruited[i] ? FOLLOW : EXPLORE;
    colony.asked[i] = -1;
    colony.restT[i] = 0;
  }
  if (ent) {
    // Zoned by age (slice 6): an ant not to go out that has just stepped up out of the hole onto the ground goes
    // back down (carriers aside: soil goes out to the mound; food is on its way in).
    if (colony.queen && colony.under[i] && !carrying && !pellet && !colony.mayGoOut(i)) {
      colony.antCell(i);
      if (isSky(map, CELL[0], CELL[1])) h = colony.pointDown(i, x0, y0, h);
    }
    integrate(colony, i, x0, y0, atNest);
    // Road signs: underground, a strong nest trail where it stands tells it where it is, and its memory's error fades
    // (Heyman et al. 2017; slice 3 gives each chamber its own mark). Outside, the hole's sight and smell do it (believe).
    // Read on the floor where it stands (a road sign is under its antennae; the sensors ahead are often in soil in a tunnel).
    if (
      colony.under[i] &&
      (ph.fields.home.get(CELL[0], CELL[1]) * colony.gainHome[i] >= STRONG ||
        ph.fields[destMark(colony, i)].get(CELL[0], CELL[1]) * colony.gainHome[i] * colony.gainMarks[i] >= STRONG)
    )
      colony.odoNest[i] = colony.odoNest[i] * Math.exp(-dt / ROAD_SIGN);
    if (colony.map.chambers) layMark(colony, i, dt);
    if (colony.queen) {
      nurse(colony, i, dt, toEnemy !== null);
      if (port(colony, i, dt, toEnemy !== null)) h += Math.PI;
      if (colony.params.undertakes) undertake(colony, i, dt, toEnemy === null);
    }
  }
  // One world: on the plane, at a hole's cell. Its own: in, if it is going in (wantsIn). Another colony's: a raider
  // goes down that shaft (one-world §4). Crossing is where it stands; it reads nothing else.
  if (colony.line !== null && colony.cur === PLANE) {
    // Path integration on the plane (U3b): it counts its way out, as integrate does on the side view's ground; once it
    // heads home the vector is fixed.
    // Carrying spoil or a corpse out (U3c), it counts too: it is on its way out, and drops by the vector it brought.
    if (colony.mode[i] !== RETURN || outward) colony.odoSurf[i] = colony.odoSurf[i] + Math.hypot(colony.x[i] - x0, colony.y[i] - y0);
    if (p.routeMemory > 0 && (colony.mode[i] === EXPLORE || colony.mode[i] === FOLLOW) && !colony.carrying[i]) routeRecord(colony, i);
    colony.antCell(i);
    const k = colony.holeAt(CELL[0], CELL[1]);
    if (k >= 0 && (k === p.nest ? colony.wantsIn(i, colony.mode[i]) : colony.mode[i] === FIGHT && colony.stanceOf(i) === "raid")) {
      crossDown(colony, i, k);
      s.h = h;
      s.rolled = rolled;
      return true;
    }
  }
  s.h = h;
  s.rolled = rolled;
  return false;
}
