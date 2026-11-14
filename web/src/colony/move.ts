// Move and dig (docs/refactor.md S3.4): the fifth stage of an ant's step in tick. It takes the step its heading gives: into open ground; against soil, a face to glance off, start digging or dig on (a pellet when it is done); blocked otherwise, wall-following home by touch or a bump that turns it; up out of the hole onto the plane (crossing, which ends its step). Moved out of Colony.tick verbatim but for `this` becoming `col`; a step that ends here returns true, and tick moves on to the next ant.
import { NO_KEY } from "./ants.ts";
import type { Colony } from "./colony.ts";
import { crossUp, mayCrossUp } from "./crossing.ts";
import { chamberDug, crust } from "./dig.ts";
import { cellKey, crossedDir, gauss, NO_CELL, refilled, soilFace, tunnel, wallSide } from "./grid.ts";
import { CELL, cellOf, centreX, centreY, DIR_ANGLE } from "./hex.ts";
import { touchProbe } from "./sense.ts";
import type { AntStep } from "./step.ts";
import { DIG_FACE, DIG_TIME, GLANCE, HUG_TIME, NO_FACE, ROOMY_DIG, START, START_FACE, WALL_LOST, WALL_PROBE } from "./tuning.ts";
import { EXPLORE, RETURN } from "./vocab.ts";
import { digCell, rockAt, setTunnelHeading, SOIL, OPEN } from "./world.ts";
import { pointDown } from "./plane.ts";

