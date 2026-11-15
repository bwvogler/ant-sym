import { test } from "node:test";
import assert from "node:assert/strict";
import type { Colony } from "../../colony.ts";
import { gauss } from "../../grid.ts";
import { piSpan, piSpanOf } from "../../homing.ts";
import { PI_DRIFT_2D, PI_MISS_AT, PI_SPAN_GAIN } from "../../tuning.ts";
import { mulberry32 } from "../../world.ts";

// ja-lp4.19 (docs/nest-search.md "How far the vector is off", PRD §78): the home vector's error on one world's plane.
// Law 0 multiplies the trip's drift by the odometer (today); law 1 by PI_SPAN_GAIN × √(piErrorAt × the distance out), so
// the miss's median is PI_MISS_AT × √(piErrorAt × distance out): 25 % at piErrorAt, half that at four times as far
// (Merkle, Knaden & Wehner 2006, via Goldschmidt et al. 2017: 25 % at 5 m, 12 % at 20 m).

const AT = 50;

/** The median miss (cells) of n trips' drifts, as crossUp draws them, scaled by law 1 at `out` cells out. */
function medianMiss(out: number, n = 20001): number {
  const rng = mulberry32(19);
  const span = piSpanOf(1, AT, 0, out);
  const miss: number[] = [];
  for (let k = 0; k < n; k++) miss.push(span * Math.hypot(gauss(rng) * PI_DRIFT_2D, gauss(rng) * PI_DRIFT_2D));
  miss.sort((a, b) => a - b);
  return miss[(n - 1) / 2]!;
}

test("law 0 is today's: the odometer, whatever the reach", () => {
  for (const odo of [0, 3, 41.5, 400, 1234.25]) {
    assert.equal(piSpanOf(0, AT, odo, 0), odo);
    assert.equal(piSpanOf(0, AT, odo, 77), odo);
    assert.equal(piSpanOf(0, 500, odo, 1e4), odo);
  }
});

test("law 1: the median miss is 25 % at piErrorAt out and 12.5 % at four times as far (Merkle et al. 2006's shape)", () => {
  for (const [out, share] of [
    [25, 0.354],
    [50, 0.25],
    [100, 0.177],
    [200, 0.125],
  ] as const) {
    const m = medianMiss(out);
    assert.ok(
      Math.abs(m / out - share) < 0.01,
      `${out} out: median miss ${m.toFixed(2)} = ${((100 * m) / out).toFixed(1)} %, want ${100 * share} %`,
    );
    assert.ok(Math.abs(m - PI_MISS_AT * Math.sqrt(AT * out)) < 0.02 * m, `${out} out: PI_MISS_AT × √(at × out)`);
  }
});

test("law 1 grows like the square root of the distance out, and ignores the path walked", () => {
  assert.equal(piSpanOf(1, AT, 0, 0), 0, "at the hole: no error");
  assert.ok(Math.abs(piSpanOf(1, AT, 0, 200) - 2 * piSpanOf(1, AT, 0, 50)) < 1e-9, "four times as far, twice the error");
  assert.ok(Math.abs(piSpanOf(1, AT, 0, 50) - PI_SPAN_GAIN * 50) < 1e-9, "at piErrorAt the span is PI_SPAN_GAIN × piErrorAt");
  assert.equal(piSpanOf(1, AT, 10, 60), piSpanOf(1, AT, 900, 60), "a winding path (odometer 900) costs nothing more");
  assert.ok(Math.abs(piSpanOf(1, 4 * AT, 0, 50) - 2 * piSpanOf(1, AT, 0, 50)) < 1e-9, "piErrorAt scales it the same way");
});

test("piSpan reads the colony's law, its scale and the ant's own odometer and reach", () => {
  const c = {
    params: { piErrorLaw: 0, piErrorAt: AT },
    odoSurf: new Float32Array([120, 30]),
    reachSurf: new Float32Array([40, 25]),
  } as unknown as Colony;
  assert.equal(piSpan(c, 0), 120);
  c.params.piErrorLaw = 1;
  assert.equal(piSpan(c, 0), piSpanOf(1, AT, 120, 40));
  assert.equal(piSpan(c, 1), piSpanOf(1, AT, 30, 25));
  c.params.piErrorAt = 200;
  assert.equal(piSpan(c, 1), piSpanOf(1, 200, 30, 25));
});
