import { test } from "node:test";
import assert from "node:assert/strict";
import { type Colony, CURTAIN, LIFESPAN, PLANE, type HoleCell } from "../../colony.ts";
import { MODES } from "../../vocab.ts";
import { believePlane, piSpan, routeFail, routeTo } from "../../homing.ts";
import { Game, gameRng } from "../../game.ts";
import { centreX, centreY } from "../../hex.ts";
import { PI_DRIFT_2D, SEARCH_START } from "../../tuning.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { ROCK } from "../../world.ts";

// Where a retrace joins the way out, and where the search goes after it (ja-lp4.6.3.1, docs/route-memory.md §5, PRD §59):
// routeJoin 1 joins at the stored place nearest the carrier in view, not its newest, once its vector has run out (it is searching);
// routeJoin 2 does so at every retrace (the nearest-place rule alone is tested at 2); routeEnd 1 searches afresh round its first
// stored place once the retrace is over, not round its vector's end. Both 0: as before. Seed 7's small plane, as in
// oneWorldRoute.test.ts.

const DT = 1 / 30;
const RETURN = MODES.indexOf("return");

function plane(params: Partial<Colony["params"]>): { g: Game; c: Colony; hx: number; hy: number } {
  const g = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 }, rockiness: 0 } }), { regrow: 0 }, gameRng(7), [
    { antCount: 10, colony: { routeMemory: 1, ...params } },
    { antCount: 10 },
  ]);
  const map = g.world!.plane;
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) map.food.set(x, y, 0);
  map.foodLeft = 0;
  for (const k of g.colonies) for (let i = 0; i < k.n; i++) if (k.alive[i]) k.age[i] = 0.05 * LIFESPAN;
  const c = g.colonies[0]!;
  Object.assign(c.params, { scoutRate: 0, raidScout: 0 });
  c.age[0] = 0.5 * LIFESPAN;
  const hc = c.holeCells[c.params.nest] as HoleCell;
  return { g, c, hx: centreX(hc.px, hc.py), hy: centreY(hc.py) };
}

/** Ant 0, carrying food and homing at (x, y), its vector run `odo` cells with drift (dx, dy) a cell; its places `pts`. */
function carrier(c: Colony, x: number, y: number, pts: [number, number][], odo = 100, dx = 0, dy = 0): void {
  pts.forEach(([px, py], k) => {
    c.routePlaces[2 * k] = px;
    c.routePlaces[2 * k + 1] = py;
  });
  c.routeN[0] = pts.length;
  c.putAnt(0, PLANE, x, y);
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  c.odoSurf[0] = odo;
  c.driftSurf[0] = dx;
  c.driftSurfY[0] = dy;
  c.fatigue[0] = 0;
  c.bindPolicy("mode", () => "return");
}

/** `fn` with the colony bound to the plane (as the tick binds it for an ant there), then bound home again (the curtain). */
function onPlane<T>(c: Colony, fn: () => T): T {
  c.bind(PLANE);
  try {
    return fn();
  } finally {
    c.bind(CURTAIN);
  }
}

/** Ant 0's vector ends `ex` cells east of its hole, from a trip 45 out at the farthest (the way out's farthest place): its drift by the span. */
function endEast(c: Colony, ex: number): void {
  c.reachSurf[0] = 45;
  c.driftSurf[0] = ex / piSpan(c, 0);
  c.driftSurfY[0] = 0;
}

/** A way out east from the hole and back west 20 cells south of it, to a pickup far west: 12 places. */
const wayOut = (hx: number, hy: number): [number, number][] => [
  [hx + 5, hy],
  [hx + 15, hy],
  [hx + 25, hy],
  [hx + 35, hy],
  [hx + 45, hy + 10],
  [hx + 35, hy + 20],
  [hx + 25, hy + 20],
  [hx + 15, hy + 20],
  [hx + 5, hy + 20],
  [hx - 5, hy + 20],
  [hx - 15, hy + 20],
  [hx - 25, hy + 20],
];

test("routeJoin 2: a stalled carrier joins its way out at the stored place nearest it; 0, at its newest", () => {
  for (const [join, want] of [
    [0, 11],
    [2, 2],
  ] as const) {
    const { c, hx, hy } = plane({ routeJoin: join });
    // Its vector has brought it back near home, beside place 2 (21 cells east of the hole), far from where it picked up.
    carrier(c, hx + 24, hy + 1, wayOut(hx, hy));
    assert.ok(
      onPlane(c, () => routeFail(c, 0, true)),
      "route memory takes the stall",
    );
    assert.equal(c.routeState[0], 1, "it retraces");
    assert.equal(c.routeGoal[0], want, `routeJoin ${join}: goal place ${want}`);
  }
});

