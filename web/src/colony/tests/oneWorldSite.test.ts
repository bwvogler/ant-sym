import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, DEFAULT_COLONY, HOLE_SIGHT, LIFESPAN, MODES, PLANE, type HoleCell } from "../colony.ts";
import { Game, gameRng } from "../game.ts";
import { centreX, centreY } from "../hex.ts";
import { generateOneWorld } from "../oneWorld.ts";
import { dropFood } from "../world.ts";
import { generateWorld, mulberry32 } from "../world.ts";

// Site fidelity on one world's plane (ja-lp4.15.3, docs/forager-trips.md §3, PRD §58): a forager that picks up food keeps
// its own vector to the spot (where it stood less where its vector put its hole), walks it straight on its next trip out,
// searches round the spot, and lets a food trail take over; forgets the spot when it tires there, replaces it at its
// next find. A rock-free small plane (160 × 100, seed 7), no food but what a test drops, every ant young but ant 0.

const DT = 1 / 30;
const EXPLORE = MODES.indexOf("explore");
const FOLLOW = MODES.indexOf("follow");

function plane(params: Partial<Colony["params"]> = { siteFidelity: 1 }): { g: Game; c: Colony; hx: number; hy: number } {
  const g = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 }, rockiness: 0 } }), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(7));
  const map = g.world!.plane;
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) map.food.set(x, y, 0);
  map.foodLeft = 0;
  for (const k of g.colonies) for (let i = 0; i < k.n; i++) if (k.alive[i]) k.age[i] = 0.05 * LIFESPAN;
  const c = g.player;
  Object.assign(c.params, { scoutRate: 0, raidScout: 0, ...params });
  const hc = c.holeCells[c.params.nest] as HoleCell;
  return { g, c, hx: centreX(hc.px, hc.py), hy: centreY(hc.py) };
}

/** The plane's nest of colony c: where its ants there believe their hole is, before their drift. */
const pn = (g: Game, c: Colony) => g.world!.plane.nests[c.params.nest]!;

/** Old ant 0 on the plane at (x, y), exploring and empty-jawed on a trip of `odo` cells with drift (dx, dy), facing `heading`. */
function out(c: Colony, x: number, y: number, heading: number, odo = 0, dx = 0, dy = 0): void {
  c.age[0] = 0.5 * LIFESPAN;
  c.putAnt(0, PLANE, x, y);
  c.mode[0] = EXPLORE;
  c.carrying[0] = 0;
  c.heading[0] = heading;
  c.odoSurf[0] = odo;
  c.driftSurf[0] = dx;
  c.driftSurfY[0] = dy;
  c.fatigue[0] = 0;
}

const tickUntil = (g: Game, seconds: number, done: () => boolean): boolean => {
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    g.tick(DT);
    if (done()) return true;
  }
  return false;
};

test("site fidelity: a find is remembered as where the ant stood less where its vector put its hole, not where the hole is", () => {
  const { g, c, hx, hy } = plane();
  const fx = hx + 40;
  const fy = hy + 5;
  dropFood(g.world!.plane, fx, fy, 3);
  // 50 cells walked with a drift of (0.06, -0.04) per cell: the vector's hole is (3, -2) off.
  out(c, fx - 2, fy, 0, 50, 0.06, -0.04);
  assert.ok(Number.isNaN(c.foodX[0] as number), "nothing remembered before a find");
  assert.ok(tickUntil(g, 3, () => c.carrying[0] === 1), "it found the food");
  const x = c.x[0] as number;
  const y = c.y[0] as number;
  assert.ok(Math.abs((c.foodX[0] as number) - (x - (pn(g, c).x + 50 * 0.06))) < 0.1, `x: remembered ${c.foodX[0]}, stood ${x - hx}, odo ${c.odoSurf[0]}`);
  assert.ok(Math.abs((c.foodY[0] as number) - (y - (pn(g, c).y - 50 * 0.04))) < 0.1, `y: remembered ${c.foodY[0]}`);
  assert.ok(Math.abs((c.foodX[0] as number) - (x - hx)) > 2, "not the true offset from the hole: the drift is in it");
});

