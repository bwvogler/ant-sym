import { test } from "node:test";
import assert from "node:assert/strict";
import type { Colony } from "../../colony.ts";
import { R } from "../../hex.ts";
import { piSpanOf, searchOn } from "../../homing.ts";
import { PI_DRIFT_2D, PI_SPAN_GAIN, SEARCH_GROW_2D, SEARCH_START } from "../../tuning.ts";
import { PLANE } from "../../vocab.ts";

// ja-lp4.20 (docs/nest-search.md "Sizing the search to the vector's error", PRD §79.2): with searchScale on, U3b's spiral
// round where the vector ran out is sized by the vector's own error σ = PI_DRIFT/√2 × piSpan: point n reaches
// σ × (searchScale + searchScaleStep × n/4), at least SEARCH_START, a quarter turn on each time. Off: U3b's spiral, bit for bit.

const AT = 50;

/** One ant (0) on a one-world plane of w × h, homing with its search not begun: just what searchOn reads. */
function ant(params: Partial<Colony["params"]>, odo: number, reach: number, w = 400, h = 300): Colony {
  return {
    line: {},
    cur: PLANE,
    map: { size: { w, h } },
    params: {
      searchLoops: 0,
      searchScale: 0,
      searchScaleStep: 0.5,
      piErrorLaw: 1,
      piErrorAt: AT,
      routeEnd: 1,
      ...params,
    },
    search: new Float32Array(1),
    searchA: new Float32Array(1),
    searchLeg: new Uint32Array(1),
    heading: new Float32Array([0.7]),
    odoSurf: new Float32Array([odo]),
    reachSurf: new Float32Array([reach]),
    routeState: new Uint8Array(1),
    routeN: new Uint16Array(1),
    wall: new Uint8Array(1),
    mx: new Float32Array(1),
    bestD: new Float32Array(1),
    stallT: new Float32Array(1),
    rng: () => 0.5,
  } as unknown as Colony;
}

/** The reaches and headings of the first k points of ant 0's search. */
function points(c: Colony, k: number): { s: number; a: number }[] {
  const out: { s: number; a: number }[] = [];
  for (let n = 0; n < k; n++) {
    searchOn(c, 0);
    out.push({ s: c.search[0]!, a: c.searchA[0]! });
  }
  return out;
}

const near = (a: number, b: number, what: string): void =>
  assert.ok(Math.abs(a - b) < 1e-4 * Math.max(1, Math.abs(b)), `${what}: ${a} want ${b}`);

test("off (searchScale 0): U3b's spiral from SEARCH_START, SEARCH_GROW_2D a point, whatever the trip", () => {
  for (const law of [0, 1]) {
    const c = ant({ searchScale: 0, piErrorLaw: law }, 400, 200);
    const p = points(c, 9);
    near(p[0]!.s, SEARCH_START, "first");
    near(p[0]!.a, 0.7, "the first ahead of the ant");
    for (let n = 1; n < p.length; n++) {
      near(p[n]!.s, Math.fround(p[n - 1]!.s * SEARCH_GROW_2D), `point ${n}`);
      near(p[n]!.a - p[n - 1]!.a, Math.PI / 2, `point ${n}'s turn`);
    }
    assert.equal(c.searchLeg[0], 0, "no points counted");
  }
});

test("on: point n reaches σ × (searchScale + searchScaleStep × n/4), σ the vector's own error by the distance out", () => {
  const reach = 100;
  const c = ant({ searchScale: 1, searchScaleStep: 0.5 }, 900, reach);
  const sigma = PI_DRIFT_2D * PI_SPAN_GAIN * Math.sqrt(AT * reach);
  near(sigma, PI_DRIFT_2D * piSpanOf(1, AT, 0, reach), "σ");
  const p = points(c, 12);
  for (let n = 0; n < p.length; n++) {
    near(p[n]!.s, sigma * (1 + (0.5 * n) / 4), `point ${n}`);
    if (n > 0) near(p[n]!.a - p[n - 1]!.a, Math.PI / 2, `point ${n}'s turn`);
  }
  near(p[0]!.a, 0.7, "the first ahead of the ant");
  // An even spiral: a full turn adds searchScaleStep σ, at every size (U3b's adds 60 % of the last).
  near(p[8]!.s - p[4]!.s, p[4]!.s - p[0]!.s, "the same step each turn");
  near(p[4]!.s - p[0]!.s, 0.5 * sigma, "a turn adds searchScaleStep σ");
});

test("on: wider after a longer trip out, by √ the distance out with law 1, not by the path walked", () => {
  const first = (odo: number, reach: number, law = 1): number => points(ant({ searchScale: 1, piErrorLaw: law }, odo, reach), 1)[0]!.s;
  near(first(100, 400), 2 * first(100, 100), "four times as far out, twice as wide");
  near(first(100, 100), first(2000, 100), "a winding path (odometer 2000) is no wider");
  // Law 0: σ from the odometer, as the loops' (searchLoops) σ.
  near(first(400, 0, 0), PI_DRIFT_2D * 400, "law 0: the odometer's σ");
  near(first(800, 0, 0), 2 * first(400, 0, 0), "law 0: twice the path, twice as wide");
});

test("on: never under SEARCH_START, and never past the plane's longer side", () => {
  const c = ant({ searchScale: 1 }, 0, 0);
  for (const { s } of points(c, 6)) near(s, SEARCH_START, "no error: SEARCH_START");
  const big = ant({ searchScale: 1, searchScaleStep: 4 }, 0, 10000, 50, 100);
  const p = points(big, 40);
  const cap = Math.max(50, 100 * R);
  assert.ok(
    p.every(({ s }) => s <= cap + 1e-6),
    "capped",
  );
  near(p[p.length - 1]!.s, cap, "reaches the cap");
});

test("on: a fresh search starts again from its first point", () => {
  const c = ant({ searchScale: 0.5 }, 0, 200);
  const p = points(c, 5);
  c.search[0] = 0;
  const q = points(c, 2);
  near(q[0]!.s, p[0]!.s, "first again");
  near(q[1]!.s, p[1]!.s, "second again");
  assert.equal(c.searchLeg[0], 1);
});

test("on: a search round its first stored place (routeEnd) keeps U3b's spiral: that place is seen, not the vector's end", () => {
  const c = ant({ searchScale: 1 }, 400, 200);
  c.routeState[0] = 2;
  c.routeN[0] = 3;
  const p = points(c, 5);
  near(p[0]!.s, SEARCH_START, "first");
  for (let n = 1; n < p.length; n++) near(p[n]!.s, Math.fround(p[n - 1]!.s * SEARCH_GROW_2D), `point ${n}`);
  // routeEnd 0: the search stays round the vector's end, so it is sized.
  const d = ant({ searchScale: 1, routeEnd: 0 }, 400, 200);
  d.routeState[0] = 2;
  d.routeN[0] = 3;
  near(points(d, 1)[0]!.s, PI_DRIFT_2D * piSpanOf(1, AT, 400, 200), "routeEnd 0: sized");
});
