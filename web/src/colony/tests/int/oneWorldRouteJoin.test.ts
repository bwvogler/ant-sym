import { test } from "node:test";
import assert from "node:assert/strict";
import { type Colony, CURTAIN, LIFESPAN, PLANE, type HoleCell } from "../../colony.ts";
import { MODES } from "../../vocab.ts";
import { believePlane, routeFail, routeTo } from "../../homing.ts";
import { Game, gameRng } from "../../game.ts";
import { centreX, centreY } from "../../hex.ts";
import { SEARCH_START } from "../../tuning.ts";
import { generateOneWorld } from "../../oneWorld.ts";

// Where a retrace joins the way out, and where the search goes after it (ja-lp4.6.3.1, docs/route-memory.md §5, PRD §59):
// routeJoin 1 joins at the stored place nearest the carrier, not its newest; routeEnd 1 searches afresh round its first
// stored place once the retrace is over, not round its vector's end. Both 0: as before. Seed 7's small plane, as in
// oneWorldRoute.test.ts.

const DT = 1 / 30;
const RETURN = MODES.indexOf("return");

function plane(params: Partial<Colony["params"]>): { g: Game; c: Colony; hx: number; hy: number } {
  const g = new Game(
    generateOneWorld(7, { plane: { size: { w: 160, h: 100 }, rockiness: 0 } }),
    { antCount: 10, rivalAnts: 10, regrow: 0 },
    gameRng(7),
    { colony: { routeMemory: 1, ...params } },
  );
  const map = g.world!.plane;
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) map.food.set(x, y, 0);
  map.foodLeft = 0;
  for (const k of g.colonies) for (let i = 0; i < k.n; i++) if (k.alive[i]) k.age[i] = 0.05 * LIFESPAN;
  const c = g.player;
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

test("routeJoin 1: a stalled carrier joins its way out at the stored place nearest it; 0, at its newest", () => {
  for (const [join, want] of [
    [0, 11],
    [1, 2],
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

test("routeJoin 1: of two places as near, the newer; at the pickup its newest, as with 0", () => {
  const { c, hx, hy } = plane({ routeJoin: 1 });
  carrier(c, hx - 24, hy + 20, wayOut(hx, hy));
  onPlane(c, () => routeFail(c, 0, true));
  assert.equal(c.routeGoal[0], 11, "beside its newest place, it starts there");
  const w = plane({ routeJoin: 1 });
  carrier(w.c, w.hx, w.hy + 20, [
    [w.hx - 4, w.hy + 20],
    [w.hx + 4, w.hy + 20],
  ]);
  onPlane(w.c, () => routeFail(w.c, 0, true));
  assert.equal(w.c.routeGoal[0], 1, "equidistant: the newer place");
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
    // Its vector's end lies 40 cells east of the hole; its search had reached 20 cells before the retrace.
    carrier(c, hx + 20, hy + 30, pts, 100, 0.4, 0);
    c.routeState[0] = 1;
    c.search[0] = 20;
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
      assert.ok(c.search[0] > 20, "routeEnd 0: its search widens on");
      assert.ok(Math.abs(fromEnd - c.search[0]) < 1e-6, `routeEnd 0: round its vector's end (${fromEnd.toFixed(2)})`);
    }
  }
});

test("routeEnd 1 changes nothing before a retrace is over", () => {
  const { c, hx, hy } = plane({ routeEnd: 1 });
  carrier(c, hx + 60, hy + 40, wayOut(hx, hy), 100, 0.4, 0);
  c.routeState[0] = 0;
  c.search[0] = 10;
  c.searchA[0] = 0;
  const [bx, by, nx, ny] = onPlane(c, () => {
    const at = believePlane(c, 0, c.nest);
    return [at.x, at.y, c.nest.x, c.nest.y] as const;
  });
  assert.ok(Math.abs(bx - (nx + 40 + 10)) < 1e-6 && Math.abs(by - ny) < 1e-6, "searching round its vector's end, as before");
});
