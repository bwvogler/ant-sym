import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, LIFESPAN, PI_DRIFT, PLANE, type Colony, type HoleCell } from "../../colony.ts";
import { MODES } from "../../vocab.ts";
import { Game, gameRng } from "../../game.ts";
import { CELL, cellOf } from "../../hex.ts";
import { OPEN, rockAt } from "../../world.ts";
import { DT, curtainHole, planeHole, smallOne } from "../builders.ts";

// One world U3b (ja-lp4.3.2; docs/one-world.md §4, docs/nest-and-home.md §3.1): on the plane a homing ant steers by its own
// drifting home vector, started afresh up out of its own hole, and searches in widening loops where it ran out. A small
// plane (160 × 100) keeps it quick: seed 7's player's hole is at cell (48, 32), with open ground east and south-east of it.

const EXPLORE = MODES.indexOf("explore");
const RETURN = MODES.indexOf("return");
const OLD = 0.5 * LIFESPAN;
/** colony.ts's NEST_SIGHT: within it, with a clear line, the hole is in sight. */
const NEST_SIGHT = 8;

/** A game of few ants, every founder young (they stay in) but the one each test moves. */
const game = (seed = 7): Game => {
  const g = new Game(smallOne(seed), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(seed));
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) if (c.alive[i]) c.age[i] = 0.05 * LIFESPAN;
  return g;
};
const open = (g: Game, x: number, y: number): boolean => {
  cellOf(x, y);
  return rockAt(g.world!.plane, CELL[0] as number, CELL[1] as number) === OPEN;
};

/** Old ant i of c, at the top of hole h's shaft and heading up, with a pass through the gate there (ja-web), climbs out onto the plane (within 20 s). */
function climbOut(g: Game, c: Colony, i: number, h: HoleCell): void {
  const at = curtainHole(h);
  c.age[i] = OLD;
  c.carrying[i] = 0;
  c.putAnt(i, CURTAIN, at.x, at.y);
  c.mode[i] = EXPLORE;
  c.leaveOk[i] = 1;
  c.heading[i] = -Math.PI / 2;
  for (let k = 0; k < Math.round(20 / DT) && c.layer[i] !== PLANE; k++) g.tick(DT);
  assert.equal(c.layer[i], PLANE, "it climbed out");
}

/** Put a food carrier (ant 0 of the player) on the plane at (x, y), with its vector: walked `odo`, drifting (dx, dy). */
function carrier(g: Game, x: number, y: number, odo: number, dx: number, dy: number): Colony {
  const c = g.player;
  c.age[0] = OLD;
  c.putAnt(0, PLANE, x, y);
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  c.odoSurf[0] = odo;
  c.driftSurf[0] = dx;
  c.driftSurfY[0] = dy;
  return c;
}

/** Tick until ant 0 of c goes down (at most `seconds`), calling `each` before every tick; the seconds it took, or NaN. */
function home(g: Game, c: Colony, seconds: number, each: () => void): number {
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    each();
    g.tick(DT);
    if (c.layer[0] === CURTAIN) return (k + 1) * DT;
  }
  return NaN;
}

test("plane: the vector starts afresh up out of its own hole, with both drifts drawn; it counts the way out, not the way home", () => {
  const g = game();
  const c = g.player;
  const h = c.holeCells[c.params.nest] as HoleCell;
  c.odoSurf[0] = 50;
  c.driftSurf[0] = c.driftSurfY[0] = 0;
  climbOut(g, c, 0, h);
  assert.equal(c.odoSurf[0], 0, "afresh");
  assert.ok(c.driftSurf[0] !== 0 && c.driftSurfY[0] !== 0, `both parts drawn: (${c.driftSurf[0]}, ${c.driftSurfY[0]})`);
  // Out exploring for 3 s: the odometer is the path walked, step by step.
  let walked = 0;
  for (let k = 0; k < Math.round(3 / DT); k++) {
    const x = c.x[0] as number;
    const y = c.y[0] as number;
    g.tick(DT);
    assert.equal(c.layer[0], PLANE);
    if (c.mode[0] !== RETURN) walked += Math.hypot((c.x[0] as number) - x, (c.y[0] as number) - y);
  }
  assert.ok(walked > 10, `it walked out (${walked.toFixed(1)})`);
  assert.ok(Math.abs((c.odoSurf[0] as number) - walked) < 1e-3 * walked, `odometer ${c.odoSurf[0]} = path ${walked.toFixed(2)}`);
  // Homing (tired, so its policy keeps it in return): the vector is fixed.
  const out = c.odoSurf[0] as number;
  c.mode[0] = RETURN;
  c.fatigue[0] = 2 * c.params.patience;
  for (let k = 0; k < Math.round(1 / DT) && c.layer[0] === PLANE; k++) g.tick(DT);
  assert.equal(c.mode[0], RETURN);
  assert.equal(c.odoSurf[0], out, "not counted on the way home");
});

