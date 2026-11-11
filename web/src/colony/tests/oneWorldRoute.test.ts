import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, CURTAIN, DEFAULT_COLONY, LIFESPAN, MODES, PLANE, type HoleCell } from "../colony.ts";
import { route1, runAssay } from "../experiment.ts";
import { Game, gameRng, SAVE_VERSION } from "../game.ts";
import { centreX, centreY } from "../hex.ts";
import { generateOneWorld } from "../oneWorld.ts";
import { generateWorld, mulberry32, ROCK } from "../world.ts";

// Route memory on one world's plane (ja-lp4.16.3, docs/route-memory.md, PRD §59): a forager stores its own places every
// routeStep cells on its way out; a carrier whose home vector fails (no nearer its belief for SEARCH_STALL; with
// routeMemory 2 also at its belief with no hole there) walks back through them, recognising a place within routeSee,
// once a trip. A small plane (160 x 100, seed 7), its player hole at cell (48, 32), every ant young but ant 0.

const DT = 1 / 30;
const EXPLORE = MODES.indexOf("explore");
const RETURN = MODES.indexOf("return");

interface World {
  g: Game;
  c: Colony;
  hx: number;
  hy: number;
}

/** Seed 7's small plane, no food, no rock unless `band` carves it (rock cells given), no scouts; the player's ants young but ant 0, which is old. */
function plane(params: Partial<Colony["params"]> = { routeMemory: 1 }, rock: [number, number, number, number][] = []): World {
  const g = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 }, rockiness: 0 } }), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(7), { colony: params });
  const map = g.world!.plane;
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) map.food.set(x, y, 0);
  map.foodLeft = 0;
  for (const [x0, y0, x1, y1] of rock) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) map.rock.set(x, y, ROCK);
  for (const k of g.colonies) for (let i = 0; i < k.n; i++) if (k.alive[i]) k.age[i] = 0.05 * LIFESPAN;
  const c = g.player;
  Object.assign(c.params, { scoutRate: 0, raidScout: 0, ...params });
  c.age[0] = 0.5 * LIFESPAN;
  const hc = c.holeCells[c.params.nest] as HoleCell;
  return { g, c, hx: centreX(hc.px, hc.py), hy: centreY(hc.py) };
}

/** Ant 0 stores `pts` as its places (x, y), as if it had walked them out. */
function store(c: Colony, pts: [number, number][]): void {
  const cap = c.routePlaces.length / c.n / 2;
  pts.forEach(([x, y], k) => {
    c.routePlaces[2 * k] = x;
    c.routePlaces[2 * k + 1] = y;
  });
  c.routeN[0] = pts.length;
  assert.ok(pts.length <= cap);
}

/** Points every `step` cells along the polyline through `via`, from its first point to its last. */
function along(via: [number, number][], step = 8): [number, number][] {
  const out: [number, number][] = [];
  let carry = step;
  for (let k = 1; k < via.length; k++) {
    const [ax, ay] = via[k - 1]!;
    const [bx, by] = via[k]!;
    const len = Math.hypot(bx - ax, by - ay);
    for (let t = carry; t <= len; t += step) {
      out.push([ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len]);
      carry = t + step - len;
    }
  }
  return out;
}

/** Ant 0 carrying food, homing, at (x, y) with its vector (odo walked) pointing at the real hole. */
function carrier(w: World, x: number, y: number, odo = 100): void {
  const { c, hx, hy } = w;
  c.putAnt(0, PLANE, x, y);
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  c.heading[0] = Math.atan2(hy - y, hx - x);
  c.odoSurf[0] = odo;
  c.driftSurf[0] = 0;
  c.driftSurfY[0] = 0;
  c.fatigue[0] = 0;
  c.policy = () => "return";
}

const tickUntil = (g: Game, seconds: number, done: () => boolean): boolean => {
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    g.tick(DT);
    if (done()) return true;
  }
  return false;
};

