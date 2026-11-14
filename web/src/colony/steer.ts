// Steer (docs/refactor.md S3.4): the fourth stage of an ant's step in tick. The heading it walks this step: homing to where it believes its goal is (its vector, the hole, a pellet up the shaft, trails, walls, backfill and stale tunnels), following a trail, fighting or raiding, exploring and digging; then fleeing, alarm, the trail it lays, the wait at home, and the last stretch into its hole. Moved out of Colony.tick verbatim but for `this` becoming `col`; the heading goes to the next stages through the step record.
import { NO_KEY } from "./ants.ts";
import type { Colony, HoleCell } from "./colony.ts";
import { backfill, enterStale, staleStep } from "./dig.ts";
import { avoid, choose, climb, handOnWall, inReach, NO_CELL, SOIL_FILL, tunnel, turnToward } from "./grid.ts";
import { CELL, cellOf, centreX, centreY, hexDistance, SIDE, nx as stepX, ny as stepY } from "./hex.ts";
import { believe, homeScentNear, routeFail, searchOn } from "./homing.ts";
import { LOOP_AT, NO_ENTRY_DROP, NO_ENTRY_RATE, NO_ENTRY_TRAIL, SEEN } from "./params.ts";
import { touch, touchProbe } from "./sense.ts";
import type { AntStep } from "./step.ts";
import {
  BY_VECTOR,
  FOLLOW_FLIP,
  FOLLOW_GIVE_UP,
  GAIN,
  MIDDEN_AVOID,
  NEST_SIGHT,
  NO_GAIN,
  SEARCH_STALL,
  TUNNEL_STALL,
  WAIT_RIM,
  WALL_LOST,
} from "./tuning.ts";
import { fetches, walkTunnel } from "./tunnel.ts";
import { EXPLORE, FAINT, FIGHT, FOLLOW, PLANE, RETURN } from "./vocab.ts";
import { isSky, OPEN, rockAt } from "./world.ts";
import { mill, onMLine, siteAim } from "./plane.ts";
import type { Mark } from "./pheromone.ts";

const STORE_MARKS: readonly Mark[] = ["store"];
const ROYAL_MARKS: readonly Mark[] = ["royal"];

/** The floor marks `marks`, summed, at ant i's antenna on bearing b: read through open ground only (inReach), else 0. */
function marksAt(col: Colony, i: number, b: number, marks: readonly Mark[]): number {
  const x = col.x[i];
  const y = col.y[i];
  const d = col.params.sensorDistance;
  const sx = x + Math.cos(b) * d;
  const sy = y + Math.sin(b) * d;
  if (!inReach(col.map, x, y, sx, sy)) return 0;
  let v = 0;
  for (const m of marks) v += col.ph.read(m, sx, sy);
  return v;
}