test("site fidelity: off, a find is not remembered and a memory is not steered by", () => {
  const { g, c, hx, hy } = plane({ siteFidelity: 0 });
  dropFood(g.world!.plane, hx + 40, hy + 5, 3);
  out(c, hx + 38, hy + 5, 0, 50, 0.06, -0.04);
  assert.ok(tickUntil(g, 3, () => c.carrying[0] === 1));
  assert.ok(Number.isNaN(c.foodX[0] as number), "off: nothing remembered");
  // A memory set by hand changes nothing off: the same run with and without it is the same, bit for bit.
  const run = (mem: boolean): number[] => {
    const w = plane({ siteFidelity: 0 });
    out(w.c, w.hx + 3, w.hy, 0.5);
    if (mem) {
      w.c.foodX[0] = -30;
      w.c.foodY[0] = 20;
    }
    for (let k = 0; k < 150; k++) w.g.tick(DT);
    return [w.c.x[0] as number, w.c.y[0] as number, w.c.heading[0] as number, w.c.odoSurf[0] as number];
  };
  assert.deepEqual(run(true), run(false));
});

test("site fidelity: on its next trip it walks the vector straight to where it believes the spot is, drift of this trip and all, and searches round it", () => {
  const { g, c, hx, hy } = plane();
  // The find was 50 east: its trip's drift (0.05, 0.05) put the believed spot at (50 - 2.5, 5 - 2.5) from the hole.
  const sx = 50;
  const sy = 5;
  c.foodX[0] = sx - 50 * 0.05;
  c.foodY[0] = sy - 50 * 0.05;
  // This trip's drift is (-0.1, 0.08): it will end up (odo × drift) from the spot's believed place, where it stops to search.
  out(c, hx + 3, hy, Math.PI, 3, -0.1, 0.08);
  const start = { x: c.x[0] as number, y: c.y[0] as number };
  let path = 0;
  let last = { ...start };
  let arrived = -1;
  for (let k = 0; k < 20 * 30 && arrived < 0; k++) {
    g.tick(DT);
    path += Math.hypot((c.x[0] as number) - last.x, (c.y[0] as number) - last.y);
    last = { x: c.x[0] as number, y: c.y[0] as number };
    if (c.search[0] !== 0) arrived = k;
  }
  assert.ok(arrived >= 0, "it got there and began to search");
  const odo = c.odoSurf[0] as number;
  const bx = pn(g, c).x + odo * -0.1 + (c.foodX[0] as number);
  const by = pn(g, c).y + odo * 0.08 + (c.foodY[0] as number);
  assert.ok(Math.hypot(last.x - bx, last.y - by) < 2.5, `at the believed spot (${bx.toFixed(1)}, ${by.toFixed(1)}), not ${Math.hypot(last.x - bx, last.y - by).toFixed(1)} off`);
  assert.ok(Math.hypot(last.x - (hx + sx), last.y - (hy + sy)) > 2.5, "which is not the spot itself: it walked its own vector");
  const straight = Math.hypot(bx - start.x, by - start.y);
  assert.ok(path < 1.2 * straight, `walked ${path.toFixed(1)} cells for ${straight.toFixed(1)} straight`);
  // It goes on round the spot: the search's reach grows and it stays within a few loops of it, for the next 8 s.
  const reach0 = c.search[0] as number;
  let far = 0;
  for (let k = 0; k < 8 * 30; k++) {
    g.tick(DT);
    const o = c.odoSurf[0] as number;
    far = Math.max(far, Math.hypot((c.x[0] as number) - (pn(g, c).x + o * -0.1 + (c.foodX[0] as number)), (c.y[0] as number) - (pn(g, c).y + o * 0.08 + (c.foodY[0] as number))));
  }
  assert.ok((c.search[0] as number) > reach0, `the search widened: ${reach0} to ${c.search[0]}`);
  assert.ok(far < 25, `it searched round the spot (${far.toFixed(1)} at the farthest)`);
});

