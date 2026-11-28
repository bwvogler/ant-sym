import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony.ts";
import { spawnHome } from "../../body.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import {
  BINS,
  Recognition,
  STRANGER_EPS,
  SumGrid,
  bandDistance,
  bandKey,
  binCentre,
  binOf,
  driftAimVec,
  keyDistance,
  odourDistance,
  odourVector,
} from "../../recognition.ts";
import { TOLERANCE } from "../../vocab.ts";
import { mulberry32, worldFromArrays } from "../../world.ts";

// S1 of the odour space (ja-zg1u.3, docs/odour-space.md): odour is a K-vector, and one axis is today's scalar bit for bit. These hold the distance,
// the band keys, the stride of the per-ant array, and the sparse bands against a copy of the scalar code they replaced.

const map = worldFromArrays({ w: 64, h: 48 }, [
  { x: 6, y: 24, r: 2 },
  { x: 58, y: 24, r: 2 },
]);

test("odourDistance on one axis is Math.abs(a - b) to the bit, with no square root", () => {
  const rand = mulberry32(5);
  const a = new Float32Array(1);
  const b = new Float64Array(1);
  for (let t = 0; t < 5000; t++) {
    a[0] = rand();
    b[0] = rand();
    assert.ok(Object.is(odourDistance(1, a, 0, b, 0), Math.abs(a[0] - b[0])), `pair ${t}`);
  }
  // offsets are into the arrays, not axes
  assert.equal(odourDistance(1, [9, 0.25], 1, [0.75, 9], 0), 0.5);
});

test("odourDistance on four axes is the Euclidean distance, symmetric, and weights scale each axis's square", () => {
  assert.equal(odourDistance(4, [0, 0, 0, 0], 0, [0.3, 0.4, 0, 0], 0), 0.5);
  assert.equal(odourDistance(4, [1, 1, 1, 1], 0, [0, 0, 0, 0], 0), 2);
  const a = [0.1, 0.9, 0.4, 0.2];
  const b = [0.7, 0.3, 0.4, 0.8];
  assert.equal(odourDistance(4, a, 0, b, 0), odourDistance(4, b, 0, a, 0));
  assert.equal(odourDistance(4, [9, 9, 0, 0, 0, 0], 2, [0, 0, 0, 0.5], 0), 0.5, "rows read at their offsets");
  assert.equal(
    odourDistance(4, [0, 0, 0, 0], 0, [0.3, 0.4, 0.9, 0.9], 0, [1, 1, 0, 0]),
    0.5,
    "a zero weight drops an axis (one-axis recognition, Martin 2008)",
  );
  assert.equal(odourDistance(4, [0, 0, 0, 0], 0, [0.3, 0, 0, 0], 0, [4, 1, 1, 1]), 0.6);
  assert.ok(Math.abs(odourDistance(1, [0], 0, [0.5], 0, [4]) - 1) < 1e-12, "weights act on one axis too");
});

test("a band's key is the sum of band x BINS^axis, and its distance is the distance to the band's centre vector", () => {
  assert.equal(bandKey([0.95], 0, 1), 9);
  assert.equal(bandKey([0.05, 0.15, 0.25, 0.35], 0, 4), 0 + 1 * 10 + 2 * 100 + 3 * 1000);
  assert.equal(bandKey([1, 1, 1, 1], 0, 4), 9999, "odour 1 is the last band");
  const rand = mulberry32(8);
  for (let t = 0; t < 500; t++) {
    const own = Float32Array.from({ length: 4 }, rand);
    const other = Float32Array.from({ length: 4 }, rand);
    const centre = Array.from(own, (x) => binCentre(binOf(x)));
    const key = bandKey(own, 0, 4);
    assert.ok(Object.is(keyDistance(key, 4, other, 0), odourDistance(4, centre, 0, other, 0)), `key ${key}`);
    assert.ok(Object.is(bandDistance(own, 0, other, 0, 4), odourDistance(4, centre, 0, other, 0)));
  }
  // one axis: the old scalar test, bit for bit
  for (let t = 0; t < 500; t++) {
    const o = rand();
    const x = Math.fround(rand());
    assert.ok(Object.is(keyDistance(binOf(o), 1, [x], 0), Math.abs(binCentre(binOf(o)) - x)));
  }
});

