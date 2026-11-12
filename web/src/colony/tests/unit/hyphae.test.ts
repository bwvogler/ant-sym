import { test } from "node:test";
import assert from "node:assert/strict";
import { E, NE, SE, W } from "../../hex.ts";
import { cellKey, growthUnit, Hyphae, keyCell, opposite, ROOT, selfHitShare, tipsAt, withinBudget } from "../../hyphae.ts";

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

// The behaviour assays: targets from docs/hyphal-growth.md, run once the tips step on the local rule (ja-2bw.2).
test("H1 growth unit: length ÷ tips settles within ±20 % of HGU past 20 tips, in open soil", {
  todo: "ja-2bw.2: tips step on the local rule",
});
test("H2 slide and split: rock head-on leaves two tips going opposite ways; at a glance, one tip along it", {
  todo: "ja-2bw.2: tips step on the local rule",
});
test("H3 autotropism: under 5 % of tip steps run into the mycelium's own cells", { todo: "ja-2bw.2: tips step on the local rule" });
test("H4 supply: hypha × HYPHA_MASS never exceeds the mass grown; with supply short no tip extends", {
  todo: "ja-2bw.2: hyphae paid out of the mycelium's mass",
});
