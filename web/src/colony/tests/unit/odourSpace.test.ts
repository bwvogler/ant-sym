import { test } from "node:test";
import assert from "node:assert/strict";
import { BINS, FUNGAL, MAX_MASK, Recognition, STRANGER_EPS, bandDistance, binCentre, binOf, hostCap } from "../../recognition.ts";
import { Colony } from "../../colony.ts";
import { TOLERANCE } from "../../vocab.ts";
import { mulberry32, worldFromArrays } from "../../world.ts";

// O2 of the odour-space assays (ja-zg1u.2, PRD §91, docs/odour-space.md): "a host is never a stranger to its own nest" at K = 1..4 axes and every fungal
// share 0..MAX_MASK. Measurement only: this models the rule (nest odour n, the fungus's odour F at the centre, host odour n + f (F - n), judged as an ant
// judges it: the host's band centre on each axis, in float32, against the healthy nestmate's own odour n, symmetric Euclidean distance against
// TOLERANCE + STRANGER_EPS) and reads no game code that would change. K = 1 is today's game and is guarded; K >= 2 fails with the scalar proof
// (MAX_MASK x 0.5 = 0.3, plus 0.05 of band slack, = the tolerance), which does not extend to a vector, and runs as a todo naming the fixing bead (ja-zg1u.4).

const f32 = Math.fround;

/** The most any host can look from its own nest, over sampled nests (the cube's corners and random points) and shares 0..MAX_MASK. */
function worstPerceived(K: number, displace: (n: number[], f: number) => number[]): { d: number; nest: number[]; share: number } {
  const rand = mulberry32(2026 + K);
  const nests: number[][] = [];
  for (let m = 0; m < 1 << K; m++) nests.push(Array.from({ length: K }, (_, k) => (m >> k) & 1)); // corners: the furthest from the centre
  for (let t = 0; t < 4000; t++) nests.push(Array.from({ length: K }, () => rand()));
  let worst = { d: 0, nest: nests[0] as number[], share: 0 };
  for (const n of nests) {
    const nf = n.map(f32);
    for (let s = 0; s <= 24; s++) {
      const share = (MAX_MASK * s) / 24;
      const host = displace(n, share);
      let sum = 0;
      for (let k = 0; k < K; k++) sum += (f32(binCentre(binOf(f32(host[k] as number)))) - (nf[k] as number)) ** 2;
      const d = Math.sqrt(sum);
      if (d > worst.d) worst = { d, nest: n, share };
    }
  }
  return worst;
}

/** The scalar rule's host, per axis: the nest's odour, its share of the way to the fungus's own. */
const scalarRule = (n: number[], f: number) => n.map((x) => x + f * (FUNGAL - x));

test("O2 a host is never a stranger to its own nest at K = 1 (today's game), by band centre in float32", () => {
  const w = worstPerceived(1, scalarRule);
  assert.ok(w.d <= TOLERANCE + STRANGER_EPS, `worst ${w.d} at nest ${w.nest} share ${w.share}`);
  assert.ok(w.d > TOLERANCE - 0.06, `the bound is tight, not slack: worst ${w.d}`); // a mutation guard: the model must reach the edge
  assert.equal(BINS, 10);
});

/** The rule Recognition.advance applies (S2): the share of the way to the fungus, the displacement from the nest capped at hostCap(K) in the space. */
const gameRule = (n: number[], f: number) => {
  const K = n.length;
  const dist = Math.hypot(...n.map((x) => FUNGAL - x));
  const shift = K > 1 && f * dist > hostCap(K) ? hostCap(K) / dist : f;
  return n.map((x) => x + shift * (FUNGAL - x));
};

for (const K of [1, 2, 3, 4]) {
  test(`O2 a host is never a stranger to its own nest at K = ${K}: the game's rule, displacement capped at hostCap in the space, band centres in float32`, () => {
    const w = worstPerceived(K, gameRule);
    assert.ok(w.d <= TOLERANCE + STRANGER_EPS, `worst ${w.d.toFixed(4)} at nest ${w.nest.map((x) => x.toFixed(2))} share ${w.share}`);
    assert.ok(w.d > TOLERANCE - 0.12, `the bound is reached, not slack: worst ${w.d}`); // a mutation guard: the model must get near the edge
  });
}

test("the cap is the tolerance less the bands' rounding: 0.3 at K = 1 (never binds), 0.25 at K = 4", () => {
  assert.equal(hostCap(1), 0.3);
  assert.ok(Math.abs(hostCap(4) - 0.25) < 1e-12);
  assert.ok(MAX_MASK * 0.5 <= hostCap(1) + 1e-12, "at one axis the share alone is within it");
});

for (const K of [2, 3, 4]) {
  test(`O2 without the cap (the scalar rule) a host is a stranger to its own nest at K = ${K}: the guard is not vacuous`, () => {
    const w = worstPerceived(K, scalarRule);
    assert.ok(w.d > TOLERANCE + STRANGER_EPS, `worst ${w.d.toFixed(4)}`);
  });
}

test("O2 through the game's own step: Recognition.advance at K = 4, a corner nest, every mask share, leaves each host within its nest's tolerance", () => {
  const map = worldFromArrays({ w: 64, h: 48 }, [{ x: 6, y: 24, r: 2 }]);
  const K = 4;
  for (const corner of [0, 5, 15]) {
    const odour = Array.from({ length: K }, (_, k) => (corner >> k) & 1);
    const c = new Colony(map, { antCount: 7, maxAnts: 7, nest: 0, odour, odourAxes: K }, mulberry32(1));
    for (let i = 0; i < 7; i++) c.mask[i] = (MAX_MASK * i) / 6;
    const rec = new Recognition({ odourAxes: K });
    rec.advance([c], 1);
    for (let i = 0; i < 7; i++) {
      const d = bandDistance(c.odour, i * K, c.nestVec, 0, K);
      assert.ok(d <= TOLERANCE + STRANGER_EPS, `corner ${corner} ant ${i}: ${d}`);
    }
  }
});