/** A C of rock, its mouth east, round ant 0 inside it 25 cells east of the hole; the way out of it, round the arm and back, that a forager walked. */
const POCKET: [number, number, number, number][] = [
  [72, 18, 74, 46],
  [72, 18, 150, 20],
  [72, 44, 150, 46],
];

test("route memory records a place every routeStep cells on the way out, from the hole, and only a forager walking out", () => {
  const w = plane({ routeMemory: 1, routeStep: 8 });
  const { g, c, hx, hy } = w;
  c.policy = () => "explore";
  c.putAnt(0, PLANE, hx + 3, hy);
  c.mode[0] = EXPLORE;
  c.carrying[0] = 0;
  c.heading[0] = 0;
  c.odoSurf[0] = 0;
  for (let k = 0; k < 4 * 30; k++) g.tick(DT);
  const n = c.routeN[0] as number;
  const walked = c.odoSurf[0] as number;
  assert.ok(walked > 20, `it walked ${walked.toFixed(0)} cells`);
  assert.equal(n, Math.floor(walked / 8), `${n} places for ${walked.toFixed(1)} cells at 8 a place`);
  // Each place is where it stood: on the line it walked (east, at the hole's row, give or take its wander), spaced about 8 apart.
  for (let k = 0; k < n; k++) assert.ok(Math.abs((c.routePlaces[2 * k + 1] as number) - hy) < 12 && (c.routePlaces[2 * k] as number) > hx, `place ${k}: (${c.routePlaces[2 * k]}, ${c.routePlaces[2 * k + 1]}) from (${hx}, ${hy})`);
  for (let k = 1; k < n; k++) {
    const d = Math.hypot((c.routePlaces[2 * k] as number) - (c.routePlaces[2 * k - 2] as number), (c.routePlaces[2 * k + 1] as number) - (c.routePlaces[2 * k - 1] as number));
    assert.ok(d > 5 && d < 11, `places ${k - 1} and ${k} are ${d.toFixed(1)} apart`);
  }
  // Homing (a carrier, or on its way back), it stores nothing more.
  carrier(w, hx + 40, hy, 40);
  const before = c.routeN[0];
  for (let k = 0; k < 2 * 30; k++) g.tick(DT);
  assert.equal(c.routeN[0], before, "a homing ant adds no place");
  // Nor one in another mode (a fighter walks out too: its odometer runs), or one with food (a carrier on the way to its find).
  c.policy = () => "fight";
  c.carrying[0] = 0;
  c.mode[0] = MODES.indexOf("fight");
  c.odoSurf[0] = 0;
  c.routeAt[0] = 0;
  for (let k = 0; k < 3 * 30; k++) {
    g.tick(DT);
    c.mode[0] = MODES.indexOf("fight");
  }
  assert.ok((c.odoSurf[0] as number) > 8, "it walked");
  assert.equal(c.routeN[0], before, "a fighter adds no place");
});

test("route memory off (routeMemory 0) records nothing, and a place set by hand changes nothing", () => {
  assert.equal(DEFAULT_COLONY.routeMemory, 0);
  const run = (mem: boolean): number[] => {
    const w = plane({ routeMemory: 0 });
    const { g, c, hx, hy } = w;
    carrier(w, hx + 60, hy + 5, 80);
    if (mem) {
      store(c, along([[hx, hy], [hx + 60, hy + 5]]));
      c.routeState[0] = 0;
    }
    const xs: number[] = [];
    for (let k = 0; k < 30 * 30; k++) {
      g.tick(DT);
      xs.push(c.x[0] as number, c.y[0] as number);
    }
    if (!mem) assert.equal(c.routeN[0], 0, "off: no place stored");
    return xs;
  };
  assert.deepEqual(run(true), run(false), "the same run, bit for bit, with or without places");
  // And walking out records nothing.
  const w = plane({ routeMemory: 0 });
  w.c.policy = () => "explore";
  w.c.putAnt(0, PLANE, w.hx + 3, w.hy);
  w.c.mode[0] = EXPLORE;
  w.c.carrying[0] = 0;
  w.c.heading[0] = 0;
  for (let k = 0; k < 3 * 30; k++) w.g.tick(DT);
  assert.equal(w.c.routeN[0], 0);
});

