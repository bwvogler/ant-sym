import { test } from "node:test";
import assert from "node:assert/strict";
import { CHUNK } from "../../colony/index.ts";
import { formAt, FORMS, MAX_REACH, myceliumReach, threads, trailSight, TRAIL_FLOOR, type Threads } from "../fungusSight.ts";

// What the field shows of the fungus (ja-vyu): trails by how far the fungus is into a colony, and its mycelium's threads.

test("a colony's trails show only once the fungus is in it, more strongly as more of it is", () => {
  assert.equal(trailSight(0, 200), 0);
  assert.equal(trailSight(3, 0), 0);
  assert.equal(trailSight(1, 1000), TRAIL_FLOOR + (1 - TRAIL_FLOOR) * 0.001);
  assert.ok(trailSight(20, 200) < trailSight(100, 200));
  assert.equal(trailSight(200, 200), 1);
});

test("the mycelium reaches further as its mass on each patch grows, up to a limit", () => {
  assert.equal(myceliumReach(0, 1), 0);
  assert.equal(myceliumReach(10, 0), 0);
  assert.ok(myceliumReach(4, 1) > 0);
  assert.ok(myceliumReach(4, 1) < myceliumReach(30, 1));
  assert.ok(myceliumReach(30, 1) < myceliumReach(120, 1));
  assert.equal(myceliumReach(120, 2), myceliumReach(60, 1));
  assert.equal(myceliumReach(1e9, 1), MAX_REACH);
});

/** The threads' cells as "x,y" → strength. */
function cells(t: Threads): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, a] of t) {
    const [cx, cy] = key.split(",").map(Number) as [number, number];
    a.forEach((s, i) => {
      if (s > 0) out.set(`${cx * CHUNK + (i % CHUNK)},${cy * CHUNK + Math.floor(i / CHUNK)}`, s);
    });
  }
  return out;
}

const open = () => false;

test("threads grow down into the ground from the surface, and stop where they can't go", () => {
  const surface = 40;
  const t = cells(threads([10, surface, 11, surface], 20, true, (_x, y) => y < surface, FORMS[2]));
  assert.ok(t.size > 20, `${t.size} cells`);
  for (const key of t.keys()) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    assert.ok(y >= surface, `above the ground at ${key}`);
    assert.ok(y <= surface + 21, `deeper than its reach at ${key}`);
    assert.ok(Math.abs(x - 10) <= 22, `too far aside at ${key}`);
  }
  assert.ok(
    [...t.keys()].some((k) => Number(k.split(",")[1]) > surface + 10),
    "reaches well down",
  );
  // A floor of rock: nothing past it.
  const floored = cells(threads([10, surface], 30, true, (_x, y) => y < surface || y > surface + 5));
  assert.ok([...floored.keys()].every((k) => Number(k.split(",")[1]) <= surface + 5));
});

test("a longer reach extends the same threads rather than reshuffling them", () => {
  const short = cells(threads([100, 100], 8, false, open, FORMS[1]));
  const long = cells(threads([100, 100], 16, false, open, FORMS[1]));
  for (const k of short.keys()) assert.ok(long.has(k), `${k} dropped as it grew`);
  assert.ok(long.size > short.size);
});

test("threads are strongest near the patch and work on negative columns (one world's curtain)", () => {
  const t = cells(threads([-3, 40], 12, true, open));
  assert.ok(t.size > 0);
  assert.ok([...t.keys()].every((k) => Number(k.split(",")[0]) < 20));
  for (const s of t.values()) assert.ok(s >= 0.4 * 0.8 - 1e-6 && s <= 1);
  assert.equal(threads([1, 1], 0, false, open).size, 0);
});

test("a thread is thin and stays underground; the mat fills out and shows above; the web is the most", () => {
  assert.equal(formAt(0).above, false);
  assert.equal(formAt(0).fill, false);
  assert.ok(formAt(1).above && formAt(1).fill);
  assert.equal(formAt(9), FORMS[FORMS.length - 1]);
  assert.equal(formAt(-1), FORMS[0]);
  const at = (level: number) => cells(threads([50, 40], 25, true, (_x, y) => y < 40, formAt(level))).size;
  assert.ok(at(0) < at(1) && at(1) < at(2), `${at(0)} ${at(1)} ${at(2)}`);
  // Thin: about one cell per step of each trunk, plus a branch or two.
  assert.ok(at(0) <= FORMS[0]!.trunks * 25 * 1.6, `${at(0)} cells`);
});