/** Food scent laid along a line from (x0, y0) due east, `len` cells, so a follower there has a trail ahead of it. */
function trail(c: Colony, x0: number, y0: number, len: number): void {
  for (let d = 0; d <= len; d += 1.5) c.paint("food", x0 + d, y0, 2, 8, PLANE);
}

test("site fidelity: a food trail it meets still takes over", () => {
  // The spot is 40 cells west; a trail leads east from where it is. On its own, it goes west; with the trail, east.
  const end = (laid: boolean): number => {
    const { g, c, hx, hy } = plane();
    c.foodX[0] = -40;
    c.foodY[0] = 0;
    out(c, hx + 12, hy, 0);
    if (laid) trail(c, hx + 14, hy, 30);
    for (let k = 0; k < 4 * 30; k++) g.tick(DT);
    return (c.x[0] as number) - (hx + 12);
  };
  assert.ok(end(false) < -10, `no trail: it walks its vector west (${end(false).toFixed(1)})`);
  assert.ok(end(true) > 10, `a trail east: it follows it east (${end(true).toFixed(1)})`);
});

test("site fidelity: it forgets the spot when it tires there without food, not when it tires elsewhere", () => {
  // There: searching round its believed spot, a moment from tired.
  const there = plane();
  there.c.foodX[0] = 30;
  there.c.foodY[0] = 0;
  out(there.c, there.hx + 30, there.hy, 0, 30);
  there.c.fatigue[0] = there.c.params.patience - 1.5;
  assert.ok(tickUntil(there.g, 1, () => there.c.search[0] !== 0), "searching round the spot");
  assert.ok(!Number.isNaN(there.c.foodX[0] as number), "still remembered while it searches");
  assert.ok(tickUntil(there.g, 3, () => (there.c.fatigue[0] as number) > there.c.params.patience), "tired");
  assert.ok(Number.isNaN(there.c.foodX[0] as number) && Number.isNaN(there.c.foodY[0] as number), "forgotten");
  // Elsewhere: tired on its way out, before it got there.
  const away = plane();
  away.c.foodX[0] = 70;
  away.c.foodY[0] = 0;
  out(away.c, away.hx + 5, away.hy, 0, 5);
  away.c.fatigue[0] = away.c.params.patience - 0.5;
  assert.ok(tickUntil(away.g, 3, () => (away.c.fatigue[0] as number) > away.c.params.patience), "tired");
  assert.equal(away.c.search[0], 0, "not searching: it had not got there");
  assert.equal(away.c.foodX[0], 70, "kept");
});

test("site fidelity: the next find replaces the spot", () => {
  const { g, c, hx, hy } = plane();
  // Its old spot is further east along the same line: on the way, it comes to the new food and takes it.
  c.foodX[0] = 60;
  c.foodY[0] = -10;
  dropFood(g.world!.plane, hx + 25, hy - 10, 3);
  out(c, hx + 15, hy - 10, 0, 40);
  assert.ok(tickUntil(g, 3, () => c.carrying[0] === 1));
  assert.ok(Math.abs((c.foodX[0] as number) - 25) < 1.5 && Math.abs((c.foodY[0] as number) + 10) < 1.5, `now (${c.foodX[0]}, ${c.foodY[0]})`);
});