test("routeJoin 2: of two places as near, the newer; at the pickup its newest, as with 0", () => {
  const { c, hx, hy } = plane({ routeJoin: 2 });
  carrier(c, hx - 24, hy + 20, wayOut(hx, hy));
  onPlane(c, () => routeFail(c, 0, true));
  assert.equal(c.routeGoal[0], 11, "beside its newest place, it starts there");
  const w = plane({ routeJoin: 2 });
  carrier(w.c, w.hx, w.hy + 20, [
    [w.hx - 4, w.hy + 20],
    [w.hx + 4, w.hy + 20],
  ]);
  onPlane(w.c, () => routeFail(w.c, 0, true));
  assert.equal(w.c.routeGoal[0], 1, "equidistant: the newer place");
});

test("routeJoin 2: a place across rock is not in view; the nearest it can see, or else its newest", () => {
  const { c, hx, hy } = plane({ routeJoin: 2 });
  // A wall between the carrier and places 1 to 3 (the row y = hy): the nearest it can see is place 6, on its own side.
  const map = c.layers[PLANE]!.map;
  for (let y = 0; y <= 2; y++) for (let x = -10; x <= 40; x++) map.rock.set(48 + x, 34 + y, ROCK);
  const wallY = centreY(34);
  assert.ok(wallY > hy && wallY < hy + 7, `the wall's row lies between the places and the carrier (${wallY - hy})`);
  carrier(c, hx + 24, hy + 9, wayOut(hx, hy));
  onPlane(c, () => routeFail(c, 0, true));
  assert.equal(c.routeGoal[0], 6, "place 2 is nearer, but behind the wall: place 6");
  // Walled in on every side: nothing in view, so its newest.
  const w = plane({ routeJoin: 2 });
  const m = w.c.layers[PLANE]!.map;
  for (let y = 0; y < m.size.h; y++)
    for (let x = 0; x < m.size.w; x++) if (Math.abs(centreY(y) - (w.hy + 15)) > 1.5) m.rock.set(x, y, ROCK);
  carrier(w.c, w.hx + 24, w.hy + 15, wayOut(w.hx, w.hy));
  onPlane(w.c, () => routeFail(w.c, 0, true));
  assert.equal(w.c.routeGoal[0], 11, "no place in view: its newest");
});

test("routeJoin 1: the nearest place only once its vector has run out (searching at its belief); a stall before that, its newest", () => {
  for (const [join, search, want] of [
    [1, 0, 11],
    [1, 3, 2],
    [2, 0, 2],
    [0, 3, 11],
  ] as const) {
    const { c, hx, hy } = plane({ routeJoin: join });
    // Beside place 2, near home: a stall with no search begun (as at a pickup) or one in its search at its vector's end.
    carrier(c, hx + 24, hy + 1, wayOut(hx, hy));
    c.search[0] = search;
    onPlane(c, () => routeFail(c, 0, true));
    assert.equal(c.routeGoal[0], want, `routeJoin ${join}, search ${search}: goal place ${want}`);
  }
});

test("routeJoin 1, in a game: a carrier near home walks in, not back out to its pickup", () => {
  const steps = (join: number): { home: boolean; far: number } => {
    const { g, c, hx, hy } = plane({ routeJoin: join });
    // 7 cells from place 2 (out of routeSee), searching round its vector's end (12 cells north-east of the hole), it
    // stalls: the retrace starts.
    carrier(c, hx + 24, hy + 7, wayOut(hx, hy), 100, 0.12, -0.12);
    c.search[0] = SEARCH_START;
    assert.ok(onPlane(c, () => routeFail(c, 0, true)));
    let far = 0;
    for (let k = 0; k < 60 * 30; k++) {
      g.tick(DT);
      if (c.layer[0] !== PLANE || !c.carrying[0]) return { home: true, far };
      far = Math.max(far, Math.hypot(c.x[0] - hx, c.y[0] - hy));
    }
    return { home: false, far };
  };
  const off = steps(0);
  const on = steps(1);
  assert.ok(on.home, "routeJoin 1: home within 60 s");
  assert.ok(on.far < 35, `routeJoin 1: never more than 35 cells out (${on.far.toFixed(1)})`);
  assert.ok(off.far > on.far + 10, `routeJoin 0 walks further out (${off.far.toFixed(1)} against ${on.far.toFixed(1)})`);
});