export function steer(col: Colony, i: number, s: AntStep): void {
  const p = s.p;
  const rng = s.rng;
  const map = s.map;
  const ph = s.ph;
  const home = s.home;
  const a = s.a;
  const dt = s.dt;
  const gate = s.gate;
  const rgate = s.rgate;
  let h = s.h;
  const fl = s.fl;
  const ff = s.ff;
  const fr = s.fr;
  const hl = s.hl;
  const hf = s.hf;
  const hr = s.hr;
  const al = s.al;
  const af = s.af;
  const ar = s.ar;
  const toEnemy = s.toEnemy;
  const held = s.held;
  const carrying = s.carrying;
  const pellet = s.pellet;
  const outward = s.outward;
  const reporting = s.reporting;
  const goal = s.goal;
  let nest = s.nest;
  const mode = s.mode;
  const prevMode = s.prevMode;
  const item = s.item;
  const resp = s.resp;
  const waiting = s.waiting;
  const fleeFrom = s.fleeFrom;
  // Homing steers for where the ant believes the goal is (its drifting home vector), not for the goal itself.
  // A pellet carrier is taking soil up and out: it climbs (gravity), and up the shaft is the hole, so no vector.
  // (Steering it by a drifted one left carriers surfacing off target and dropping spoil in pits beside the hole.)
  // (On one world's plane a loose pellet taken home to backfill homes by its vector, as any returner there.)
  if (mode === RETURN && (!pellet || (col.line !== null && col.cur === PLANE && col.soil[i] === SOIL_FILL))) nest = believe(col, i, goal);
  col.goalX = nest.x;
  col.goalY = nest.y;
  col.holeX = goal === col.entrance ? nest.x : (col.entrance?.x ?? 0);
  // Steer by mode. An explorer at a soil face keeps its heading while it digs.
  const noise = (rng() - 0.5) * 2 * dt;
  const detouring = col.detour[i] > 0;
  if (mode !== EXPLORE) col.digT[i] = 0;
  if (mode !== EXPLORE || pellet) col.hugT[i] = 0;
  else col.hugT[i] = Math.max(0, col.hugT[i] - dt);
  if (mode !== prevMode) {
    col.gx[i] = NO_CELL;
    col.digAim[i] = NaN;
    col.chamberCell[i] = NO_KEY; // a face aimed at as an explorer: stale once it does something else (review of slice 2)
  }
  const digging = col.digT[i] > 0;
  if (mode !== RETURN) {
    col.wall[i] = 0;
    col.mx[i] = NaN;
  }
  if (held && col.leaveOk[i] === 0) {
    // One world (ja-web): held at the gate, it mills among the top cells of its shaft (mill), where the carriers come
    // down past it.
    if (mill(col, i, p.speed * dt)) h = col.towardTarget(i);
    else h += noise * p.wander;
  } else if (outward) {
    // Out on its heading; a bump turned it (in moveDig, where the step is blocked), and while it wanders after one, it wanders.
    if (detouring) h += noise * p.wander;
    else h = turnToward(h, col.spoilA[i], p.turnRate * dt) + noise * p.wander * 0.25;
  } else if (mode === RETURN) {
    // Homing uses only what an ant has: its home vector (path integration: real ants count steps
    // against a sky compass), its antennae, and touch. A straight line home walks into the same
    // wall forever (reviews reproduced games where every homing ant of a colony was stuck), so a
    // blocked step starts wall-following by touch (the Bug2 rule, set up in moveDig, where the step is blocked):
    // keep the wall on one side until the ant is nearer home than where it met the wall
    // and the way home is open.
    const x = col.x[i];
    const y = col.y[i];
    const toNest = Math.atan2(nest.y - y, nest.x - x);
    // Progress: no cell nearer its goal in TUNNEL_STALL seconds (home scent can lead round a ring of tunnels for
    // ever), and the tunnel walker picks branches by its home vector for BY_VECTOR seconds (see walkTunnel); then by scent again.
    const near = Math.hypot(nest.x - x, nest.y - y);
    if (near < col.bestD[i] - 1) {
      col.bestD[i] = near;
      col.stallT[i] = 0;
    } else if ((col.stallT[i] = col.stallT[i] + dt) > TUNNEL_STALL + BY_VECTOR) {
      col.bestD[i] = near;
      col.stallT[i] = 0;
    }
    // One world's plane (U3b): any returner no nearer where it believes the hole is for SEARCH_STALL seconds searches on as
    // if it had got there. That is what unblocks a belief in rock or walled off (following the wall, one went round the
    // plane's edge), but most firings are away from the belief: on seed 1 (120 s) 596, 81 % more than 10 cells from it,
    // 92 cutting short a walk round rock (review of #60). Narrower versions delivered about the same (seeds 1–3), so
    // it stays a general "search sooner when blocked" rule.
    if (nest !== goal && col.stallT[i] > SEARCH_STALL && col.line !== null && col.cur === PLANE && !routeFail(col, i, true))
      searchOn(col, i, true);
    if (col.entrance && (col.wall[i] !== 0 || detouring)) {
      // On the ground line it homes cell by cell (see walkTunnel): no walls to follow, no detour to wander (an
      // explorer's detour, run up bumping round, used to carry on once it had food, and walk it away from the hole).
      col.antCell(i);
      if (isSky(map, CELL[0], CELL[1])) {
        col.wall[i] = 0;
        col.detour[i] = 0;
      }
    }
    // A carrier with food on a top-down map takes the food trail home where it agrees with its home vector (ja-00t,
    // docs/trails.md: foragers combine route cues and pheromone, path integration the fallback): each sensor's trail
    // counts only if its direction is within homeTrailCone of the way home. At a fork the vector can't tell the branches
    // apart (both lie off its line); the trail picks, not the wall a vector-led carrier walks into. Never the trail
    // alone: all-trail carriers milled on their own trail (PRD §45.3).
    let tl = 0;
    let tf = 0;
    let tr = 0;
    if (
      p.homeTrail > 0 &&
      carrying &&
      col.entrance === null &&
      !detouring &&
      Math.max(fl, ff, fr) >= FAINT &&
      Math.max(fl, ff, fr) < SEEN
    ) {
      const agrees = (b: number) => Math.cos(b - toNest) >= Math.cos(p.homeTrailCone);
      tl = agrees(h - a) ? fl : 0;
      tf = agrees(h) ? ff : 0;
      tr = agrees(h + a) ? fr : 0;
    }
    let onTrail = Math.max(tl, tf, tr) >= FAINT;
    if (onTrail && col.wall[i] !== 0) {
      // Following a wall: let go only where the trail's way is open. Letting go into rock, it met the same wall again
      // every step and never got round it (G′ seed 4: 59 carriers held over 120 s within 40 cells of home).
      const way = tl >= tf && tl >= tr ? h - a : tr > tf ? h + a : h;
      if (touchProbe(col, x, y, way, 1.2)) onTrail = false;
      else {
        col.wall[i] = 0; // the trail leads on: let go of the wall
        col.mx[i] = NaN;
      }
    }
    const side = col.wall[i];
    // Carrying a pellet out to the mound, it doesn't look for space to fill on the way (it has chosen the mound).
    const look =
      pellet &&
      !col.corpse[i] &&
      map.hasSoil &&
      Number.isNaN(col.spoilTo[i]) &&
      col.since[i] > col.params.backfill.after &&
      col.enteredCell(i);
    const lx = CELL[0];
    const ly = CELL[1];
    if (look && backfill(col, i, lx, ly)) {
      // Dropped its pellet into unused space beside it: the trip is done; turned round, it is asked afresh next tick.
      h += Math.PI;
      col.gx[i] = NO_CELL;
      col.wall[i] = 0;
      col.mx[i] = NaN;
    } else if (look && Number.isNaN(col.spoilTo[i]) && enterStale(col, i, lx, ly)) {
      h = col.towardTarget(i); // into a stale branch, to fill its end
    } else if (col.staleWalk[i] && staleStep(col, i, p.speed * dt)) {
      h = col.towardTarget(i); // on along it
    } else if (side === 0 && !(detouring && col.detour[i] > 0) && walkTunnel(col, i, RETURN, p.speed * dt)) {
      h = col.towardTarget(i); // in a tunnel: back the way it came (a wall it is already following, it keeps following)
    } else if (side === 0) {
      // Free: the home vector, with the home trail as a hint only (climbing it at full rate let
      // clusters of homing ants circle on their own trail). After giving up on a wall, wander a while.
      if (detouring) h += noise * p.wander;
      else if (onTrail) {
        h += choose(tl, tf, tr, p.turnRate * dt * p.homeTrail, p.followChoice || 1, rng) + noise * p.wander * 0.25;
        h = turnToward(h, toNest, p.turnRate * dt * 0.8 * (1 - p.homeTrail));
      } else {
        // Where it believed home was, and nothing there (the side view's drifting vector): search round it.
        // (On one world's plane with loops, within LOOP_AT: at its speed it turns no tighter than ~1.2 cells, and circled
        // a point 1 away until it stalled.)
        if (
          nest !== goal &&
          Math.hypot(nest.x - x, nest.y - y) < (p.searchLoops > 0 && col.line !== null && col.cur === PLANE ? LOOP_AT : 1) &&
          !routeFail(col, i, false)
        )
          searchOn(col, i);
        // On one world's plane, searching (its vector ran out where no hole was) with the home trail under its antennae and
        // its hole not yet in sight (in sight, it steers for the hole itself: review of #60), the trail leads, with the share
        // of its turning a carrier gives a food trail (homeTrail): route cues and scent first, the vector the fallback
        // (docs/trails.md). Led by its loops alone, colonies delivered up to 44 % less food than U3a's in the spike
        // (one-world §4, U3b as built).
        const lead =
          nest !== goal && col.search[i] !== 0 && col.line !== null && col.cur === PLANE && Math.max(hl, hf, hr) >= FAINT ? p.homeTrail : 0;
        h += climb(hl, hf, hr, p.turnRate * dt * (lead || 0.25)) + noise * p.wander * 0.25;
        h = turnToward(h, toNest, p.turnRate * dt * 0.8 * (1 - lead));
      }
    } else {
      const t0 = col.followT[i];
      const t = t0 + dt;
      col.followT[i] = t;
      if (t0 < FOLLOW_FLIP && t >= FOLLOW_FLIP) {
        // Probably the long way round (a big rock mass, or the map's edge): try the other side, same line home.
        col.wall[i] = -side as -1 | 1;
        col.gdir[i] = (col.gdir[i] + 3) % 6;
        col.gx[i] = NO_CELL; // decide afresh from here
      }
      if (!col.byCell[i]) {
        // In a tunnel now (the ground round it was filled in, or it followed the wall into one): by cell from
        // here. Steering by touch can't walk a passage one cell wide; it turns on the spot until it gives up.
        col.antCell(i);
        if (tunnel(map, CELL[0], CELL[1])) {
          col.byCell[i] = 1;
          col.gx[i] = NO_CELL;
        }
      }
      if (!col.byCell[i]) {
        // Round rock in open ground: steer by touch.
        if (t0 < FOLLOW_FLIP && t >= FOLLOW_FLIP) h += Math.PI;
        const dist = Math.hypot(nest.x - x, nest.y - y);
        if (dist < col.hitDist[i] - 1 && onMLine(col, i, x, y) && !touchProbe(col, x, y, toNest, 1.5)) {
          col.wall[i] = 0; // back on its line home, nearer than where it met this wall, and the way is open
          h = turnToward(h, toNest, p.turnRate * dt * 0.8);
        } else if (t >= FOLLOW_GIVE_UP) col.giveUp(i);
        else {
          // Keep the wall on its side (+1 = right: the ant turns left round it; angles grow clockwise, y down).
          const sd = col.wall[i];
          const ahead = touchProbe(col, x, y, h, 1);
          if (ahead)
            h -= sd * p.turnRate * dt * 2; // wall ahead: turn away
          else if (!touchProbe(col, x, y, h + sd * 0.9, 1.2)) h += sd * p.turnRate * dt; // the wall fell away: hug round the corner
          // Touching nothing, ahead or on the wall side (alarm or a thin rock tip threw it off): the hug
          // would only circle in the open. Let go and walk the home vector; the line home is kept.
          if (ahead || touchProbe(col, x, y, h + sd * (Math.PI / 2), 1.2)) col.untouched[i] = 0;
          else if ((col.untouched[i] = col.untouched[i] + dt) > WALL_LOST) col.wall[i] = 0;
        }
      } else if (t >= FOLLOW_GIVE_UP) col.giveUp(i);
      else {
        // Soil, or a tunnel: cell by cell, a hand on the wall. At each cell's centre, feel round from
        // the hand side to the other (six ways), and take the first open one. In a tunnel this
        // walks the tunnel (steering by touch can't, one cell wide); in a tree of tunnels it visits every branch.
        // A target cell filled since (backfill), or no longer beside it (it was pushed off its cell), is decided
        // afresh too: steering for it would pin the ant against the filled ground between.
        col.antCell(i);
        const lost =
          col.gx[i] !== NO_CELL && (rockAt(map, col.gx[i], col.gy[i]) !== OPEN || hexDistance(col.gx[i], col.gy[i], CELL[0], CELL[1]) > 1);
        const reached =
          col.gx[i] === NO_CELL || lost || Math.hypot(centreX(col.gx[i], col.gy[i]) - x, centreY(col.gy[i]) - y) <= p.speed * dt;
        if (reached) {
          cellOf(x, y);
          // A lost target: the next way is felt from the cell it is in (the wall's first cell stays its first).
          const own = col.gx[i] === NO_CELL || lost;
          const cx = own ? CELL[0] : col.gx[i];
          const cy = own ? CELL[1] : col.gy[i];
          const ox = centreX(cx, cy);
          const oy = centreY(cy);
          const dist = Math.hypot(nest.x - ox, nest.y - oy);
          const open = !touchProbe(col, ox, oy, Math.atan2(nest.y - oy, nest.x - ox), 1.5);
          if (col.gx[i] === NO_CELL) {
            // The first cell of this wall: coming back to it means it has been all the way round.
            col.loopX[i] = cx;
            col.loopY[i] = cy;
          }
          const looped = t > 2 && col.gx[i] !== NO_CELL && cx === col.loopX[i] && cy === col.loopY[i];
          cellOf(col.mx[i], col.my[i]);
          const hit = col.hitDist[i];
          const open2 = open && !touchProbe(col, ox, oy, Math.atan2(nest.y - oy, nest.x - ox), 2);
          // Back on its line home, nearer than the nearest it has been on this trip, with the way open.
          const onLine = dist < hit - 1 && onMLine(col, i, ox, oy, SIDE) && open;
          // Round an island and back where it met it, with the way home open (it met it turning, not heading home).
          const island = t > 2 && cx === CELL[0] && cy === CELL[1] && open;
          // In dug ground, the way home open two cells on and some way nearer than its best this trip.
          const nearer = t > 1 && dist < hit - GAIN && open2;
          // Or, a few times a trip, after 3 s of following wherever the way home is open: a hand on the wall
          // in a dug-out cavern drifts from speck to speck farther from home, and a speck needn't be walked
          // round. Only a few: a release that makes no progress could leave and meet the same wall for ever.
          const anywhere = t > 3 && col.noGain[i] < NO_GAIN && open2;
          const sight = Math.hypot(goal.x - ox, goal.y - oy) < NEST_SIGHT && col.clearTo(ox, oy, goal.x, goal.y);
          const leave = col.gx[i] !== NO_CELL && (onLine || island || nearer || anywhere || sight);
          // Into a tunnel with home scent: the scent leads from here (counted like a release: it may lead
          // back to this same wall, so after a few that gain nothing, only progress lets it go).
          const scent = !leave && (dist < hit - GAIN || col.noGain[i] < NO_GAIN) && tunnel(map, cx, cy) && homeScentNear(col, cx, cy);
          if (looped && !leave && !scent && col.byCell[i]) {
            // All the way round this wall (a speck of soil) and nowhere on it nearer home: it can't be the
            // way. Give up on it now (wander a while, then try afresh) rather than after FOLLOW_GIVE_UP.
            col.giveUp(i);
          } else if (leave || scent) {
            // Progress is kept from wall to wall: the next wall it meets is judged against the nearest it has been
            // (a give-up, which wanders, starts the trip's count afresh). A release that gains nothing counts
            // against the few allowed, an island's too (review of #10: leave, meet the same spot, go round, leave).
            if (dist < hit - GAIN) col.noGain[i] = 0;
            else if (!onLine && !nearer && !sight) col.noGain[i] = col.noGain[i] + 1;
            col.hitDist[i] = Math.min(hit, dist);
          }
          if (leave) {
            // Back on its line home, nearer than where it met this wall, and the way is open; or the nest
            // itself is in plain view.
            col.wall[i] = 0;
            h = turnToward(h, toNest, p.turnRate * dt * 0.8);
          } else if (scent) {
            // Into a tunnel with home scent to lead it: the tunnel walker takes it on from here (see
            // walkTunnel). Not the home vector: from a tunnel it can point into soil, and the blocked
            // step would start a new wall at once, every tick, with the give-up clock at zero (review of #8).
            col.wall[i] = 0;
            col.gx[i] = NO_CELL;
            if (walkTunnel(col, i, RETURN, p.speed * dt)) h = col.towardTarget(i);
          } else if (col.wall[i] !== 0) {
            const d = handOnWall(map, cx, cy, col.gdir[i], col.wall[i]);
            col.gdir[i] = d;
            col.gx[i] = stepX(cx, cy, d);
            col.gy[i] = stepY(cy, d);
          }
        }
        if (col.wall[i] !== 0) h = col.towardTarget(i);
      }
    }
  } else if (mode === FOLLOW && col.staysIn(i)) {
    // An inside worker (zoned by age) doesn't follow a food trail: it leads out, where it may not go. It explores.
    if (walkTunnel(col, i, EXPLORE, p.speed * dt)) h = col.towardTarget(i);
    else h += noise * p.wander;
  } else if (mode === FOLLOW) {
    if (!digging && walkTunnel(col, i, FOLLOW, p.speed * dt)) h = col.towardTarget(i);
    else {
      // "No entry" ahead (behaviour MR 3): the food scent it marks counts for less. Read only where some was laid, and
      // only outside (a top-down map, or the side view's ground), where food trails lead to food.
      const outside = col.entrance === null || !col.under[i];
      let gl = fl;
      let gf = ff;
      let gr = fr;
      if (p.noEntryAvoid > 0 && ph.live("noEntry") && outside) {
        const x = col.x[i];
        const y = col.y[i];
        const d = p.sensorDistance;
        const ne = (b: number) => p.noEntryAvoid * Math.max(0, ph.read("noEntry", x + Math.cos(b) * d, y + Math.sin(b) * d));
        if (gl < SEEN) gl = Math.max(0, gl - ne(h - a));
        if (gf < SEEN) gf = Math.max(0, gf - ne(h));
        if (gr < SEEN) gr = Math.max(0, gr - ne(h + a));
      }
      // Which way along the trail: by strength, not just to the strongest sensor (Deneubourg's choice: see choose).
      // Top-down maps only. In the side view's chambers food scent leads to stores and brood, and a chance turn there
      // kept porters from the food (the hour-long economy test: no porter trips, larvae starved); on its ground line,
      // where trails don't fork, it still halved the colony's births (PRD §45.3).
      h +=
        (p.followChoice > 0 && col.entrance === null
          ? choose(gl, gf, gr, p.turnRate * dt, p.followChoice, rng)
          : climb(gl, gf, gr, p.turnRate * dt)) +
        noise * p.wander * 0.25;
      // The trail ends here, strong, falling away all round, and no food in sight: the patch is spent. Mark it "no entry" (Robinson et al. 2005).
      if (p.noEntryAvoid > 0 && !carrying && outside && Math.max(fl, ff, fr) < SEEN) {
        col.antCell(i);
        const here = ph.fields.food.get(CELL[0], CELL[1]);
        // Only walking out, by its home vector (home behind it): walking in, the food trail fades ahead as it should.
        const ox = col.x[i] - nest.x;
        const oy = col.y[i] - nest.y;
        const outbound = Math.cos(h) * ox + Math.sin(h) * oy > 0.5 * Math.hypot(ox, oy);
        if (outbound && here >= NO_ENTRY_TRAIL && Math.max(fl, ff, fr) < here * NO_ENTRY_DROP) {
          const lay = resp.noEntry(touch(col, i, toEnemy !== null, mode, item));
          if (lay > 0) {
            col.antCell(i);
            ph.depositCell(
              "noEntry",
              CELL[0],
              CELL[1],
              p.deposit * (col.entrance === null ? p.foodTrailTop : 1) * lay * dt * NO_ENTRY_RATE,
            );
          }
        }
      }
    }
  } else if (mode === FIGHT) {
    // A calm ant (the fungus's cue) does not charge.
    // A raider in the side view walks on to the raided nest, cell by cell, past the alarm of fights behind it: steering
    // freely up the alarm left raiders in the pits by the rival's mound, 12–13 columns short of its hole (none got in).
    const sideRaid = col.stanceOf(i) === "raid" && col.raidTarget !== null && col.entrance !== null;
    if (toEnemy !== null) h = turnToward(h, toEnemy, p.turnRate * dt * 2 * (1 - col.calm[i]));
    else if (Math.max(al, af, ar) >= FAINT && !sideRaid) h += climb(al, af, ar, p.turnRate * dt);
    else if (sideRaid && ((col.detour[i] = 0), walkTunnel(col, i, FIGHT, p.speed * dt))) h = col.towardTarget(i);
    else if (col.stanceOf(i) === "raid" && col.raidTarget && col.entrance && col.under[i]) {
      // A raider in a chamber (no tunnel: free steering): out of its own nest by its hole, or on into the rival's.
      // Steering straight at the rival's hole through soil left nearly every raider bumping inside its own nest.
      col.antCell(i);
      const own = col.inOwnNest(CELL[0], CELL[1]);
      const aim = own ? col.entrance : (col.raidNest ?? col.raidTarget);
      h = turnToward(h, Math.atan2(aim.y - col.y[i], aim.x - col.x[i]), p.turnRate * dt) + noise * p.wander * 0.25;
    } else if (rgate && col.stanceOf(i) === "raid" && !detouring) {
      // Raiding by trail (behaviour MR 5.2): up the raid trail where there is one; without one, out and away from the home
      // trail, searching (the scouts). No coordinates: the trail runs where a scout walked, so it goes round rock.
      const x = col.x[i];
      const y = col.y[i];
      const d = p.sensorDistance;
      const rl = Math.max(0, ph.read("raid", x + Math.cos(h - a) * d, y + Math.sin(h - a) * d));
      const rf = Math.max(0, ph.read("raid", x + Math.cos(h) * d, y + Math.sin(h) * d));
      const rr = Math.max(0, ph.read("raid", x + Math.cos(h + a) * d, y + Math.sin(h + a) * d));
      const top = Math.max(rl, rf, rr);
      // Nothing ahead as strong as underfoot, facing along the trail (the front sensor strongest): the raider leaves the trail and
      // searches on (raidOnward) as a scout does (a run out, then a search), until home. Mostly near home, where the trail is weak
      // and patchy (review of #44: a median 0.05–0.19 of the way out); gated on a strong end instead, A11 gained less (1.67, 2.01).
      if (p.raidOnward > 0 && rf >= FAINT && rf === top && col.pastEnd[i] === 0 && rf < ph.read("raid", x, y)) col.pastEnd[i] = 1;
      if (top >= FAINT && col.pastEnd[i] === 0) h += climb(rl, rf, rr, p.turnRate * dt) + noise * p.wander * 0.25;
      else if (col.pastEnd[i] === 1 && top >= FAINT) h += avoid(hl, hf, hr, p.turnRate * dt * 0.5) + noise * p.wander * 0.25;
      else h += avoid(hl, hf, hr, p.turnRate * dt * 0.5) + noise * p.wander;
      // One world's plane (U3c): the raided colony's midden marks its ground there too, and raiders shy from it, as the
      // side view's do (Pogonomyrmex badius; slice 7).
      const m = col.raidMarks;
      if (col.line !== null && m?.live("midden")) {
        const read = (b: number) => m.read("midden", x + Math.cos(b) * d, y + Math.sin(b) * d);
        h += avoid(read(h - a), read(h), read(h + a), p.turnRate * dt * MIDDEN_AVOID);
      }
    } else if (!rgate && col.stance === "raid" && col.raidTarget && !detouring) {
      // At the rival hole's coordinates: the side view, or raidGate 0 (review of #41: an ant not recruited, put in FIGHT by Jev's
      // mode lane or a contact, walked here on a top-down map).
      const t = col.raidTarget;
      h = turnToward(h, Math.atan2(t.y - col.y[i], t.x - col.x[i]), p.turnRate * dt * 0.5) + noise * p.wander * 0.25;
      // The rival's midden marks its ground: raiders shy from it (Pogonomyrmex badius; slice 7).
      const m = col.raidMarks;
      if (m) {
        const x = col.x[i];
        const y = col.y[i];
        const d = p.sensorDistance;
        const read = (a: number) => m.read("midden", x + Math.cos(a) * d, y + Math.sin(a) * d);
        h += avoid(read(h - p.sensorAngle), read(h), read(h + p.sensorAngle), p.turnRate * dt * MIDDEN_AVOID);
      }
    } else h += noise * p.wander;
  } else if (!digging) {
    const seen = Math.max(fl, ff, fr) >= SEEN;
    // Food in sight, unless soil stands between (it touched soil a moment ago): then keep a hand on the wall.
    if (seen && !(col.hugT[i] > 0)) h += climb(fl, ff, fr, p.turnRate * dt);
    else if (walkTunnel(col, i, EXPLORE, p.speed * dt)) h = col.towardTarget(i);
    else if (p.restFetch > 0 && col.queen && col.under[i] && !carrying && !pellet && !col.broodHeld[i] && fetches(col, i)) {
      // Fetching in a chamber (ja-4rfr): toward the stores' marks its antennae meet (as toFood in a tunnel), through
      // open ground; none in reach, it searches the nest (it is not leaving: a hungry old forager headed for the hole).
      const l = marksAt(col, i, h - a, STORE_MARKS);
      const f = marksAt(col, i, h, STORE_MARKS);
      const r = marksAt(col, i, h + a, STORE_MARKS);
      h += Math.max(l, f, r) >= FAINT ? climb(l, f, r, p.turnRate * dt) : noise * p.wander;
    } else if (col.band(i) === 0 && col.under[i]) {
      // A young ant in a chamber goes toward the queen by her scent (the royal mark its antennae meet, laid where she lies
      // and on her chamber's floor), not her position (ja-k4k.2.1); none in reach, it searches. Not the brood mark too: a
      // road sign every ant lays along the tunnels from a brood chamber, climbing it spread the young out of her chamber,
      // and chambers.test's floor growth fell and economy.test stranded larvae (review of #192).
      const l = marksAt(col, i, h - a, ROYAL_MARKS);
      const f = marksAt(col, i, h, ROYAL_MARKS);
      const r = marksAt(col, i, h + a, ROYAL_MARKS);
      h += Math.max(l, f, r) >= FAINT ? climb(l, f, r, p.turnRate * dt * 0.3) + noise * p.wander * 0.5 : noise * p.wander;
    } else if (col.entrance && col.outbound(i) && col.under[i]) {
      // An old forager in a chamber heads out by its own vector: across by where its drifting nest vector puts the hole
      // (believe), not the hole's position (ja-k4k.2.2); its row is still the hole's true row ("Exact depth", docs/vision.md).
      const b = believe(col, i, col.entrance);
      h = turnToward(h, Math.atan2(b.y - col.y[i], b.x - col.x[i]), p.turnRate * dt * 0.5) + noise * p.wander * 0.5;
    } else if (
      p.foodPlume > 0 &&
      !carrying &&
      (col.entrance === null || (col.line !== null && col.cur === PLANE)) &&
      col.smellsFood(i, h, a, p.turnRate * dt)
    )
      h += col.plumeTurn + noise * p.wander * 0.25;
    else if (p.siteFidelity > 0 && col.line !== null && col.cur === PLANE && !Number.isNaN(col.foodX[i]))
      h = turnToward(h, siteAim(col, i), p.turnRate * dt) + noise * p.wander * 0.25;
    else h += noise * p.wander;
  }
  // Fleeing (behaviour MR 4): straight away from the strangers while they are in reach (then it resumes). Homing alone, the
  // fleeing ant often walked along them, or toward them, and died: G′ seed 2, 1,127 of the dead were fleeing.
  if (fleeFrom !== null && (col.entrance === null || !col.under[i])) h = turnToward(h, fleeFrom + Math.PI, p.turnRate * dt * 2);
  // Smelling alarm: the alarmGain response says how hard to shy from it (locally: every mode but fighting, unless digging).
  if (Math.max(al, af, ar) >= FAINT) {
    const gain = resp.alarmGain(touch(col, i, toEnemy !== null, mode, item));
    // On the side view's ground line a carrier can't go round alarm, only turn back: it carries on home through it.
    // Shying, carriers turned back from fights at their own hole and held their food (G seeds 4, 8: raids, 3 held).
    const noWayRound = carrying && col.entrance !== null && !col.under[i];
    if (gain > 0 && !noWayRound) h += avoid(al, af, ar, p.turnRate * p.alarmAvoid * gain * dt);
    // A faint alarm draws it: top-down only. In the side view the drawn explorers crowded the tunnels and the ground
    // line round the nest's fights (G seeds 1–20: 15/20 against 18/20 without the pull).
    else if (gain < 0 && col.entrance === null) h += climb(al, af, ar, p.turnRate * p.alarmDraw * -gain * dt);
  }

  // Lay trail: walking out marks the way home, carrying food marks the way to it; a pellet carrier lays none, and
  // nor does a porter (food moved between chambers is no food to recruit to: its trail drew 4–5× as many ants to
  // follow food scent underground, review of slice 5; it lays its chamber's mark like any ant inside, layMark).
  // The fungus can make it louder or quieter, and have a food carrier leak its food trail into the other colony's
  // field (exact as-is: × 1, nothing leaked).
  // Which trail, and how much, are the trail and trailRate responses.
  const tt = touch(col, i, toEnemy !== null, mode, item);
  const trail = resp.trail(tt);
  if (trail !== "none") {
    const laid =
      p.deposit *
      (trail === "food" && col.entrance === null ? p.foodTrailTop : 1) *
      resp.trailRate(tt) *
      Math.exp(-col.since[i] / p.depositDecay) *
      dt *
      col.layGain[i];
    col.antCell(i);
    ph.depositCell(trail, CELL[0], CELL[1], laid);
    const leak = col.crossLay[i];
    if (carrying && leak > 0 && col.foreign) col.foreign.depositCell("food", CELL[0], CELL[1], laid * leak);
  }

  // A finder lays the raid trail home (behaviour MR 5.2), strongest where it met the strangers, more the more it met.
  if (reporting && rgate) {
    col.antCell(i);
    ph.depositCell(
      "raid",
      CELL[0],
      CELL[1],
      p.deposit * p.raidLay * Math.min(3, 0.5 + col.foes[i]) * Math.exp(-col.since[i] / p.depositDecay) * dt,
    );
  }

  // Waiting at home (behaviour MR 5) it stays in, milling as far as the nest's rim, where foragers come home: past
  // WAIT_RIM of the radius it turns back in. Wandering out of the nest, it was asked its mode, and the mode policy
  // sent it out exploring with nothing coming in; kept to half the radius, it never met a carrier, who puts its food
  // down on reaching the rim, so only scouts went out.
  if (waiting && gate) {
    const dx = home.x - col.x[i];
    const dy = home.y - col.y[i];
    if (dx * dx + dy * dy > WAIT_RIM * WAIT_RIM * home.r * home.r) h = Math.atan2(dy, dx);
  }
  // One world: going in, within the disc round its hole, it makes straight for the hole's cell. Steering for the
  // nest's centre at the turn rate, it circled the hole it was over.
  if (col.inbound(i, mode)) {
    const hc = col.holeCells[p.nest] as HoleCell;
    const dx = centreX(hc.px, hc.py) - col.x[i];
    const dy = centreY(hc.py) - col.y[i];
    if (dx * dx + dy * dy < home.r * home.r) h = Math.atan2(dy, dx);
  }
  s.h = h;
  s.nest = nest;
  s.digging = digging;
}