test("odourVector: a number is every axis, a list is one per axis and must be the game's length; a drift aim goes per axis", () => {
  assert.deepEqual([...odourVector(0.25, 3)], [0.25, 0.25, 0.25]);
  assert.deepEqual([...odourVector([0.1, 0.2], 2)], [0.1, 0.2]);
  assert.throws(() => odourVector([0.1, 0.2], 3), /axes/);
  assert.deepEqual([...driftAimVec([0.2, 0.8], 0.35)], [0.2 + 1.5 * 0.35, 0.8 - 1.5 * 0.35]);
});

test("four axes: an ant's odour is a row of the array, a newborn takes its nest's vector and leaves the others' rows alone", () => {
  const c = new Colony(map, { antCount: 5, maxAnts: 8, nest: 0, odour: [0.1, 0.3, 0.5, 0.7], odourAxes: 4 }, mulberry32(3));
  assert.equal(c.odour.length, 8 * 4);
  for (let i = 0; i < 8; i++) assert.deepEqual([...c.odour.subarray(i * 4, i * 4 + 4)], [0.1, 0.3, 0.5, 0.7].map(Math.fround), `ant ${i}`);
  assert.equal(c.nestOdour, 0.1, "the page's axis 0");
  assert.equal(c.odourAt(2, 3), Math.fround(0.7));
  // the nest's odour moves; an ant killed and its slot reborn takes it, no other row changes
  c.nestVec.set([0.9, 0.8, 0.2, 0.0]);
  const before = Float32Array.from(c.odour);
  c.alive[3] = 0;
  assert.ok(spawnHome(c, undefined, undefined, 0));
  assert.equal(c.alive[3], 1, "the lowest free slot, 3, was reborn");
  for (let i = 0; i < 8; i++) {
    const row = [...c.odour.subarray(i * 4, i * 4 + 4)];
    const want = i === 3 ? [0.9, 0.8, 0.2, 0.0].map(Math.fround) : [...before.subarray(i * 4, i * 4 + 4)];
    assert.deepEqual(row, want, `ant ${i}`);
  }
});

/** The scalar recognition as it was before the odour was a vector (ten bands, a 32-bit mask), kept here as the reference the sparse bands must equal. */
class ScalarBands {
  bins = Array.from({ length: BINS }, () => new SumGrid());
  mask = 0;
  occupied = 0;
  build(colonies: Colony[]): void {
    for (const g of this.bins) g.reset();
    this.occupied = 0;
    for (const c of colonies)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        cellOf(c.x[i], c.y[i]);
        const b = binOf(c.odour[i]);
        const w = 1 - c.calm[i];
        if (w <= 0) continue;
        this.bins[b]!.add(CELL[0], CELL[1], w);
        this.occupied |= 1 << b;
      }
  }
  look(odour: number, tolerance: number): void {
    let m = 0;
    for (let b = 0; b < BINS; b++) if (Math.abs(binCentre(b) - odour) > tolerance + STRANGER_EPS) m |= 1 << b;
    this.mask = m & this.occupied;
  }
  get(x: number, y: number): number {
    let s = 0;
    for (let b = 0, m = this.mask; m; b++, m >>= 1) if (m & 1) s += this.bins[b]!.get(x, y);
    return s;
  }
}

