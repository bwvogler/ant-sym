import { test } from "node:test";
import assert from "node:assert/strict";
import { BINS, FUNGAL, MAX_MASK, STRANGER_EPS, binCentre, binOf } from "../../recognition.ts";
import { TOLERANCE } from "../../vocab.ts";
import { mulberry32 } from "../../world.ts";

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

for (const K of [2, 3, 4]) {
  test(
    `O2 a host is never a stranger to its own nest at K = ${K}, MAX_MASK x 0.5 = 0.3 plus 0.05 of band slack`,
    {
      todo: `ja-zg1u.4: the scalar proof does not extend to a vector (a corner nest sits sqrt(${K}) x 0.5 from the fungus's odour); S2 caps the host's displacement in the space`,
    },
    () => {
      const w = worstPerceived(K, scalarRule);
      assert.ok(w.d <= TOLERANCE + STRANGER_EPS, `worst ${w.d.toFixed(4)} at nest ${w.nest.map((x) => x.toFixed(2))} share ${w.share}`);
    },
  );
}

for (const K of [2, 3, 4]) {
  test(
    `O2 with the host's displacement capped at 0.3 in the space (the plan's S2 rule), band centres at K = ${K}`,
    {
      todo: "ja-zg1u.4: the cap alone leaves up to sqrt(K) x 0.05 of band rounding on top of 0.3; the cap or the band width must leave that room",
    },
    () => {
      const capped = (n: number[], f: number) => {
        const g = n.map((x) => f * (FUNGAL - x));
        const len = Math.hypot(...g);
        const s = len > 0.3 ? 0.3 / len : 1;
        return n.map((x, k) => x + (g[k] as number) * s);
      };
      const w = worstPerceived(K, capped);
      assert.ok(w.d <= TOLERANCE + STRANGER_EPS, `worst ${w.d.toFixed(4)} at nest ${w.nest.map((x) => x.toFixed(2))} share ${w.share}`);
    },
  );
}
