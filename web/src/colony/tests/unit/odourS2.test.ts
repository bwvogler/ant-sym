import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony.ts";
import { FUNGAL, Recognition, STRANGER_EPS, bandDistance, driftAimVec, driftDirection, odourSalt } from "../../recognition.ts";
import { TOLERANCE } from "../../vocab.ts";
import { mulberry32, worldFromArrays } from "../../world.ts";

// The odour weapon, the daughters' drift and the wild salts at K = 4 (S2 of the odour space, ja-zg1u.4, PRD §91). The own-nest invariant is odourSpace.test.ts.

const oneColony = (odour: number | number[], K: number, estrange: number) => {
  const map = worldFromArrays({ w: 64, h: 48 }, [{ x: 6, y: 24, r: 2 }]);
  const c = new Colony(map, { antCount: 2, maxAnts: 2, nest: 0, odour, odourAxes: K }, mulberry32(1));
  c.estrange[0] = estrange;
  new Recognition({ odourAxes: K }).advance([c], 1);
  return c;
};

test("the odour weapon pushes 0.5 along the line from the nest through the fungal point at K = 4 (radial), and each axis as before at K = 1", () => {
  const n = [0.3, 0.45, 0.6, 0.5];
  const c = oneColony(n, 4, 1);
  const o = Array.from(c.odour.subarray(0, 4));
  const d = o.map((x, k) => x - Math.fround(n[k] as number));
  assert.ok(Math.abs(Math.hypot(...d) - 0.5) < 1e-5, `pushed ${Math.hypot(...d)}`);
  const toward = n.map((x) => FUNGAL - x);
  const len = Math.hypot(...toward);
  for (let k = 0; k < 4; k++) assert.ok(Math.abs((d[k] as number) - (0.5 * (toward[k] as number)) / len) < 1e-5, `axis ${k}`);
  // One axis: 0.2 pushed 0.5 toward the far side, as the scalar code did.
  assert.ok(Math.abs((oneColony(0.2, 1, 1).odour[0] as number) - 0.7) < 1e-6);
  assert.ok(Math.abs((oneColony(0.8, 1, 1).odour[0] as number) - 0.3) < 1e-6);
});

test("the odour weapon still makes a host a stranger to its own nest from a corner at K = 4, band rounding counted", () => {
  const c = oneColony(0, 4, 1);
  assert.ok(bandDistance(c.odour, 0, c.nestVec, 0, 4) > TOLERANCE + STRANGER_EPS);
});

test("driftDirection is a pure unit vector of the seed and the site; driftAimVec sits 1.5 tolerances from the mother, inside the cube", () => {
  const u = driftDirection(5, 120, 340, 4);
  assert.ok(Math.abs(Math.hypot(...u) - 1) < 1e-12);
  assert.deepEqual([...u], [...driftDirection(5, 120, 340, 4)]);
  assert.notDeepEqual([...u], [...driftDirection(5, 121, 340, 4)]);
  assert.notDeepEqual([...u], [...driftDirection(6, 120, 340, 4)]);
  for (const mother of [
    [0.5, 0.5, 0.5, 0.5],
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0.1, 0.9, 0.5, 0.3],
  ]) {
    for (let s = 0; s < 50; s++) {
      const aim = driftAimVec(mother, TOLERANCE, driftDirection(3, s * 17, s * 29, 4));
      for (const x of aim) assert.ok(x >= 0 && x <= 1);
      const d = Math.hypot(...Array.from(aim, (x, k) => x - (mother[k] as number)));
      assert.ok(d <= 1.5 * TOLERANCE + 1e-9 && d > TOLERANCE + 0.05, `drift ${d} from ${mother}`); // a stranger once it arrives
    }
  }
  assert.deepEqual([...driftAimVec([0.2], TOLERANCE)], [0.2 + 1.5 * TOLERANCE], "one axis: toward the middle as it was");
});

test("a wild site's axes 1 and up use salts of their own, none of them another hash's (axis 1 was wakeSite's rng stream, 102)", () => {
  assert.equal(odourSalt(0), 101);
  const salts = [1, 2, 3, 4, 5, 6, 7].map(odourSalt);
  assert.ok(!salts.includes(102));
  assert.equal(new Set(salts).size, salts.length);
  // every other salt in colony/ is below 200 (read when this block was chosen); the drift direction's are 301 and up
  assert.ok(Math.min(...salts) >= 200 && Math.max(...salts) < 301);
});