test("route memory: a full store keeps every second place and doubles its spacing", () => {
  const w = plane({ routeMemory: 1, routeStep: 2, routeMax: 8 });
  const { g, c, hx, hy } = w;
  c.policy = () => "explore";
  c.putAnt(0, PLANE, hx + 3, hy);
  c.mode[0] = EXPLORE;
  c.carrying[0] = 0;
  c.heading[0] = 0;
  c.odoSurf[0] = 0;
  const first: number[] = [];
  let doubled = false;
  for (let k = 0; k < 8 * 30 && (c.x[0] as number) < 150; k++) {
    g.tick(DT);
    assert.ok((c.routeN[0] as number) <= 8, "never more than routeMax");
    if (!first.length && (c.routeN[0] as number) > 0) first.push(c.routePlaces[0] as number, c.routePlaces[1] as number);
    if ((c.routeGap[0] as number) > 2 && !doubled) {
      doubled = true;
      assert.equal(c.routeGap[0], 4, "the spacing doubled");
      assert.equal(c.routeN[0], 5, "the 4 it kept (of 8) and the place that was due");
      assert.equal(c.routePlaces[0], first[0], "the first place is kept");
      const d = Math.hypot((c.routePlaces[2] as number) - (c.routePlaces[0] as number), (c.routePlaces[3] as number) - (c.routePlaces[1] as number));
      assert.ok(d > 3 && d < 5, `the kept places are ${d.toFixed(1)} apart, twice the old spacing`);
    }
  }
  assert.ok(doubled, "the store filled");
  assert.ok((c.routeGap[0] as number) >= 4);
});

test("route memory: a newborn in a dead ant's slot has no places and no retrace", () => {
  const { c } = plane();
  store(c, [[50, 50], [58, 50], [66, 50]]);
  c.routeState[0] = 1;
  c.routeGoal[0] = 2;
  c.routeGap[0] = 16;
  c.routeAt[0] = 30;
  c.kill(0);
  assert.ok(c.spawn(), "a slot was free");
  assert.equal(c.routeN[0], 0);
  assert.equal(c.routeState[0], 0);
  assert.equal(c.routeGoal[0], -1);
  assert.equal(c.routeGap[0], c.params.routeStep);
  assert.equal(c.routeAt[0], 0);
});

test("route memory: coming up out of its own hole starts the trip's places afresh", () => {
  const { g, c, hx, hy } = plane();
  const hc = c.holeCells[c.params.nest] as HoleCell;
  c.policy = () => "explore";
  c.putAnt(0, CURTAIN, centreX(hc.col, hc.row), centreY(hc.row));
  c.mode[0] = EXPLORE;
  c.heading[0] = -Math.PI / 2;
  c.leaveOk[0] = 1;
  store(c, [[hx + 8, hy], [hx + 16, hy]]);
  c.routeState[0] = 2;
  assert.ok(tickUntil(g, 20, () => c.layer[0] === PLANE), "it came up");
  assert.ok((c.routeN[0] as number) <= 1, `${c.routeN[0]} places after coming up: the old ones are gone`);
  assert.equal(c.routeState[0], 0);
});

test("route memory 1: a carrier walled off from its hole by a band walks back out round it by its places, and gets home; off, it does not", () => {
  const home = (mem: number): number | null => {
    const w = plane({ routeMemory: mem }, POCKET);
    const { g, c, hx, hy } = w;
    // Its way out: up over the band, along it to its east end, down and back in along the pocket.
    const out = along([[hx, hy], [hx + 12, hy - 18], [hx + 107, hy - 18], [hx + 107, hy], [hx + 62, hy]]);
    carrier(w, hx + 62, hy, 80);
    store(c, out);
    return tickUntil(g, 150, () => c.layer[0] !== PLANE) ? g.time : null;
  };
  const off = home(0);
  const on = home(1);
  assert.ok(on !== null && on < 100, `route memory 1: down its hole after ${on} s`);
  assert.ok(off === null, `off: still on the plane after 150 s (home at ${off})`);
});