test("routeEnd 1: the retrace over, the search starts afresh round its first place; 0, it goes on round its vector's end", () => {
  for (const end of [0, 1]) {
    const { c, hx, hy } = plane({ routeEnd: end });
    const pts = wayOut(hx, hy);
    // Its vector's end lies 40 cells east of the hole; its search had reached 20 cells (σ ~10 by its span: its ninth point,
    // σ × (1 + 0.5 × 8/4), searchScale's) before the retrace.
    carrier(c, hx + 20, hy + 30, pts, 100);
    endEast(c, 40);
    c.routeState[0] = 1;
    c.searchLeg[0] = 8;
    c.search[0] = PI_DRIFT_2D * piSpan(c, 0) * (c.params.searchScale + (c.params.searchScaleStep * 8) / 4);
    const s0 = c.search[0];
    const [b, nx, ny] = onPlane(c, () => {
      routeTo(c, 0, -1);
      const at = believePlane(c, 0, c.nest);
      return [{ x: at.x, y: at.y }, c.nest.x, c.nest.y] as const;
    });
    assert.equal(c.routeState[0], 2, "the retrace is over");
    const fromFirst = Math.hypot(b.x - pts[0]![0], b.y - pts[0]![1]);
    const fromEnd = Math.hypot(b.x - (nx + 40), b.y - ny);
    if (end) {
      assert.equal(c.search[0], SEARCH_START, "routeEnd 1: its search starts afresh");
      assert.ok(Math.abs(fromFirst - SEARCH_START) < 1e-4, `routeEnd 1: its search's point is round place 0 (${fromFirst.toFixed(2)})`);
    } else {
      assert.ok(c.search[0] > s0, `routeEnd 0: its search widens on (${s0.toFixed(1)} to ${c.search[0].toFixed(1)})`);
      assert.ok(Math.abs(fromEnd - c.search[0]) < 1e-6, `routeEnd 0: round its vector's end (${fromEnd.toFixed(2)})`);
    }
  }
});

test("routeEnd 1 changes nothing before a retrace is over", () => {
  const { c, hx, hy } = plane({ routeEnd: 1 });
  carrier(c, hx + 60, hy + 40, wayOut(hx, hy), 100);
  endEast(c, 40);
  c.routeState[0] = 0;
  c.search[0] = 10;
  c.searchA[0] = 0;
  const [bx, by, nx, ny] = onPlane(c, () => {
    const at = believePlane(c, 0, c.nest);
    return [at.x, at.y, c.nest.x, c.nest.y] as const;
  });
  // Its vector's end: 40 east, as its drift is stored (a Float32: 40 to within ~3e-6).
  const ex = piSpan(c, 0) * c.driftSurf[0];
  assert.ok(Math.abs(ex - 40) < 1e-4);
  assert.ok(Math.abs(bx - (nx + ex + 10)) < 1e-6 && Math.abs(by - ny) < 1e-6, "searching round its vector's end, as before");
});

test("routeFight 1: an ant walking out in fight mode stores its places; 0, it does not; with food, never", () => {
  const FIGHT = MODES.indexOf("fight");
  // One tick of ant 0 in fight mode with a place due (its last stored place far behind on its odometer): places held after.
  const stored = (fight: number, carrying: 0 | 1): number => {
    const { g, c, hx, hy } = plane({ routeStep: 8, routeFight: fight });
    c.bindPolicy("mode", () => "fight");
    c.putAnt(0, PLANE, hx + 12, hy);
    c.mode[0] = FIGHT;
    c.carrying[0] = carrying;
    c.heading[0] = 0;
    c.odoSurf[0] = 12;
    c.routeAt[0] = 0;
    c.routeN[0] = 0;
    g.tick(DT);
    return c.routeN[0];
  };
  assert.equal(stored(1, 0), 1, "routeFight 1: a fighter records");
  assert.equal(stored(0, 0), 0, "routeFight 0: it does not");
  assert.equal(stored(1, 1), 0, "routeFight 1, food in its jaws: nothing");
});
