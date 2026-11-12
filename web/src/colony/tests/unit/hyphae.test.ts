import { test } from "node:test";
import assert from "node:assert/strict";
import { E, NE, SE, W } from "../../hex.ts";
import type { Ground } from "../../hyphae.ts";
import {
  cellKey,
  growthUnit,
  AMPLE_STEPS,
  HGU,
  HYPHA_MASS,
  Hyphae,
  isWall,
  keyCell,
  opposite,
  ROOT,
  selfHitShare,
  stepTips,
  tipsAt,
  withinBudget,
} from "../../hyphae.ts";

// The hyphae's assays (docs/hyphal-growth.md "Assays and targets", PRD §61, ja-2bw.1). The measures are tested here on
// hand-built mycelia; the behaviour assays, which need the tips' local rule, run as todo until ja-2bw.2 lands it.

test("a cell key round-trips, negative columns too (one world's curtain)", () => {
  for (const [x, y] of [
    [0, 0],
    [-40, 41],
    [517, 300],
  ] as const)
    assert.deepEqual(keyCell(cellKey(x, y)), [x, y]);
});

test("a hypha is a chain of cells, each grown from its parent, and costs its price a cell", () => {
  const h = new Hyphae();
  h.root(10, 50, E);
  const tip = h.tips[0]!;
  assert.ok(h.extend(tip, E, 0.5));
  assert.ok(h.extend(tip, SE, 0.5));
  assert.equal(h.length, 3);
  assert.equal(h.parent.get(cellKey(10, 50)), ROOT);
  assert.equal(h.parent.get(cellKey(11, 50)), cellKey(10, 50));
  assert.equal(h.parent.get(cellKey(tip.x, tip.y)), cellKey(11, 50));
  assert.equal(tip.heading, SE);
  assert.equal(tip.first, E);
  assert.equal(tip.run, 2);
  assert.equal(h.spent, 1);
});

test("H1's measure: the growth unit is length over tips", () => {
  const h = new Hyphae();
  assert.equal(growthUnit(h), 0);
  h.root(0, 10, E);
  const a = h.tips[0]!;
  for (let k = 0; k < 5; k++) h.extend(a, E, 1);
  const b = h.branch(a, SE);
  assert.equal(a.run, 0, "branching starts the parent's run again");
  for (let k = 0; k < 3; k++) h.extend(b, SE, 1);
  assert.equal(h.length, 9);
  assert.equal(growthUnit(h), 9 / 2);
});

test("H3's measure: a step into the mycelium's own cell grows nothing and counts as a self-hit", () => {
  const h = new Hyphae();
  h.root(5, 10, E);
  const t = h.tips[0]!;
  h.extend(t, E, 1);
  assert.equal(h.extend(t, W, 1), false);
  assert.equal(h.length, 2);
  assert.equal(h.spent, 1);
  assert.equal(selfHitShare(h), 1 / 2);
});

test("H4's measure: the hypha grown must not cost more than the mass grown", () => {
  const h = new Hyphae();
  h.root(0, 0, E);
  const t = h.tips[0]!;
  for (let k = 0; k < 4; k++) h.extend(t, E, 0.25);
  assert.ok(withinBudget(h, 1));
  assert.ok(!withinBudget(h, 0.99));
});

test("H2's reading: the tips on a cell, and opposite headings", () => {
  const h = new Hyphae();
  h.root(3, 3, NE);
  h.branch(h.tips[0]!, SE);
  assert.deepEqual(tipsAt(h, 3, 3), [NE, SE]);
  assert.ok(opposite(E, W) && opposite(NE, SE + 1) && !opposite(E, SE));
});

// The behaviour assays: targets from docs/hyphal-growth.md "Assays and targets", on the local rule.

/** Open topsoil everywhere but `rock(x, y)` (a top view's ground). */
const plane = (rock: (x: number, y: number) => boolean = () => false): Ground => ({
  topsoil: true,
  kind: (x, y) => (rock(x, y) ? "rock" : "open"),
});

/** Rounds of tip steps with plenty of mass; returns the budget left. */
function run(h: Hyphae, g: Ground, rounds: number, free = 1e9, level = 0): { free: number; tips: number } {
  const budget = { free, tips: h.tips.length };
  for (let r = 0; r < rounds; r++) stepTips(h, g, level, budget);
  return budget;
}

test("H1 growth unit: length ÷ tips settles within ±20 % of HGU past 20 tips, in open soil", () => {
  const h = new Hyphae();
  h.root(0, 0, E);
  const seen: number[] = [];
  for (let r = 0; r < 80 && h.tips.length < 200; r++) {
    run(h, plane(), 1);
    if (h.tips.length > 20) seen.push(growthUnit(h));
  }
  assert.ok(seen.length > 5, `only ${seen.length} rounds past 20 tips`);
  // It oscillates early, then settles (Trinci 1974): the last rounds are what count.
  for (const gu of seen.slice(-8)) assert.ok(Math.abs(gu - HGU) <= 0.2 * HGU, `growth unit ${gu.toFixed(2)} against HGU ${HGU}`);
});

