import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Builder,
  centreX,
  centreY,
  CURTAIN,
  Game,
  generateOneWorld,
  mulberry32,
  OPEN,
  PLANE,
  rockAt,
  type WorldMap,
} from "../../../colony/index.ts";
import { AntTraces, TRACE_FADE_MS, TRACE_MAX, traceAlpha } from "../../trace.ts";

// A moved ant's way home on the top view (ja-cwjp): recorded from where the tweezers set it down, the vector's run and
// the search told apart, ended by a hole or a death, fading after; an undone move shows nothing.

const pt = (x: number, y: number) => ({ x: centreX(x, y), y: centreY(y) });

function setUp() {
  const g = new Game(
    generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }),
    { antCount: 30, rivalAnts: 30, regrow: 0 },
    mulberry32(3),
  );
  for (let k = 0; k < 30 * 20; k++) g.tick(1 / 30);
  const c = g.colonies[0]!;
  const i = [...Array(c.n).keys()].find((j) => c.alive[j] && c.layer[j] === PLANE)!;
  assert.ok(i !== undefined, "an ant on the plane");
  // Open ground some way from its hole, to set it down on.
  const map = g.layers[PLANE] as WorldMap;
  const h = c.holeCells[c.params.nest]!;
  let to: { x: number; y: number } | null = null;
  for (let y = 10; y < map.size.h - 10 && !to; y++)
    for (let x = 10; x < map.size.w - 10 && !to; x++) {
      const p = pt(x, y);
      if (rockAt(map, x, y) === OPEN && Math.hypot(p.x - h.px, p.y - h.py) > 30) to = p;
    }
  assert.ok(to);
  const b = new Builder(g);
  return { g, c, i, b, to: to!, traces: new AntTraces(b) };
}

/** Run the game `seconds`, recording a frame each tick (the clock in ms). */
function run(g: Game, traces: AntTraces, seconds: number, t0 = 0): number {
  let now = t0;
  for (let k = 0; k < 30 * seconds; k++) {
    g.tick(1 / 30);
    now += 1000 / 30;
    traces.update(now);
  }
  return now;
}

test("a moved ant's walk is recorded from where it was set down, as it goes", () => {
  const { g, c, i, b, to, traces } = setUp();
  traces.update(0);
  assert.equal(traces.traces.length, 0, "nothing moved, nothing traced");
  assert.ok(b.moveAnt(0, i, to.x, to.y));
  traces.update(0);
  const t = traces.traces[0]!;
  assert.equal(traces.traces.length, 1);
  assert.ok(Math.hypot(t.xs[0]! - to.x, t.ys[0]! - to.y) < 1e-3, "it starts where the tweezers put it");
  run(g, traces, 5);
  if (c.layer[i] === PLANE && c.alive[i]) assert.ok(t.xs.length > 3, `${t.xs.length} points after 5 s`);
  assert.equal(t.xs.length, t.ys.length);
  assert.equal(t.xs.length, t.search.length);
  for (let k = 1; k < t.xs.length; k++) assert.ok(Math.hypot(t.xs[k]! - t.xs[k - 1]!, t.ys[k]! - t.ys[k - 1]!) >= 0.5 - 1e-9);
});

test("its search is marked apart from its vector's run", () => {
  const { g, c, i, b, to, traces } = setUp();
  assert.ok(b.moveAnt(0, i, to.x, to.y));
  traces.update(0);
  const t = traces.traces[0]!;
  // As the game's search flag reads, point by point.
  let now = 0;
  for (let k = 0; k < 30 * 60 && c.layer[i] === PLANE && c.alive[i]; k++) {
    g.tick(1 / 30);
    now += 1000 / 30;
    const before = t.xs.length;
    traces.update(now);
    if (t.xs.length > before) assert.equal(t.search[t.xs.length - 1], c.search[i] !== 0 ? 1 : 0);
  }
});

test("carried again, its trace starts over where it is set down", () => {
  const { g, i, b, to, traces } = setUp();
  assert.ok(b.moveAnt(0, i, to.x, to.y));
  traces.update(0);
  run(g, traces, 3);
  const c = g.colonies[0]!;
  const again = { x: c.x[i]! + 3, y: c.y[i]! };
  if (!b.moveAnt(0, i, again.x, again.y)) return; // set down on rock: refused, nothing to check
  traces.update(4000);
  const t = traces.traces[0]!;
  assert.equal(traces.traces.length, 1);
  assert.equal(t.xs.length, 1);
  assert.ok(Math.hypot(t.xs[0]! - c.x[i]!, t.ys[0]! - c.y[i]!) < 1e-3);
});

test("an undone move shows no trace", () => {
  const { i, b, to, traces } = setUp();
  assert.ok(b.moveAnt(0, i, to.x, to.y));
  traces.update(0);
  assert.equal(traces.traces.length, 1);
  assert.ok(b.undo());
  traces.update(16);
  assert.equal(traces.traces.length, 0);
});

test("down a hole it ends as home, and fades out over TRACE_FADE_MS", () => {
  const { c, i, b, to, traces } = setUp();
  assert.ok(b.moveAnt(0, i, to.x, to.y));
  traces.update(0);
  c.layer[i] = CURTAIN; // as if it went down a hole
  traces.update(1000);
  const t = traces.traces[0]!;
  assert.equal(t.end, "home");
  assert.equal(t.done, 1000);
  assert.equal(traceAlpha(t, 1000), 1);
  assert.ok(Math.abs(traceAlpha(t, 1000 + TRACE_FADE_MS / 2) - 0.5) < 1e-9);
  traces.update(1000 + TRACE_FADE_MS / 2);
  assert.equal(traces.traces.length, 1, "kept while it fades");
  traces.update(1000 + TRACE_FADE_MS);
  assert.equal(traces.traces.length, 0, "gone once faded");
});

test("dead, it ends as lost", () => {
  const { c, i, b, to, traces } = setUp();
  assert.ok(b.moveAnt(0, i, to.x, to.y));
  traces.update(0);
  c.alive[i] = 0;
  traces.update(500);
  assert.equal(traces.traces[0]!.end, "lost");
});

test("its slot reborn, it ends as lost, not home (review of #238, N1)", () => {
  const { c, i, b, to, traces } = setUp();
  assert.ok(b.moveAnt(0, i, to.x, to.y));
  traces.update(0);
  c.gen[i] = (c.gen[i]! + 1) >>> 0; // died and born again in its slot, underground
  c.layer[i] = CURTAIN;
  traces.update(500);
  assert.equal(traces.traces[0]!.end, "lost");
});

test("a long walk is thinned, keeping where it began and where it is", () => {
  const { c, i, b, to, traces } = setUp();
  assert.ok(b.moveAnt(0, i, to.x, to.y));
  traces.update(0);
  // Step the ant by hand, past TRACE_MAX points, without running the game.
  for (let k = 1; k <= TRACE_MAX + 5; k++) {
    c.x[i] = to.x + (k % 2 ? 0.6 : 0) + k * 1e-3;
    c.y[i] = to.y + k * 0.6;
    traces.update(k);
  }
  const t = traces.traces[0]!;
  assert.ok(t.xs.length <= TRACE_MAX, `${t.xs.length} points`);
  assert.ok(Math.hypot(t.xs[0]! - to.x, t.ys[0]! - to.y) < 1e-3, "the start is kept");
  assert.equal(t.ys[t.ys.length - 1], c.y[i], "the latest point is kept");
});