test("site fidelity: a new colony remembers nothing, the default is off, and a save carries the spots", () => {
  assert.equal(DEFAULT_COLONY.siteFidelity, 0);
  const { g, c } = plane();
  assert.ok(Array.from(c.foodX).every((v) => Number.isNaN(v)), "no ant remembers a spot");
  c.foodX[0] = 12.5;
  c.foodY[0] = -7.25;
  c.foodX[3] = -40;
  c.foodY[3] = 33;
  for (let k = 0; k < 10; k++) g.tick(DT);
  const saved = JSON.parse(JSON.stringify(g.save()));
  const fresh = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 }, rockiness: 0 } }), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(7));
  fresh.load(saved);
  for (const k of [0, 3, 1]) {
    assert.ok(Object.is(fresh.player.foodX[k], c.foodX[k]), `ant ${k}: x ${fresh.player.foodX[k]} against ${c.foodX[k]}`);
    assert.ok(Object.is(fresh.player.foodY[k], c.foodY[k]), `ant ${k}: y`);
  }
});

test("site fidelity: a trail-follower with a memory is not drawn to it", () => {
  const { g, c, hx, hy } = plane();
  c.policy = () => "follow";
  c.foodX[0] = -40;
  c.foodY[0] = 0;
  out(c, hx + 12, hy, 0);
  c.mode[0] = FOLLOW;
  for (let k = 0; k < 3 * 30; k++) g.tick(DT);
  assert.ok((c.x[0] as number) - (hx + 12) > -8, "following (no trail here: it wanders), it does not head for the spot");
  assert.ok(HOLE_SIGHT > 0);
});

test("site fidelity: with siteGive it gives the spot up once its search has widened past what its vector's error covers, sooner for a short vector", () => {
  // Seconds from its start (at the spot, no drift, no food) to the spot forgotten, for a spot `len` cells out and the given siteGive.
  const forgot = (len: number, give: number): number => {
    const { g, c, hx, hy } = plane({ siteFidelity: 1, siteGive: give });
    c.foodX[0] = len;
    c.foodY[0] = 0;
    out(c, pn(g, c).x + len, pn(g, c).y, 0);
    assert.ok(hx > 0 && hy > 0);
    return tickUntil(g, 120, () => Number.isNaN(c.foodX[0] as number)) ? g.time : Infinity;
  };
  const short = forgot(20, 1);
  const long = forgot(100, 1);
  assert.ok(short < 6, `a 20-cell vector (σ 2): the spot given up after ${short.toFixed(1)} s`);
  assert.ok(long > short + 8 && long < 90, `a 100-cell vector (σ 10): after ${long.toFixed(1)} s`);
  assert.ok(forgot(100, 2) > long + 4, "a wider allowance, a longer search");
  const off = forgot(20, 0);
  assert.ok(off > 55 && off < 65, `siteGive 0: only tiring (patience 60 s) ends it: ${off.toFixed(1)} s`);
});

test("site fidelity: a newborn in a dead ant's slot remembers nothing", () => {
  const { c } = plane();
  c.foodX[0] = 12;
  c.foodY[0] = -7;
  c.kill(0);
  assert.ok(c.spawn(), "a slot was free");
  assert.ok(Number.isNaN(c.foodX[0] as number) && Number.isNaN(c.foodY[0] as number), "the dead ant's spot is not inherited");
});

test("site fidelity: not on a top-down map, where a find is not remembered", () => {
  const world = generateWorld(3, { size: { w: 128, h: 96 }, nestCount: 1 });
  const flat = new Colony(world, { antCount: 1, maxAnts: 1, siteFidelity: 1, deposit: 0 }, mulberry32(5), () => "explore");
  flat.age[0] = 0.5 * LIFESPAN;
  flat.mode[0] = EXPLORE;
  flat.carrying[0] = 0;
  dropFood(world, flat.x[0] as number, flat.y[0] as number, 3);
  for (let t = 0; t < 90 && flat.carrying[0] !== 1; t++) flat.tick(DT);
  assert.equal(flat.carrying[0], 1, "it picked the food up");
  assert.ok(Number.isNaN(flat.foodX[0] as number), "nothing remembered off the plane");
});