test("route memory: a stalled carrier starts retracing (routeMemory 1 and 2), once a trip; off, it does not", () => {
  const state = (mem: number): { state: number; goal: number; n: number } => {
    const w = plane({ routeMemory: mem }, POCKET);
    const { g, c, hx, hy } = w;
    const out = along([[hx, hy], [hx + 12, hy - 18], [hx + 107, hy - 18], [hx + 107, hy], [hx + 62, hy]]);
    carrier(w, hx + 62, hy, 80);
    store(c, out);
    tickUntil(g, 20, () => c.routeState[0] !== 0);
    return { state: c.routeState[0] as number, goal: c.routeGoal[0] as number, n: out.length };
  };
  for (const mem of [1, 2]) {
    const r = state(mem);
    assert.equal(r.state, 1, `routeMemory ${mem}: retracing`);
    assert.ok(r.goal <= r.n - 1 && r.goal >= 0, `routeMemory ${mem}: its goal is one of its places (${r.goal} of ${r.n})`);
  }
  assert.deepEqual(state(0), { state: 0, goal: -1, n: state(0).n }, "off: nothing started");
});

test("route memory 2 retraces on reaching its belief with no hole there; 1 searches as before", () => {
  const at = (mem: number): { state: number; search: number } => {
    const w = plane({ routeMemory: mem });
    const { g, c, hx, hy } = w;
    store(c, along([[hx, hy], [hx + 60, hy]]));
    carrier(w, hx + 60, hy, 60);
    c.driftSurf[0] = 1; // its vector's end is where it stands: 60 east of the hole it believes it left, nothing there
    g.tick(DT);
    return { state: c.routeState[0] as number, search: c.search[0] as number };
  };
  const two = at(2);
  assert.equal(two.state, 1, "2: retracing");
  assert.equal(two.search, 0, "2: it did not start its search");
  const one = at(1);
  assert.equal(one.state, 0, "1: not retracing at the belief");
  assert.ok(one.search > 0, "1: it searches round it");
  const off = at(0);
  assert.equal(off.state, 0);
  assert.ok(off.search > 0);
});

test("route memory 2 retraces the way out to where it began: its first place, near its hole, where the retrace ends", () => {
  const w = plane({ routeMemory: 2 });
  const { g, c, hx, hy } = w;
  store(c, [[hx + 7, hy], ...along([[hx + 7, hy], [hx + 30, hy + 20], [hx + 60, hy]])]);
  carrier(w, hx + 60, hy, 60);
  c.driftSurf[0] = 1; // its belief is the spot it stands on, 60 cells from the hole it left
  assert.ok(tickUntil(g, 20, () => c.routeState[0] === 2), "it walked its places in order to the first");
  assert.ok(g.time > 5 && g.time < 15, `after ${g.time.toFixed(1)} s (some 85 cells of places at 7 a second)`);
  assert.ok(Math.hypot((c.x[0] as number) - hx, (c.y[0] as number) - hy) < 14, "and it is by its hole");
});