test("one axis: the sparse bands give the old per-band sums bit for bit, over random ants, calm and looks", () => {
  const rand = mulberry32(21);
  for (let trial = 0; trial < 6; trial++) {
    const cs = [0, 1].map((k) => new Colony(map, { antCount: 150, maxAnts: 150, nest: k, odour: k }, mulberry32(7 + k)));
    for (const c of cs)
      for (let i = 0; i < c.n; i++) {
        // ants crowded on few cells, odours across the range, a few calmed: many floats to add per cell
        c.x[i] = centreX(20 + Math.floor(rand() * 6), 20);
        c.y[i] = centreY(20 + Math.floor(rand() * 3));
        c.odour[i] = trial % 2 ? rand() : Math.floor(rand() * 4) / 3;
        c.calm[i] = rand() < 0.2 ? rand() : 0;
        if (rand() < 0.05) c.alive[i] = 0;
      }
    const ref = new ScalarBands();
    const rec = new Recognition();
    ref.build(cs);
    rec.build(cs);
    for (let q = 0; q < 40; q++) {
      const odour = Math.fround(rand());
      const tol = rand() < 0.5 ? TOLERANCE : rand() * 0.6;
      ref.look(odour, tol);
      rec.look([odour], 0, tol);
      for (let x = 19; x < 27; x++)
        for (let y = 19; y < 24; y++)
          assert.ok(Object.is(rec.get(x, y), ref.get(x, y)), `trial ${trial} look ${odour} ${tol} cell ${x},${y}`);
    }
    // saved and loaded, the bands read the same
    const again = new Recognition();
    again.loadBands(JSON.parse(JSON.stringify(rec.saveBands())));
    rec.look([0.2], 0, TOLERANCE);
    again.look([0.2], 0, TOLERANCE);
    for (let x = 19; x < 27; x++) assert.ok(Object.is(again.get(x, 20), rec.get(x, 20)));
  }
});

test("four axes: a band is a stranger when its centre is further than the tolerance by Euclid, and bands are kept only where ants are", () => {
  const mk = (k: number, odour: number[]) => new Colony(map, { antCount: 3, maxAnts: 3, nest: k, odour, odourAxes: 4 }, mulberry32(1 + k));
  const a = mk(0, [0.05, 0.05, 0.05, 0.05]);
  const near = mk(1, [0.15, 0.15, 0.15, 0.15]); // 0.2 from a's centre on the diagonal: kin
  const far = mk(0, [0.95, 0.95, 0.95, 0.95]); // far on every axis
  const side = mk(1, [0.05, 0.05, 0.05, 0.95]); // 0.9 on one axis only: still far
  for (const c of [a, near, far, side])
    for (let i = 0; i < c.n; i++) {
      c.x[i] = centreX(30, 20);
      c.y[i] = centreY(20);
    }
  const rec = new Recognition({ odourAxes: 4 });
  rec.build([a, near, far, side]);
  assert.equal(rec.bins.size, 4, "four bands held, not 10^4");
  rec.look(a.odour, 0, TOLERANCE);
  assert.equal(rec.get(30, 20), 6, "far (3) and side (3) are strangers to a; near (3) and a (3) are not");
  rec.look(far.odour, 0, TOLERANCE);
  assert.equal(rec.get(30, 20), 9, "to far, everyone else is");
  assert.throws(() => rec.build([new Colony(map, { antCount: 1, nest: 0 }, mulberry32(1))]), /odour axes/);
});

test("a recognition of another axis count refuses a save, and an axis count outside 1..MAX_AXES", () => {
  assert.throws(() => new Recognition({ odourAxes: 0 }), /odour axes/);
  assert.throws(() => new Recognition({ odourAxes: 9 }), /odour axes/);
  const one = new Recognition();
  const four = new Recognition({ odourAxes: 4 });
  assert.throws(() => one.loadState(four.saveState()), /odour axes/);
});