export function moveDig(col: Colony, i: number, s: AntStep): boolean {
  const p = s.p;
  const rng = s.rng;
  const map = s.map;
  const dt = s.dt;
  let h = s.h;
  const carrying = s.carrying;
  const pellet = s.pellet;
  const outward = s.outward;
  const nest = s.nest;
  const x0 = s.x0;
  const y0 = s.y0;
  const mode = s.mode;
  const digging = s.digging;
  // Move; rock or the edge turns the ant back somewhere random.
  // Rounded to float32 first, as stored: checked in float64, 192.999996 is open ground, and stored as
  // 193.0 it would land the ant inside the soil cell beyond, where every step is blocked.
  const nx = Math.fround(col.x[i] + Math.cos(h) * p.speed * dt);
  const ny = Math.fround(col.y[i] + Math.sin(h) * p.speed * dt);
  col.detour[i] = col.detour[i] - dt;
  col.bumps[i] = Math.max(0, col.bumps[i] - dt / 4);
  // The cell the step lands in: open ground (most steps) moves at once, with no more to check.
  cellOf(Math.fround(nx), Math.fround(ny)); // as stored (Float32), so the cached cell is the stored position's
  const lx = CELL[0];
  const ly = CELL[1];
  // One world's curtain: a step up into its surface rows (sky; the side view draws the strip from the plane, it is
  // stored nowhere, one-world §8 item 6) is a crossing, judged below (mayCrossUp), whatever the cell holds.
  const up = map.surfaceRows !== undefined && ly < map.surfaceRows;
  let landOpen = up || rockAt(map, lx, ly) === OPEN;
  if (!landOpen) {
    // A step that stays in the ant's own cell moves even if that cell is solid: a cell filled round an
    // ant (another colony's ant backfilling, its grids a tick old) must not bury it.
    col.antCell(i);
    if (CELL[0] === lx && CELL[1] === ly) landOpen = true;
  }
  let face =
    !landOpen && mode === EXPLORE && !carrying && !pellet
      ? soilFace(map, col.x[i], col.y[i], nx, ny, h, col.gx[i], col.gy[i], col.time, col.params.backfill.hold)
      : NO_FACE;
  if (face === START_FACE) face = digging || (col.digs(i) && rng() < START * (col.crowded() ? 1 : ROOMY_DIG)) ? DIG_FACE : GLANCE;
  // Zoned by age (slice 6): only the middle-aged dig; others meeting a face turn along it.
  else if (face === DIG_FACE && !digging && !col.digs(i)) face = GLANCE;
  // A roomy nest (ja-wii): a tunnel's end met head-on is dug only now and then; turned along the wall otherwise, so the
  // next tick doesn't simply try again.
  else if (face === DIG_FACE && !digging && Number.isNaN(col.digAim[i]) && map.chambers && !col.crowded() && rng() > ROOMY_DIG)
    face = GLANCE; // (an aimed face passed ROOMY_DIG when it was chosen)
  // A chamber face it aimed at (widening a chamber, or a new one off a tunnel): dug whatever the tunnel rules say,
  // but not soil put back moments ago (see refilled: #17's hold on refilled cells).
  if (face !== NO_FACE && col.chamberCell[i] !== NO_KEY && mode === EXPLORE && !carrying && !pellet) {
    cellOf(nx, ny);
    if (
      col.chamberCell[i] === cellKey(CELL[0], CELL[1]) &&
      rockAt(map, CELL[0], CELL[1]) === SOIL &&
      col.digs(i) &&
      col.crowded() &&
      !refilled(map, CELL[0], CELL[1], col.time, col.params.backfill.hold)
    )
      face = DIG_FACE;
  }
  if (face === DIG_FACE && map.sky) {
    cellOf(nx, ny);
    const looseFace = map.loose?.get(CELL[0], CELL[1]) === 1;
    col.antCell(i);
    // Loose soil is picked up only by the rules of pickLoose (spreading, backfill), never dug at head-on: explorers on
    // the ground line chewed the mound and carried it to the hole and out again. (From below it can't be met: the ground
    // under the mound is crust, see crust. Digging it "from below in a quarter of the time" never ran: review of MR 15.)
    if (looseFace || !col.mayDig(CELL[0], CELL[1])) face = GLANCE;
  }
  if (face !== NO_FACE) {
    // Digging: an explorer that meets soil head-on bites at it for DIG_TIME (1–2 s), then the cell
    // is open and the ant carries the pellet home. Any other touch of soil puts a hand on the wall.
    if (face === GLANCE) {
      col.digT[i] = 0; // a face that stopped being diggable (a neighbour dug beside it) is left
      col.digAim[i] = NaN;
      col.hugT[i] = HUG_TIME;
      // Facing along the wall, the soil it touched ahead on its hand side.
      col.gdir[i] = (crossedDir(map, col.x[i], col.y[i], nx, ny) - col.hand[i] + 6) % 6;
      col.gx[i] = NO_CELL;
    } else if (!digging) {
      cellOf(nx, ny);
      col.digT[i] = DIG_TIME * (1 + rng());
    } else {
      const left = col.digT[i] - dt;
      col.digT[i] = Math.max(0, left);
      cellOf(nx, ny);
      const fx = CELL[0];
      const fy = CELL[1];
      if (left <= 0 && crust(col, fx, fy)) {
        // The side view: the ground line's crust is left (see crust); it turns along it instead.
        col.digT[i] = 0;
        col.digAim[i] = NaN;
        col.hugT[i] = HUG_TIME;
        col.gx[i] = NO_CELL;
      } else if (left <= 0 && digCell(map, fx, fy, col.time)) {
        // A chamber face: the cell joins its chamber (or founds a new one, if there is still room for one there).
        if (col.chamberCell[i] === cellKey(fx, fy) && map.chambers) chamberDug(col, i, fx, fy);
        col.chamberCell[i] = NO_KEY;
        // The new cell carries the tunnel's run on: the heading chosen at the end, or the way it was dug.
        const aim = col.digAim[i];
        setTunnelHeading(
          map,
          fx,
          fy,
          Number.isNaN(aim) ? DIR_ANGLE[crossedDir(map, col.x[i], col.y[i], nx, ny)] + gauss(rng) * col.params.tunnelDrift : aim,
        );
        col.digAim[i] = NaN;
        col.soilDug++;
        col.pellet[i] = 1;
        col.since[i] = 0;
        col.lastDug[i] = cellKey(fx, fy);
        col.looked[i] = NO_KEY; // a new trip home: every cell on it is looked round afresh
        col.cameFrom[i] = NO_KEY;
        col.homeAfresh(i); // a fresh trip home: the bumps and detour it ran up exploring the tunnels are behind it
        h += Math.PI;
      }
    }
  } else if (!landOpen) {
    col.digT[i] = 0;
    // Read afresh: a give-up earlier this tick has just started a wander, and must not start a new wall.
    const wandering = col.detour[i] > 0;
    if (mode === RETURN && !wandering && !outward) {
      // Homing: start (or keep) following this wall by touch instead of turning at random.
      const x = col.x[i];
      const y = col.y[i];
      if (col.wall[i] === 0) {
        const toNest = Math.atan2(nest.y - y, nest.x - x);
        // Underground, every wall (soil, or rock in dug ground) is followed cell by cell, and re-anchors the
        // line home: the review of #10 found carriers circling rock specks in caverns by touch for up to
        // 120 s, out of reach of every release the cell-by-cell follower has. On open ground, rock keeps the
        // touch rule. The cell is the landing cell the step was judged on (lx, ly: float32, as stored).
        const cellWall = map.hasSoil || rockAt(map, lx, ly) === SOIL;
        const newTrip = Number.isNaN(col.mx[i]);
        if (newTrip) col.noGain[i] = 0;
        if (newTrip || cellWall) {
          // The first rock this trip: remember where, so the line from here to the nest is the way home it
          // keeps returning to. Walls underground re-anchor it at every wall: in dug ground the ant meets speck
          // after speck, and heading home from wherever it left the last one it is rarely back on the
          // first wall's line, so it would circle a speck until it gave up (review of MR 8).
          col.mx[i] = x;
          col.my[i] = y;
        }
        col.wall[i] = wallSide(touchProbe(col, x, y, toNest - WALL_PROBE, 1.2), touchProbe(col, x, y, toNest + WALL_PROBE, 1.2), rng);
        // Underground, the distance to beat is the nearest it has been this trip (re-anchoring the line at
        // every wall must not forget progress, or it could leave a wall and meet it again for ever).
        const d = Math.hypot(nest.x - x, nest.y - y);
        col.hitDist[i] = cellWall && !newTrip ? Math.min(col.hitDist[i], d) : d;
        // Back on a wall it lost touch with: the clock runs on, or let-go and re-bump would never give up.
        if (!(col.untouched[i] > WALL_LOST)) col.followT[i] = 0;
        col.untouched[i] = 0;
        // Facing the wall it met, turned away from the side it keeps the wall on; the first cell decides the way on.
        col.gdir[i] = (crossedDir(map, x, y, nx, ny) - col.wall[i] + 6) % 6;
        col.gx[i] = NO_CELL;
        cellOf(x, y);
        const hx = CELL[0];
        const hy = CELL[1];
        col.byCell[i] = cellWall || tunnel(map, hx, hy) ? 1 : 0;
      }
      if (!col.byCell[i])
        h -= col.wall[i] * (Math.PI / 2); // by touch: turn away from the wall, along it
      else {
        // By cell and blocked: it stands right on its cell's edge (a straight line from inside a cell to a neighbour's
        // centre never leaves the two), so the way to the next cell grazes the solid one beside it and every step lands
        // there. A quarter of the way back to its own cell's centre takes it off the edge. Not only when it was already
        // following a wall (the first rule): where the wall is let go of before the next step (every tick
        // on the ground line; a release into scent in a tunnel), the ant was blocked the same way every tick, for good
        // (review of #17: about 20 homing ants frozen in the walkway cell above the hole; 21 at one cell in a tunnel on
        // seed 3 with the fixes of PRD §40, before this).
        col.antCell(i);
        col.x[i] = x + (centreX(CELL[0], CELL[1]) - x) * 0.25;
        col.y[i] = y + (centreY(CELL[1]) - y) * 0.25;
      }
    } else {
      h += Math.PI / 2 + rng() * Math.PI;
      // Each bump soon after another doubles the detour: 0.5–1.5 s, then 1–3 s, … up to 8–24 s.
      // Not for a homing ant already on one (after giving up on a wall): in a tunnel it bumps all
      // the time, and topping the detour up would keep it from ever trying for home again.
      col.bumps[i] = Math.min(5, col.bumps[i] + 1);
      if (mode !== RETURN || outward) col.detour[i] = Math.max(col.detour[i], 0.5 * 2 ** Math.floor(col.bumps[i]) * (0.5 + rng()));
      // Carrying out on the plane (U3c): on from here the way it turned, not back into the rock.
      if (outward) col.spoilA[i] = h;
    }
  } else if (up) {
    // One world's curtain: a step up out of a hole (the crust is open nowhere else) is onto the surface, the plane's.
    // Up it goes if it may (mayCrossUp); else it is pointed back down the shaft, as the side view's young are. Either
    // way its step ends here.
    if (mayCrossUp(col, i)) {
      cellOf(x0, y0);
      crossUp(col, i, CELL[0], CELL[1]);
    } else {
      h = pointDown(col, i, x0, y0, h);
      // It has touched the surface, as the side view's young step onto the ground before they are put back: its floor
      // marks start afresh at the next chamber (layMark). Laying on, the young turned back at the hole marked the
      // shaft's top with brood and royal, which drew more young there (toBrood): in the spike up to 13 were held
      // there for minutes.
      col.lastRole[i] = 0;
    }
    col.heading[i] = h;
    s.h = h;
    return true;
  } else {
    col.digT[i] = 0; // the face it was digging opened (another ant dug it), or it turned off it (its aim stays: it is walking up to the face)
    col.x[i] = nx;
    col.y[i] = ny;
    col.cellX[i] = lx;
    col.cellY[i] = ly;
    col.cellAtX[i] = col.x[i];
    col.cellAtY[i] = col.y[i];
  }
  s.h = h;
  return false;
}