test("route memory: a carrier without food, without places, or already retraced this trip does not retrace", () => {
  const run = (mem: number, how: "food" | "places" | "done"): { state: number; search: number } => {
    const w = plane({ routeMemory: mem });
    const { g, c, hx, hy } = w;
    if (how !== "places") store(c, along([[hx, hy], [hx + 60, hy]]));
    carrier(w, hx + 60, hy, 60);
    c.driftSurf[0] = 1;
    if (how === "food") c.carrying[0] = 0;
    if (how === "done") c.routeState[0] = 2;
    g.tick(DT);
    return { state: c.routeState[0] as number, search: c.search[0] as number };
  };
  for (const how of ["food", "places", "done"] as const) {
    const r = run(2, how);
    assert.equal(r.state, how === "done" ? 2 : 0, `${how}: state`);
    assert.ok(r.search > 0, `${how}: it searches as it did`);
  }
  // With no places stored (S1's carriers) the run is the same, bit for bit, as with routeMemory off.
  const path = (mem: number): number[] => {
    const w = plane({ routeMemory: mem });
    const { g, c, hx, hy } = w;
    carrier(w, hx + 60, hy, 60);
    c.driftSurf[0] = 1;
    const xs: number[] = [];
    for (let k = 0; k < 30 * 30; k++) {
      g.tick(DT);
      xs.push(c.x[0] as number, c.y[0] as number);
    }
    return xs;
  };
  assert.deepEqual(path(2), path(0));
});

test("route memory: within routeSee of a place it takes the earliest and aims for the one before; routeSee 0 only walks them in order", () => {
  // A way out that doubled back: place 2 and place 9 lie 4 apart.
  const loop: [number, number][] = [[60, 40], [66, 40], [72, 40], [78, 44], [82, 50], [86, 56], [90, 52], [86, 46], [80, 42], [74, 41], [68, 38]];
  const goalAfter = (see: number, x: number, y: number): number => {
    const w = plane({ routeMemory: 1, routeSee: see });
    const { g, c } = w;
    store(c, loop);
    carrier(w, x, y, 80);
    c.routeState[0] = 1;
    c.routeGoal[0] = 10;
    g.tick(DT);
    return c.routeGoal[0] as number;
  };
  assert.equal(goalAfter(5, 73, 41), 1, "close to places 2 and 9: the earlier, so it aims for place 1");
  assert.equal(goalAfter(5, 120, 70), 10, "far from every place: its goal stays");
  assert.equal(goalAfter(0, 73, 41), 10, "routeSee 0: no recognition off the goal");
  assert.equal(goalAfter(0, 68, 38.5), 9, "routeSee 0: at its goal (within LOOP_AT) it moves to the one before");
  assert.equal(goalAfter(3, 60.5, 40), -1, "at place 0: no place before it, so the retrace is over");
});

test("route memory: out of places the carrier searches as before and does not retrace again this trip", () => {
  const w = plane({ routeMemory: 1 }, POCKET);
  const { g, c, hx, hy } = w;
  store(c, [[hx + 62, hy]]);
  carrier(w, hx + 62, hy, 80);
  c.routeState[0] = 1;
  c.routeGoal[0] = 0;
  g.tick(DT);
  assert.equal(c.routeState[0], 2, "the last place reached: done");
  assert.equal(c.routeGoal[0], -1);
  assert.ok((c.search[0] as number) > 0, "its search goes on from here");
  for (let k = 0; k < 30 * 30; k++) {
    g.tick(DT);
    assert.equal(c.routeState[0], 2, "stalled against the band again, it does not retrace a second time");
    if (c.layer[0] !== PLANE) break;
  }
});

test("route memory: a place it cannot get to (behind rock) is given up on a stall, for the one before", () => {
  const w = plane({ routeMemory: 1 }, POCKET);
  const { g, c, hx, hy } = w;
  const here = hx + 62;
  // Places 0 to 2 lie outside the pocket (below its lower arm); place 3, the goal, is on the far side of its wall: straight at it is rock.
  store(c, [[hx + 10, hy + 25], [hx + 20, hy + 25], [hx + 30, hy + 25], [hx + 10, hy]]);
  carrier(w, here, hy, 80);
  c.routeState[0] = 1;
  c.routeGoal[0] = 3;
  assert.ok(tickUntil(g, 60, () => (c.routeGoal[0] as number) < 3), "the goal moved to an earlier place");
  assert.equal(c.routeGoal[0], 2, "to the one before");
  assert.ok(g.time > 3 && g.time < 15, `after the stall, ${g.time.toFixed(1)} s`);
});