test("plane: coming up a rival's hole leaves the vector as it was", () => {
  const g = game();
  const c = g.player;
  const rival = c.holeCells[1] as HoleCell;
  c.odoSurf[0] = 50;
  c.driftSurf[0] = 0.3;
  c.driftSurfY[0] = -0.2;
  climbOut(g, c, 0, rival);
  const p = planeHole(rival);
  assert.ok(Math.hypot((c.x[0] as number) - p.x, (c.y[0] as number) - p.y) < 1, "up at the rival's hole");
  assert.ok((c.odoSurf[0] as number) >= 50, `odometer runs on (${c.odoSurf[0]})`);
  assert.deepEqual([c.driftSurf[0], c.driftSurfY[0]], [Math.fround(0.3), Math.fround(-0.2)], "drift unchanged");
});

test("plane: the drift's size over many trips out of its own hole is PI_DRIFT (RMS)", () => {
  const g = game();
  const c = g.player;
  const h = c.holeCells[c.params.nest] as HoleCell;
  let sq = 0;
  const N = 150;
  for (let n = 0; n < N; n++) {
    climbOut(g, c, 0, h);
    sq += (c.driftSurf[0] as number) ** 2 + (c.driftSurfY[0] as number) ** 2;
  }
  const rms = Math.sqrt(sq / N);
  assert.ok(rms > 0.07 && rms < 0.13, `RMS |drift| ${rms.toFixed(3)} against PI_DRIFT ${PI_DRIFT}`);
});

test("plane: a carrier walks to where its vector says the hole is, not to the hole; in sight of the hole it goes straight down", () => {
  const g = game();
  const c = g.player;
  const H = planeHole(c.holeCells[c.params.nest] as HoleCell);
  // Walked 60 out, drifting (0.2, 0.1): it believes the hole 12 east and 6 south of it (13.4 off, out of sight of it).
  const B = { x: H.x + 12, y: H.y + 6 };
  assert.ok(open(g, B.x, B.y), "its belief is on open ground");
  // From south of the belief: the straight way to the hole passes 5 cells from the belief, and never within sight of the hole
  // until it is nearly there.
  const S = { x: B.x + 6, y: B.y + 14 };
  assert.ok(open(g, S.x, S.y));
  carrier(g, S.x, S.y, 60, 0.2, 0.1);
  let nearB = Infinity; // nearest to its belief before it came within NEST_SIGHT of the hole
  let seen = -1; // the tick it first came within NEST_SIGHT of the hole
  let k = 0;
  const t = home(g, c, 30, () => {
    const x = c.x[0] as number;
    const y = c.y[0] as number;
    if (seen < 0 && Math.hypot(x - H.x, y - H.y) < NEST_SIGHT) seen = k;
    if (seen < 0) nearB = Math.min(nearB, Math.hypot(x - B.x, y - B.y));
    k++;
  });
  assert.ok(nearB < 1.5, `it got to its belief (within ${nearB.toFixed(2)}) before the hole was in sight`);
  assert.ok(t > 0, "down its hole within 30 s");
  // In sight (the way there is open), it makes straight for the hole: NEST_SIGHT at its speed is ~1.1 s.
  assert.ok(t - seen * DT < 2, `down ${(t - seen * DT).toFixed(2)} s after the hole came in sight`);
  assert.equal(c.carriedDown, 1);
});

test("plane: a carrier whose vector is 12 off finds nothing there, searches in widening loops, and finds its hole", () => {
  const g = game();
  const c = g.player;
  const H = planeHole(c.holeCells[c.params.nest] as HoleCell);
  // Walked 120 out, drifting (0.1, 0): it believes the hole 12 east, along open row 32.
  const B = { x: H.x + 12, y: H.y };
  assert.ok(open(g, B.x, B.y));
  carrier(g, B.x + 20, B.y, 120, 0.1, 0);
  let most = 0;
  const t = home(g, c, 60, () => (most = Math.max(most, c.search[0] as number)));
  assert.ok(most > 3.5, `it searched, and the loops grew (to ${most.toFixed(2)})`);
  assert.ok(t > 0, "down its hole within 60 s");
  assert.equal(c.carriedDown, 1);
});