test("four axes: look() against a brute-force oracle, asymmetric odours, looks that differ only past axis 0 (the memo), every band centre", () => {
  const rand = mulberry32(77);
  const cs = [0, 1].map((k) => new Colony(map, { antCount: 120, maxAnts: 120, nest: k, odour: [0.5, 0.5, 0.5, 0.5], odourAxes: 4 }, mulberry32(3 + k)));
  const antCells: number[][] = [];
  for (const c of cs)
    for (let i = 0; i < c.n; i++) {
      const cx = 20 + Math.floor(rand() * 4);
      const cy = 20 + Math.floor(rand() * 2);
      c.x[i] = centreX(cx, cy);
      c.y[i] = centreY(cy);
      for (let k = 0; k < 4; k++) c.odour[i * 4 + k] = rand();
      c.calm[i] = rand() < 0.3 ? Math.floor(rand() * 4) / 4 : 0; // weights in quarters: sums are exact in any order
      antCells.push([cx, cy]);
    }
  const rec = new Recognition({ odourAxes: 4 });
  rec.build(cs);
  let checks = 0;
  const oracle = (look: number[], tol: number, x: number, y: number): number => {
    let s = 0;
    let at = 0;
    for (const c of cs)
      for (let i = 0; i < c.n; i++, at++) {
        if ((antCells[at] as number[])[0] !== x || (antCells[at] as number[])[1] !== y) continue;
        let d2 = 0;
        for (let k = 0; k < 4; k++) d2 += (binCentre(binOf(c.odour[i * 4 + k] as number)) - (look[k] as number)) ** 2;
        if (Math.sqrt(d2) > tol + STRANGER_EPS) s += 1 - (c.calm[i] as number);
      }
    return s;
  };
  for (let q = 0; q < 300; q++) {
    const a = Array.from({ length: 4 }, () => Math.fround(rand()));
    const tol = 0.2 + rand() * 0.8;
    // the next look keeps axis 0 and the tolerance, and changes the rest: a memo on axis 0 alone would answer it with the last mask
    const b = [a[0] as number, Math.fround(rand()), Math.fround(rand()), Math.fround(rand())];
    for (const look of [a, b, a]) {
      rec.look(look, 0, tol);
      for (let x = 20; x < 24; x++)
        for (let y = 20; y < 22; y++) {
          assert.ok(Math.abs(rec.get(x, y) - oracle(look, tol, x, y)) < 1e-9, `look ${look} tol ${tol} cell ${x},${y}`);
          checks++;
        }
    }
  }
  assert.ok(checks >= 7000);
});

test("four axes: a daughter's nest drifts on every axis toward its own aim, though axis 0 is already there", () => {
  const c = new Colony(map, { antCount: 10, maxAnts: 10, nest: 0, odour: [0.2, 0.2, 0.2, 0.2], odourAxes: 4 }, mulberry32(2));
  c.aimVec.set([0.2, 0.8, 0.9, 0.1]);
  const rec = new Recognition({ odourAxes: 4 });
  rec.step([c], 400);
  const n = c.nestVec;
  assert.ok(Math.abs((n[0] as number) - 0.2) < 1e-6, "axis 0 is at its aim");
  assert.ok((n[1] as number) > 0.5 && (n[1] as number) < 0.8, `axis 1 moved up, not past its aim: ${n[1]}`);
  assert.ok((n[2] as number) > 0.5 && (n[2] as number) < 0.9, `axis 2 moved up: ${n[2]}`);
  assert.ok((n[3] as number) < 0.2 && (n[3] as number) > 0.1, `axis 3 moved down: ${n[3]}`);
  for (let i = 0; i < 10; i++) assert.equal(c.odour[i * 4 + 1], Math.fround(n[1] as number), "its ants follow on the next odour step");
});

test("a NaN odour is band 0, never a NaN key", () => {
  assert.equal(binOf(NaN), 0);
  assert.equal(bandKey([NaN, 0.95], 0, 2), 90);
  assert.equal(binOf(-3), 0);
  assert.equal(binOf(7), BINS - 1);
});
