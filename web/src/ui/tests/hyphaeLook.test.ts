import { test } from "node:test";
import assert from "node:assert/strict";
import { chainsOf, hash, MAX_WANDER, noise, smoothThrough, twigsOf, wander, type PathLike } from "../hyphaeLook.ts";

/** A path that writes down what it was asked to draw. */
function recorder() {
  const calls: { op: string; args: number[] }[] = [];
  const path: PathLike = {
    moveTo: (...args) => void calls.push({ op: "moveTo", args }),
    lineTo: (...args) => void calls.push({ op: "lineTo", args }),
    bezierCurveTo: (...args) => void calls.push({ op: "bezierCurveTo", args }),
    quadraticCurveTo: (...args) => void calls.push({ op: "quadraticCurveTo", args }),
  };
  return { path, calls };
}

test("hash and noise are the same every time, and stay in range", () => {
  assert.equal(hash(12, 34, 5), hash(12, 34, 5));
  assert.notEqual(hash(12, 34, 5), hash(12, 35, 5));
  for (let i = 0; i < 500; i++) {
    const h = hash(i, i * 7, 3);
    assert.ok(h >= 0 && h < 1, `hash ${h}`);
    const n = noise(i * 0.37, i * 0.91, 2);
    assert.ok(n >= -1 && n <= 1, `noise ${n}`);
  }
});

test("wander: a point is bent the same way every time, by no more than MAX_WANDER, and a near point is bent alike", () => {
  const a = [0, 0];
  const b = [0, 0];
  let moved = 0;
  for (let i = 0; i < 400; i++) {
    const x = i * 0.73;
    const y = i * 0.41;
    wander(x, y, a);
    wander(x, y, b);
    assert.deepEqual(a, b, "the same place, the same bend");
    const d = Math.hypot(a[0]! - x, a[1]! - y);
    assert.ok(d <= MAX_WANDER + 1e-9, `moved ${d}`);
    moved += d;
  }
  assert.ok(moved / 400 > 0.1, "it does bend things: on average by more than a tenth of a cell");
  // Smooth: points a hundredth of a cell apart bend by nearly the same amount (a path through them stays whole).
  wander(5.2, 7.7, a);
  wander(5.21, 7.7, b);
  assert.ok(Math.hypot(a[0]! - 5.2 - (b[0]! - 5.21), a[1]! - 7.7 - (b[1]! - 7.7)) < 0.05);
});

test("smoothThrough passes through every point and starts at the first", () => {
  const pts = [0, 0, 10, 5, 20, -3, 31, 8];
  const { path, calls } = recorder();
  smoothThrough(path, pts);
  assert.deepEqual(calls[0], { op: "moveTo", args: [0, 0] });
  const ends = calls.filter((c) => c.op === "bezierCurveTo").map((c) => c.args.slice(4));
  assert.deepEqual(ends, [
    [10, 5],
    [20, -3],
    [31, 8],
  ]);
  const one = recorder();
  smoothThrough(one.path, [1, 2]);
  assert.equal(one.calls.length, 0, "a lone point draws nothing");
});

test("chainsOf: runs between branch points, cut where the cord status changes", () => {
  const NONE = -1;
  // 0 (root) -> 1 -> 2 -> 3, then 3 branches to 4 -> 5 and to 6; 6 -> 7 is a cord, 7 -> 8 too.
  const parent = new Map<number, number>([
    [0, NONE],
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 4],
    [6, 3],
    [7, 6],
    [8, 7],
  ]);
  const chains = chainsOf(parent, new Set([7, 8]), NONE);
  const key = (c: { cells: number[]; cord: boolean }) => `${c.cord ? "cord" : "thin"}:${c.cells.join(">")}`;
  assert.deepEqual(chains.map(key).sort(), ["cord:6>7>8", "thin:0>1>2>3", "thin:3>4>5", "thin:3>6"].sort());
  // Every edge of the tree is in exactly one chain.
  const edges = chains.flatMap((c) => c.cells.slice(1).map((k, i) => `${c.cells[i]}>${k}`));
  assert.equal(new Set(edges).size, edges.length);
  assert.equal(edges.length, 8);
  assert.deepEqual(chainsOf(new Map([[0, NONE]]), new Set(), NONE), [], "a lone root has no hypha");
});

test("twigsOf: the same twigs for a cell every time, up to one off each side, and not for every cell", () => {
  let some = 0;
  let both = 0;
  for (let key = 0; key < 600; key++) {
    const one = recorder();
    const two = recorder();
    twigsOf(one.path, key, 100, 100, 0.4, 30);
    twigsOf(two.path, key, 100, 100, 0.4, 30);
    assert.deepEqual(one.calls, two.calls, "fixed by the key");
    const quads = one.calls.filter((c) => c.op === "quadraticCurveTo").length;
    assert.ok(quads <= 2);
    if (quads >= 1) some++;
    if (quads === 2) both++;
  }
  assert.ok(some > 100 && some < 500, `${some} of 600 cells have a twig`);
  assert.ok(both > 0, "some have one off each side");
  const none = recorder();
  twigsOf(none.path, 5, 0, 0, 0, 30, 0);
  assert.equal(none.calls.length, 0, "density 0: no twigs");
});