test("plane: a carrier whose vector ends in rock gets as near as it can, searches on, and gets home", () => {
  const g = game();
  const c = g.player;
  const H = planeHole(c.holeCells[c.params.nest] as HoleCell);
  // Walked 60, drifting (0.2, −0.1): the spot it believes in, 12 east and 6 north of the hole, is in the rock ridge there.
  const B = { x: H.x + 12, y: H.y - 6 };
  assert.ok(!open(g, B.x, B.y), "its belief is in rock");
  carrier(g, H.x + 30, H.y + 10, 60, 0.2, -0.1);
  let most = 0;
  const t = home(g, c, 60, () => (most = Math.max(most, c.search[0] as number)));
  assert.ok(most > 0, "it searched");
  assert.ok(t > 0, "down its hole within 60 s");
});

test("plane: a belief past the plane's edge is held at the edge, and the carrier still gets home", () => {
  // Seed 1's player's hole is 26 below the plane's top edge, with open ground between.
  const g = game(1);
  const c = g.player;
  const H = planeHole(c.holeCells[c.params.nest] as HoleCell);
  // Walked 300 north: it believes the hole 60 north of it, 34 past the plane's top edge.
  const top = 0.75;
  assert.ok(H.y - 60 < 0 && H.y - top > NEST_SIGHT + 10, `hole at y ${H.y.toFixed(1)}`);
  assert.ok(open(g, H.x, top));
  carrier(g, H.x + 6, top + 2, 300, 0, -0.2);
  let nearEdge = Infinity;
  const t = home(g, c, 90, () => (nearEdge = Math.min(nearEdge, Math.hypot((c.x[0] as number) - H.x, (c.y[0] as number) - top))));
  assert.ok(nearEdge < 1.5, `it went to the edge, where its belief is held (within ${nearEdge.toFixed(2)})`);
  assert.ok(t > 0, "down its hole within 90 s");
});

/** Ant 0 of c, homing, searching (reach 3), facing `heading`, ticks for `seconds` (or until it goes down); where it ended up. */
function searchingRun(g: Game, c: Colony, heading: number, seconds: number): { x: number; y: number } {
  c.search[0] = 3;
  c.searchA[0] = 0;
  c.heading[0] = heading;
  c.bestD[0] = Infinity;
  c.stallT[0] = 0;
  c.fatigue[0] = 2 * c.params.patience; // tired: its policy keeps it in return
  for (let k = 0; k < Math.round(seconds / DT) && c.layer[0] === PLANE; k++) g.tick(DT);
  return { x: c.x[0] as number, y: c.y[0] as number };
}

test("plane: a searching carrier with the home trail under its antennae follows the trail, not its vector (review of #60)", () => {
  // Led by its loops alone, colonies delivered up to 44 % less in the spike (one-world §4, U3b as built).
  const g = game();
  const c = g.player;
  const H = planeHole(c.holeCells[c.params.nest] as HoleCell);
  // 24 east of the hole along open row 32, facing west, on a home trail that runs from it to the hole; it believes the hole
  // 40 east (walked 200, drifting (0.2, 0)), behind it, and is searching there (its next point 43 east).
  const S = { x: H.x + 24, y: H.y };
  for (let x = H.x; x <= S.x + 2; x += 0.5) assert.ok(open(g, x, H.y), `row ${H.y} is open at x ${x}`);
  for (let x = H.x; x <= S.x + 2; x += 0.5) c.paint("home", x, H.y, 1.5, 40, PLANE);
  carrier(g, S.x, S.y, 200, 0.2, 0);
  const end = searchingRun(g, c, Math.PI, 1.5);
  // At its speed (7) it walks ~10 in 1.5 s: along the trail, it ends well west of where it started, still out of sight of
  // the hole (the snap is not what moved it): 10 west. Steered by its vector it turns round within a second: 6 east.
  assert.ok(Math.hypot(end.x - H.x, end.y - H.y) > NEST_SIGHT, `still out of sight of the hole (${(end.x - H.x).toFixed(1)} east of it)`);
  assert.ok(end.x < S.x - 6, `it followed the trail west (${(end.x - S.x).toFixed(1)} from where it started)`);
});