test("route memory: the hole's sight takes over at any moment of a retrace", () => {
  const w = plane({ routeMemory: 1 });
  const { g, c, hx, hy } = w;
  store(c, [[hx + 30, hy], [hx + 40, hy + 10], [hx + 50, hy]]);
  carrier(w, hx + 4, hy + 2, 60);
  c.routeState[0] = 1;
  c.routeGoal[0] = 2;
  assert.ok(tickUntil(g, 5, () => c.layer[0] !== PLANE), "in sight of its hole it goes down it, not to its place 50 cells away");
});

test("route memory: not on a top-down map, which has no vector to fail", () => {
  const run = (mem: number): number[] => {
    const world = generateWorld(3, { size: { w: 128, h: 96 }, nestCount: 1 });
    const flat = new Colony(world, { antCount: 1, maxAnts: 1, routeMemory: mem, deposit: 0 }, mulberry32(5), () => "explore");
    flat.age[0] = 0.5 * LIFESPAN;
    flat.mode[0] = EXPLORE;
    flat.carrying[0] = 0;
    flat.routePlaces[0] = 5;
    flat.routePlaces[1] = 5;
    flat.routeN[0] = 1;
    const xs: number[] = [];
    for (let t = 0; t < 20 * 30; t++) {
      flat.tick(DT);
      xs.push(flat.x[0] as number, flat.y[0] as number);
    }
    assert.equal(flat.routeN[0], 1, "it stored nothing on a flat map");
    assert.equal(flat.routeState[0], 0);
    return xs;
  };
  assert.deepEqual(run(2), run(0));
});

test("route memory: a save carries the places and the retrace, and the game runs on to the same", () => {
  assert.equal(SAVE_VERSION, 9);
  const make = (): Game => new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 }, rockiness: 0 } }), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(7), { colony: { routeMemory: 2 } });
  const g = make();
  const c = g.player;
  const hc = c.holeCells[c.params.nest] as HoleCell;
  const hx = centreX(hc.px, hc.py);
  const hy = centreY(hc.py);
  store(c, along([[hx, hy], [hx + 40, hy + 8]]));
  c.routeState[0] = 1;
  c.routeGoal[0] = 3;
  c.routeGap[0] = 16;
  c.routeAt[0] = 33.5;
  c.routePlaces[2 * 63] = 12.25;
  c.routePlaces[2 * 63 + 1] = -3.5;
  for (let k = 0; k < 20; k++) g.tick(DT);
  const saved = JSON.parse(JSON.stringify(g.save()));
  const fresh = make();
  fresh.load(saved);
  const f = fresh.player;
  for (const k of ["routePlaces", "routeN", "routeGap", "routeAt", "routeState", "routeGoal"] as const) assert.deepEqual(Array.from(f[k]), Array.from(c[k]), k);
  for (let k = 0; k < 60; k++) {
    g.tick(DT);
    fresh.tick(DT);
  }
  for (const k of ["x", "y", "routeN", "routeState", "routeGoal"] as const) assert.deepEqual(Array.from(fresh.player[k]), Array.from(c[k]), `after running on: ${k}`);
});

test("R1: pocket carriers get home with route memory 2 (seed 4: 45 % home within 300 s without it)", { timeout: 120_000 }, () => {
  const off = runAssay(route1, 4, {});
  const on = runAssay(route1, 4, { colony: { routeMemory: 2 } });
  assert.ok((off.metrics.home300 as number) < 0.95, `off: ${off.metrics.home300}`);
  assert.ok((on.metrics.home300 as number) >= 0.95, `on: ${on.metrics.home300}`);
  assert.ok((on.metrics.ratio as number) <= 4, `walked ÷ way round ${on.metrics.ratio}`);
});