test("H2 slide and split: rock head-on leaves tips on both sides of the tip's line; at a glance, one tip slides along it", () => {
  // A flat wall at x ≥ 10, met head on by a tip heading east.
  const wall = new Hyphae();
  wall.root(5, 20, E);
  run(
    wall,
    plane((x) => x >= 10),
    12,
  );
  assert.ok(wall.tips.length >= 2, `${wall.tips.length} tips after the wall`);
  const ys = wall.tips.map((t) => t.y);
  assert.ok(Math.min(...ys) < 20 && Math.max(...ys) > 20, `tips at rows ${ys.join(", ")}: not split both ways`);
  for (const t of wall.tips) assert.ok(t.x < 10);
  // A wall along a diagonal, met at a glance (the tip heads east; rock where x ≥ y + 10): one tip, no split, still moving.
  const glance = new Hyphae();
  glance.root(0, 0, E);
  const g = plane((x, y) => x >= y + 10);
  run(glance, g, 6);
  const before = glance.length;
  run(glance, g, 4);
  assert.ok(glance.length > before, "stuck at the wall");
  assert.ok(glance.tips.every((t) => g.kind(t.x, t.y) !== "rock"));
});

test("H3 autotropism: under 5 % of tip steps run into the mycelium's own cells", () => {
  const h = new Hyphae();
  h.root(0, 0, E);
  h.root(0, 0, W);
  for (let r = 0; r < 60 && h.tips.length < 300; r++) run(h, plane(), 1);
  assert.ok(h.steps > 200, `${h.steps} steps`);
  assert.ok(selfHitShare(h) < 0.05, `self-hits ${(100 * selfHitShare(h)).toFixed(1)} %`);
});

test("H4 supply: the hypha never costs more than the mass it was given; short of it, no tip extends", () => {
  const h = new Hyphae();
  h.root(0, 0, E);
  const mass = 3;
  const left = run(h, plane(), 100, mass);
  assert.ok(withinBudget(h, mass));
  // Tips rest once the free mass would not pay AMPLE_STEPS rounds of them all: a small reserve stays.
  assert.ok(left.free >= 0 && left.free < HYPHA_MASS * AMPLE_STEPS * h.tips.length, `${left.free} left`);
  const length = h.length;
  run(h, plane(), 10, HYPHA_MASS * 0.5);
  assert.equal(h.length, length, "grew with less than a cell's mass");
});

test("in the curtain a thread keeps to dug walls; a borer pushes into undug soil", () => {
  // Soil below row 10, a dug shaft at column 0; a tip on the shaft's wall heading down and away from it.
  const curtain: Ground = { topsoil: false, kind: (x, y) => (y < 10 ? "rock" : x === 0 ? "open" : "soil") };
  const thread = new Hyphae();
  thread.root(1, 12, SE);
  run(thread, curtain, 20, 1e9, 0);
  for (const k of thread.parent.keys()) {
    const [x, y] = keyCell(k);
    assert.ok(curtain.kind(x, y) === "open" || isWall(curtain, x, y), `a thread grew into undug soil at ${x},${y}`);
  }
  const borer = new Hyphae();
  borer.root(1, 12, SE);
  run(borer, curtain, 20, 1e9, 1);
  assert.ok(
    [...borer.parent.keys()].some((k) => keyCell(k)[0] >= 3),
    "a borer stayed by the wall",
  );
});

test("hyphae save and load as they were", () => {
  const h = new Hyphae();
  h.root(2, 2, E);
  run(h, plane(), 15);
  const back = Hyphae.load(JSON.parse(JSON.stringify(h.save())));
  assert.deepEqual(back.save(), h.save());
});

test("a tip that reaches a tunnel fruits there, ending as a spore spot; another close by slides along the wall instead", () => {
  // Soil, with a dug tunnel along column 5 (rows 10 on); tips in the soil heading east, toward it.
  const g: Ground = { topsoil: false, kind: (x, y) => (y < 10 ? "rock" : x === 5 ? "open" : "soil") };
  const h = new Hyphae();
  h.root(4, 12, E);
  stepTips(h, g, 1, { free: 1e9, tips: 1 });
  assert.equal(h.tips.length, 0, "the tip fruited and ended");
  assert.deepEqual(h.fruits.map(keyCell), [[5, 12]]);
  // A second tip a few rows down meets the same tunnel within FRUIT_GAP of the spot: no second spot.
  h.root(4, 16, E);
  stepTips(h, g, 1, { free: 1e9, tips: 1 });
  assert.equal(h.fruits.length, 1);
  assert.equal(h.tips.length, 1, "it kept growing (along the wall)");
});

test("fruit needs a dug cell: never under the plane's surface, nor buried in soil", () => {
  const plane: Ground = { topsoil: true, kind: () => "open" };
  const p = new Hyphae();
  p.root(0, 0, E);
  stepTips(p, plane, 1, { free: 1e9, tips: 1 }, () => "fruit");
  assert.equal(p.fruits.length, 0);
  assert.equal(p.tips.length, 1);
  const soil: Ground = { topsoil: false, kind: () => "soil" };
  const b = new Hyphae();
  b.root(0, 0, E);
  stepTips(b, soil, 1, { free: 1e9, tips: 1 }, () => "fruit");
  assert.equal(b.fruits.length, 0);
  assert.equal(b.tips.length, 1);
});
