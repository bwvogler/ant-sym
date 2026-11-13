import { test } from "node:test";
import assert from "node:assert/strict";
import { E, NE, nx, ny, SE, W } from "../../hex.ts";
import { localGrowthChoice } from "../../growthBrain.ts";
import type { Ground } from "../../hyphae.ts";
import {
  cellKey,
  growthUnit,
  AMPLE_STEPS,
  BRANCH_RUN,
  CORD_DIGS,
  CORD_FLOW,
  ENTER_GAP,
  REGROW_ROUNDS,
  sideFor,
  FRUIT_RUN,
  REGRESS_PER_ROUND,
  HGU,
  HYPHA_MASS,
  Hyphae,
  isWall,
  keyCell,
  localGrowth,
  opposite,
  ROOT,
  selfHitShare,
  situationOf,
  stepTips,
  turn,
  tipsAt,
  withinBudget,
} from "../../hyphae.ts";

// The hyphae's assays (docs/hyphal-growth.md "Assays and targets", PRD §63, ja-2bw.1): the measures on hand-built
// mycelia, then the behaviour assays H1–H4 and the local rule's other parts.

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
  assert.ok(left.free > 0 && left.free < HYPHA_MASS * AMPLE_STEPS * h.tips.length, `${left.free} left: no reserve kept`);
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

test("a tip that reaches a tunnel leaves a spore spot there and grows on; another close by leaves none (ja-2bw.15)", () => {
  // Soil, with a dug tunnel along column 5 (rows 10 on); tips in the soil heading east, toward it.
  const g: Ground = { topsoil: false, kind: (x, y) => (y < 10 ? "rock" : x === 5 ? "open" : "soil") };
  const h = new Hyphae();
  // Two cells to the wall (FRUIT_RUN): there the body puts a spot on the dug cell beside it, and the tip goes on.
  h.root(2, 12, E);
  for (let r = 0; r < 3; r++) stepTips(h, g, 1, { free: 1e9, tips: 1 });
  assert.deepEqual(h.fruits.map(keyCell), [[5, 12]]);
  assert.equal(h.tips.length, 1, "the tip grows on past its spot");
  // A second tip a few rows down meets the same tunnel within FRUIT_GAP of the spot: no second spot.
  h.root(3, 16, E);
  for (let r = 0; r < 3; r++) stepTips(h, g, 1, { free: 1e9, tips: 2 });
  assert.equal(h.fruits.length, 1);
  assert.ok(h.tips.length >= 2, "both grow on");
});

test("the body spaces fruiting whoever answers it (ja-2bw.16, ja-2bw.15): a spot only after FRUIT_RUN cells and FRUIT_GAP from another, and the tip lives on", () => {
  // A shaft's wall: dug column 5, soil beside it; a tip rooted on the wall heading down it, under a policy that fruits always.
  const g: Ground = { topsoil: false, kind: (x) => (x === 5 ? "open" : "soil") };
  const always = () => "fruit" as const;
  const h = new Hyphae();
  h.root(4, 10, SE);
  for (let r = 0; r < 12; r++) {
    stepTips(h, g, 1, { free: 1e9, tips: 1 }, always);
    if (h.tips.length && h.tips[0]!.run < FRUIT_RUN && h.length <= FRUIT_RUN)
      assert.equal(h.fruits.length, 0, `a spot ${r + 1} steps from its root`);
  }
  assert.equal(h.fruits.length, 1, "one spot: the next is FRUIT_GAP away");
  assert.equal(h.tips.length, 1, "a fruit answer near a spot plays the tip's own rule, and it grows on");
  assert.ok(h.length > 8, `it grew ${h.length} cells`);
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

test("digging a hypha cell cuts it: what grew beyond it dies with its tips, unless a fusion loop joins it to the rest", () => {
  // A straight hypha east from (0, 20): cells x = 0…6, its tip at the end; and a branch from x = 2 going south-east.
  const line = (): Hyphae => {
    const h = new Hyphae();
    h.root(0, 20, E);
    const t = h.tips[0]!;
    for (let k = 0; k < 6; k++) h.extend(t, E, 0);
    return h;
  };
  const h = line();
  assert.equal(h.cut(cellKey(3, 20)), 4, "cells 3…6 lost");
  assert.equal(h.tips.length, 0, "the tip beyond the cut stopped");
  assert.ok(h.has(2, 20) && !h.has(4, 20));
  assert.equal(h.cutCells, 4);
  // A loop: a second hypha from (0, 22) fused into cell (5, 20), beyond the cut.
  const l = line();
  l.root(0, 22, E);
  const other = l.tips[1]!;
  for (let k = 0; k < 4; k++) l.extend(other, E, 0);
  l.fusions.push(cellKey(other.x, other.y), cellKey(5, 20));
  assert.equal(l.cut(cellKey(3, 20)), 1, "only the dug cell");
  assert.ok(l.has(4, 20) && l.has(6, 20));
  assert.equal(l.parent.get(cellKey(4, 20)), ROOT, "fed by the loop now");
  assert.equal(l.tips.length, 2);
});

test("a cut takes the spore spots only the dead part touched", () => {
  const g: Ground = { topsoil: false, kind: (x, y) => (y < 10 ? "rock" : x === 5 ? "open" : "soil") };
  const h = new Hyphae();
  h.root(2, 12, E);
  const t = h.tips[0]!;
  h.extend(t, E, 0);
  h.extend(t, E, 0);
  assert.ok(h.fruit(t, g));
  assert.equal(h.fruits.length, 1);
  h.cut(cellKey(3, 12));
  assert.equal(h.fruits.length, 0);
});

test("cutDug cuts only cells that were soil and are dug now", () => {
  let dug = false;
  const g: Ground = { topsoil: false, kind: (x) => (dug && x === 3 ? "open" : "soil") };
  const h = new Hyphae();
  h.root(0, 12, E);
  stepTips(h, g, 1, { free: 1e9, tips: 1 });
  stepTips(h, g, 1, { free: 1e9, tips: 1 });
  stepTips(h, g, 1, { free: 1e9, tips: 1 });
  stepTips(h, g, 1, { free: 1e9, tips: 1 });
  assert.ok(h.has(3, 12) && h.has(4, 12));
  assert.equal(h.cutDug(g), 0);
  dug = true;
  assert.equal(h.cutDug(g), 2, "cells 3 and 4");
  assert.ok(h.has(2, 12) && !h.has(3, 12));
});

test("a tip turned aside by a stone drifts back to its first heading (directional memory)", () => {
  // One stone ahead of a tip heading east: it splits round it, and the tip goes back to east within a few steps.
  const h = new Hyphae();
  h.root(0, 20, E);
  const tip = h.tips[0]!;
  run(
    h,
    plane((x, y) => x === 3 && y === 20),
    6,
  );
  assert.equal(tip.heading, E, `heading ${tip.heading}`);
  assert.ok(h.tips.length >= 2, "it split round the stone");
});

test("against a flat wall (rock ahead and one turn either way, two turns open) the local rule splits along it", () => {
  const h = new Hyphae();
  h.root(5, 20, E);
  const tip = h.tips[0]!;
  const blocked = new Set([E, turn(E, -1), turn(E, 1)].map((d) => cellKey(nx(5, 20, d), ny(20, d))));
  const g = plane((x, y) => blocked.has(cellKey(x, y)));
  const s = situationOf(h, g, tip, 0, 1e9, 1);
  assert.equal(s.ahead, "rock");
  assert.equal(localGrowth(h, g, tip, s, 0), "branch");
});

test("supply is judged at the round's start: two tips with just enough for both each step", () => {
  const h = new Hyphae();
  h.root(0, 10, E);
  h.root(0, 30, E);
  const budget = { free: HYPHA_MASS * AMPLE_STEPS * 2, tips: 2 };
  stepTips(h, plane(), 0, budget);
  assert.deepEqual(
    h.tips.map((t) => t.x),
    [1, 1],
    "the second tip rested: supply was judged after the first had grown",
  );
});

test("a cut keeps only what a fusion loop reaches: a branch beyond the cut that the loop doesn't join dies", () => {
  // A hypha east from (0, 20) to x = 6, with a branch from (4, 20) going south-east three cells; a second hypha from
  // (0, 24) fused into (6, 20). Cutting (2, 20): 3…6 are joined round the loop, and so is the branch (it grew from 4).
  // Cutting the branch's own first cell instead loses the branch, and nothing else.
  const build = () => {
    const h = new Hyphae();
    h.root(0, 20, E);
    const t = h.tips[0]!;
    for (let k = 0; k < 4; k++) h.extend(t, E, 0);
    const b = h.branch(t, SE);
    for (let k = 0; k < 3; k++) h.extend(b, SE, 0);
    for (let k = 0; k < 2; k++) h.extend(t, E, 0);
    h.root(0, 24, E);
    const o = h.tips[2]!;
    for (let k = 0; k < 4; k++) h.extend(o, E, 0);
    h.fusions.push(cellKey(o.x, o.y), cellKey(6, 20));
    return { h, b };
  };
  const one = build();
  assert.equal(one.h.cut(cellKey(2, 20)), 1, "only the dug cell: the rest is round the loop");
  assert.ok(one.h.has(3, 20) && one.h.has(one.b.x, one.b.y));
  // Cut at the branch point (4, 20): 5 and 6 are joined round the loop, the branch is not, and it dies with its tip.
  const three = build();
  assert.equal(three.h.cut(cellKey(4, 20)), 4, "the branch the loop doesn't reach dies");
  assert.ok(three.h.has(5, 20) && !three.h.has(three.b.x, three.b.y));
  // A loop that joins only the far end: cut (5, 20), between the branch point and the fused cell.
  const two = build();
  const branchCells = [...two.h.parent].filter(([, p]) => p !== ROOT).length;
  assert.ok(branchCells > 0);
  assert.equal(two.h.cut(cellKey(5, 20)), 1, "the fused end (6, 20) survives; 5 alone is lost");
  // Now cut the branch's first cell: no loop reaches it, so the branch dies, with its tip.
  const [bx, by] = [nx(4, 20, SE), ny(20, SE)];
  const tipsBefore = two.h.tips.length;
  assert.equal(two.h.cut(cellKey(bx, by)), 3);
  assert.equal(two.h.tips.length, tipsBefore - 1);
});

test("a policy's turn: the tip turns to whichever side is free (away from its own hypha; along a tunnel's wall)", () => {
  // Its own hypha ahead and to one side: a turn takes the other.
  const h = new Hyphae();
  h.root(5, 20, E);
  const t = h.tips[0]!;
  h.addCell(nx(5, 20, E), ny(20, E));
  h.addCell(nx(5, 20, turn(E, -1)), ny(20, turn(E, -1)));
  stepTips(h, plane(), 0, { free: 1e9, tips: 1 }, () => "turn");
  assert.equal(t.heading, turn(E, 1));
  assert.ok(h.has(nx(5, 20, turn(E, 1)), ny(20, turn(E, 1))));
  // No answer: the tip's own rule plays.
  const l = new Hyphae();
  l.root(0, 0, E);
  stepTips(l, plane(), 0, { free: 1e9, tips: 1 }, () => null);
  assert.equal(l.length, 2);
});

test("a policy that branches while short makes no tips (review of #115, S1): a branch the body can't afford rests", () => {
  const h = new Hyphae();
  h.root(0, 0, E);
  const budget = { free: HYPHA_MASS * AMPLE_STEPS * 0.5, tips: 1 }; // short from the first round
  for (let r = 0; r < 20; r++) stepTips(h, plane(), 0, budget, () => "branch");
  assert.equal(h.tips.length, 1, `${h.tips.length} tips`);
});

test("a policy's turn goes left when the right is blocked (the mirror of the turn above)", () => {
  const h = new Hyphae();
  h.root(5, 20, E);
  const t = h.tips[0]!;
  h.addCell(nx(5, 20, E), ny(20, E));
  h.addCell(nx(5, 20, turn(E, 1)), ny(20, turn(E, 1)));
  stepTips(h, plane(), 0, { free: 1e9, tips: 1 }, () => "turn");
  assert.equal(t.heading, turn(E, -1));
});

test("a policy's turn with both near sides blocked reaches two turns round (sideFor's wide step), turning where it stands", () => {
  const h = new Hyphae();
  h.root(5, 20, E);
  const t = h.tips[0]!;
  for (const k of [0, -1, 1, 2]) h.addCell(nx(5, 20, turn(E, k)), ny(20, turn(E, k)));
  // Only two turns to the left (-2) is open of the near five.
  stepTips(h, plane(), 0, { free: 1e9, tips: 1 }, () => "turn");
  assert.equal(t.heading, turn(E, -1), "turned a step toward the open side, where it stands");
  assert.equal(h.length, 5, "grew nothing this step (the cell one turn left is its own)");
});

// Cords (a web, ja-2bw.8): the hypha feeding many tips thickens, takes CORD_DIGS digs to cut, dead ends fade.

/** A trunk east from (0, 20) to x = 5, and five branches off its end, each two cells long: the trunk feeds five tips. */
function fan(): Hyphae {
  const h = new Hyphae();
  h.root(0, 20, E);
  const t = h.tips[0]!;
  for (let k = 0; k < 5; k++) h.extend(t, E, 0);
  for (const d of [NE, SE, turn(E, 2), turn(E, -2)]) {
    const b = h.branch(t, d);
    h.extend(b, d, 0);
    h.extend(b, d, 0);
  }
  h.extend(t, E, 0);
  return h;
}

test("a cell feeding CORD_FLOW tips or more thickens into a cord; one feeding fewer stays a hypha", () => {
  const h = fan();
  assert.equal(h.tips.length, 5);
  assert.ok(h.thicken() > 0);
  for (let x = 0; x <= 5; x++) assert.ok(h.cords.has(cellKey(x, 20)), `trunk cell ${x} is no cord`);
  const branchTip = h.tips[1]!;
  assert.ok(!h.cords.has(cellKey(branchTip.x, branchTip.y)), "a branch feeding one tip thickened");
  assert.ok(5 >= CORD_FLOW, "the trunk feeds enough tips");
});

test("a cord takes CORD_DIGS digs to cut (a dig a round it lies in a dug cell); a thin hypha one", () => {
  const h = fan();
  h.thicken();
  for (const k of h.parent.keys()) h.soil.add(k);
  const trunk = cellKey(3, 20);
  const thin = cellKey(h.tips[1]!.x, h.tips[1]!.y);
  const dug = new Set([trunk, thin]);
  const g: Ground = { topsoil: false, kind: (x, y) => (dug.has(cellKey(x, y)) ? "open" : "soil") };
  assert.equal(h.cutDug(g), 1, "the thin hypha's tip cell, at the first dig");
  for (let d = 2; d < CORD_DIGS; d++) {
    h.cutDug(g);
    assert.ok(h.has(3, 20), `the cord was cut at dig ${d}`);
  }
  assert.ok(h.has(3, 20), "a cord was cut before CORD_DIGS");
  assert.ok(h.cutDug(g) > 1, "the cord's cut takes what grew from it");
  assert.ok(!h.has(3, 20), "the cord survived its CORD_DIGS-th dig");
  assert.equal(h.digs.size, 0);
});

test("dead ends nothing uses fade, a cell a round, freeing their mass; roots, cords, fusions and a spot's hypha stay", () => {
  // A hypha east from (0, 10), cut near its end: the cells before the cut are a dead end (no tip, nothing grows from them).
  const h = new Hyphae();
  h.root(0, 10, E);
  const t = h.tips[0]!;
  for (let k = 0; k < 6; k++) h.extend(t, E, 0);
  h.cut(cellKey(6, 10));
  assert.equal(h.tips.length, 0);
  const before = h.length;
  assert.equal(h.regress(), REGRESS_PER_ROUND);
  assert.equal(h.length, before - REGRESS_PER_ROUND);
  assert.ok(!h.has(5, 10), "the dead end's last cell faded first");
  for (let r = 0; r < 20; r++) h.regress();
  assert.ok(h.has(0, 10), "the root stayed");
  assert.equal(h.length, 1);
  // A spot's hypha stays: fruit at a tunnel, then nothing fades next to the spot.
  const g: Ground = { topsoil: false, kind: (x, y) => (y < 0 ? "rock" : x === 5 ? "open" : "soil") };
  const f = new Hyphae();
  f.root(2, 12, E);
  const ft = f.tips[0]!;
  f.extend(ft, E, 0);
  f.extend(ft, E, 0);
  assert.ok(f.fruit(ft, g));
  f.regress();
  assert.ok(f.has(4, 12), "the hypha by the spot faded");
});

test("a tip's cell, a fusion's cells and a kept (corpse) cell don't fade (review of #119, S1)", () => {
  const a = new Hyphae();
  a.root(0, 5, E);
  const ta = a.tips[0]!;
  for (let i = 0; i < 4; i++) a.extend(ta, E, 0);
  assert.equal(a.regress(), 0, "a growing tip's cell faded");
  const b = new Hyphae();
  b.root(0, 5, E);
  const tb = b.tips[0]!;
  for (let i = 0; i < 4; i++) b.extend(tb, E, 0);
  const br = b.branch(tb, turn(E, 1));
  b.extend(br, turn(E, 1), 0);
  b.extend(br, turn(E, 2), 0);
  b.fuse(br, turn(E, 3));
  assert.equal(b.regress(), 0, "a fusion's cell faded");
  const c = new Hyphae();
  c.root(0, 5, E);
  const tc = c.tips[0]!;
  for (let i = 0; i < 3; i++) c.extend(tc, E, 0);
  c.cut(cellKey(3, 5));
  assert.equal(
    c.regress((k) => k === cellKey(2, 5)),
    0,
    "a kept cell faded",
  );
});

const dugAt = (...cells: number[]): Ground => ({ topsoil: false, kind: (x, y) => (cells.includes(cellKey(x, y)) ? "open" : "soil") });

test("a cord that thins back while it lies dug is cut at once; its count is saved (review of #119, S2)", () => {
  const h = fan();
  h.thicken();
  for (const k of h.parent.keys()) h.soil.add(k);
  const trunk = cellKey(3, 20);
  assert.equal(h.cutDug(dugAt(trunk)), 0, "the cord took its first dig");
  assert.deepEqual([...Hyphae.load(JSON.parse(JSON.stringify(h.save()))).digs], [[trunk, 1]], "the dig count was not saved");
  for (const t of h.tips.slice(1, 3)) h.cut(cellKey(t.x, t.y)); // two branches go: the trunk feeds three tips
  h.thicken();
  assert.ok(!h.cords.has(trunk));
  assert.ok(h.cutDug(dugAt(trunk)) > 0, "a thinned cord kept its digs");
  assert.ok(!h.has(3, 20));
});

test("a dug cord cut from upstream leaves no dig count behind; one filled back in starts again", () => {
  const h = fan();
  h.thicken();
  for (const k of h.parent.keys()) h.soil.add(k);
  assert.equal(h.cutDug(dugAt(cellKey(4, 20))), 0);
  h.cords.delete(cellKey(2, 20)); // a thin cell upstream
  assert.ok(h.cutDug(dugAt(cellKey(4, 20), cellKey(2, 20))) > 0);
  assert.equal(h.digs.size, 0, "a cut cord's dig count stayed");
  const f = fan();
  f.thicken();
  for (const k of f.parent.keys()) f.soil.add(k);
  f.cutDug(dugAt(cellKey(3, 20)));
  f.cutDug(dugAt()); // filled back with soil
  assert.equal(f.digs.size, 0, "a filled cell kept its count");
});

test("a tip senses its run: short below BRANCH_RUN, long from it; the preset branches at a long run (ja-2bw.18, review of #137 S2)", () => {
  const h = new Hyphae();
  h.root(5, 20, E);
  const tip = h.tips[0]!;
  const g: Ground = { topsoil: true, kind: () => "soil" };
  tip.run = BRANCH_RUN - 1;
  assert.equal(situationOf(h, g, tip, 0, 1e9, 1).run, "short");
  tip.run = BRANCH_RUN;
  assert.equal(situationOf(h, g, tip, 0, 1e9, 1).run, "long");
  assert.equal(localGrowthChoice({ ahead: "soil", exposed: "buried", supply: "ample", run: "long" }), "branch");
  assert.equal(localGrowthChoice({ ahead: "soil", exposed: "buried", supply: "ample", run: "short" }), "grow");
});

/** A dug tunnel: `legs` of [heading, cells] from (x, y); everything else soil. Returns the ground and its cells in order. */
function tunnel(x: number, y: number, legs: [number, number][]): { g: Ground; cells: number[] } {
  const cells = [cellKey(x, y)];
  for (const [d, n] of legs)
    for (let i = 0; i < n; i++) {
      [x, y] = [nx(x, y, d), ny(y, d)];
      cells.push(cellKey(x, y));
    }
  const open = new Set(cells);
  return { g: { topsoil: false, kind: (cx, cy) => (open.has(cellKey(cx, cy)) ? "open" : "soil") }, cells };
}

test("in a tunnel the local rule follows it round its bend (ja-2bw.15)", () => {
  const { g, cells } = tunnel(0, 10, [
    [E, 6],
    [SE, 6],
  ]);
  const h = new Hyphae();
  h.root(0, 10, E);
  // A spot of its own by the start, so the tip doesn't fruit and end along the way (FRUIT_GAP).
  h.fruits.push(cellKey(3, 10));
  for (let r = 0; r < 14; r++) stepTips(h, g, 0, { free: 1e9, tips: h.tips.length });
  const inTunnel = [...h.parent.keys()].filter((k) => cells.includes(k)).length;
  assert.ok(inTunnel >= 11, `${inTunnel} of ${h.length} hypha cells in the tunnel's 13`);
  assert.ok(h.has(...keyCell(cells.at(-1)!)), "it reached the tunnel's end round the bend");
});

test("a policy's turn in a tunnel that bends goes the way the tunnel goes (ja-2bw.15)", () => {
  for (const [bend, want] of [
    [SE, "right"],
    [NE, "left"],
  ] as const) {
    const { g } = tunnel(0, 10, [
      [E, 3],
      [bend, 3],
    ]);
    const h = new Hyphae();
    h.root(3, 10, E);
    const tip = h.tips[0]!;
    const s = situationOf(h, g, tip, 0, 1e9, 1);
    assert.equal(s.exposed, "open");
    assert.equal(s.ahead, "soil");
    assert.equal(sideFor(h, g, tip, s, 0), want, `bend ${bend}`);
  }
});

test("from the soil the local rule goes into a tunnel ahead, unless its own hypha already runs in it near (ja-2bw.15)", () => {
  const { g } = tunnel(6, 8, [[SE, 8]]);
  const h = new Hyphae();
  h.root(2, 12, E);
  h.tips[0]!.run = 3;
  const tip = h.tips[0]!;
  // Walk it to the cell before the tunnel.
  while (situationOf(h, g, tip, 0, 1e9, 1).ahead !== "open") assert.ok(h.extend(tip, E, 0));
  const s = situationOf(h, g, tip, 0, 1e9, 1);
  // A spot of its own right there, so fruiting is no choice (FRUIT_GAP): it goes in.
  h.fruits.push(cellKey(tip.x, tip.y));
  assert.equal(localGrowth(h, g, tip, s, 0), "grow");
  // A hypha of its own already in the tunnel close by: it slides along the wall instead.
  const [ax, ay] = [nx(tip.x, tip.y, E), ny(tip.y, E)];
  h.addCell(nx(ax, ay, SE), ny(ay, SE));
  assert.notEqual(localGrowth(h, g, tip, s, 0), "grow");
});

test("a hypha cut by digging regrows from its stump into the dug cell after REGROW_ROUNDS rounds; stumps are saved (ja-2bw.15)", () => {
  const dug = new Set<number>();
  const g: Ground = { topsoil: false, kind: (x, y) => (dug.has(cellKey(x, y)) ? "open" : "soil") };
  const h = new Hyphae();
  h.root(0, 10, E);
  const tip = h.tips[0]!;
  for (let i = 0; i < 6; i++) assert.ok(h.extend(tip, E, 0));
  for (let x = 0; x <= 6; x++) h.soil.add(cellKey(x, 10));
  // The ants dig cell (3, 10): it and what grew from it are cut; (2, 10) is the stump.
  dug.add(cellKey(3, 10));
  assert.ok(h.cutDug(g) > 0);
  assert.equal(h.tips.length, 0);
  assert.deepEqual([...h.stumps.keys()], [cellKey(2, 10)]);
  const back = Hyphae.load(JSON.parse(JSON.stringify(h.save())));
  assert.deepEqual([...back.stumps], [...h.stumps]);
  for (let r = 1; r < REGROW_ROUNDS; r++) assert.equal(h.resprout(g, 0), 0, `regrew after ${r} rounds`);
  assert.equal(h.resprout(g, 0), 1);
  assert.deepEqual(
    h.tips.map((t) => [t.x, t.y, t.heading]),
    [[2, 10, E]],
  );
  stepTips(h, g, 0, { free: 1e9, tips: 1 });
  assert.ok(h.has(3, 10), "it grew back into the dug cell");
  assert.equal(h.stumps.size, 0);
});

test("with the mass to pay for it, a stump regrows straight into its dug cell, even beside hypha already in the tunnel (ja-2bw.15)", () => {
  const dug = new Set<number>([cellKey(3, 11)]);
  const g: Ground = { topsoil: false, kind: (x, y) => (dug.has(cellKey(x, y)) ? "open" : "soil") };
  const h = new Hyphae();
  h.root(0, 10, E);
  const tip = h.tips[0]!;
  for (let i = 0; i < 6; i++) assert.ok(h.extend(tip, E, 0));
  for (let x = 0; x <= 6; x++) h.soil.add(cellKey(x, 10));
  h.addCell(3, 11); // its own hypha already in the tunnel beside the cut
  dug.add(cellKey(3, 10));
  h.cutDug(g);
  for (const r of h.stumps.values()) r.wait = 1;
  const budget = { free: 1 };
  assert.equal(h.resprout(g, 0, budget), 1);
  assert.ok(h.has(3, 10), "regrown into the dug cell");
  assert.equal(budget.free, 1 - HYPHA_MASS);
  assert.deepEqual(
    h.tips.map((t) => [t.x, t.y]),
    [[3, 10]],
  );
  // Without the mass, the tip waits on the stump.
  const poor = new Hyphae();
  poor.root(0, 10, E);
  for (let i = 0; i < 6; i++) assert.ok(poor.extend(poor.tips[0]!, E, 0));
  for (let x = 0; x <= 6; x++) poor.soil.add(cellKey(x, 10));
  poor.cutDug(g);
  for (const r of poor.stumps.values()) r.wait = 1;
  assert.equal(poor.resprout(g, 0, { free: 0 }), 1);
  assert.ok(!poor.has(3, 10));
});

test("in a tunnel the local rule grows on where it ends, keeps on down it off its first heading, and takes a sharp bend two turns off (ja-2bw.15, review of #146 S1)", () => {
  const at = (legs: [number, number][], x: number, y: number, heading: number, first = heading) => {
    const { g } = tunnel(0, 10, legs);
    const h = new Hyphae();
    h.root(x, y, heading);
    h.tips[0]!.first = first;
    h.fruits.push(cellKey(x, y)); // a spot here, so fruiting is no choice
    const tip = h.tips[0]!;
    const s = situationOf(h, g, tip, 0, 1e9, 1);
    return { local: localGrowth(h, g, tip, s, 0), turn: sideFor(h, g, tip, s, 0) };
  };
  // The tunnel ends ahead: on into the soil.
  assert.equal(at([[E, 3]], 3, 10, E).local, "grow");
  // Down the tunnel's second leg, off the tip's first heading: on down it, not back toward its first heading.
  const [bx, by] = [nx(3, 10, SE), ny(10, SE)];
  assert.equal(
    at(
      [
        [E, 3],
        [SE, 3],
      ],
      bx,
      by,
      SE,
      E,
    ).local,
    "grow",
  );
  // A bend of 120°: two turns off, the way the tunnel goes.
  for (const [bend, want] of [
    [turn(E, 2), "right"],
    [turn(E, -2), "left"],
  ] as const) {
    const r = at(
      [
        [E, 3],
        [bend, 3],
      ],
      3,
      10,
      E,
    );
    assert.equal(r.local, want, `local, bend ${bend}`);
    assert.equal(r.turn, want, `turn, bend ${bend}`);
  }
});

test("a stump puts out no tip where one stands already, nor into a cell it can't enter; ENTER_GAP spaces tunnel entries (review of #146 N3)", () => {
  const dug = new Set<number>();
  const g: Ground = { topsoil: false, kind: (x, y) => (dug.has(cellKey(x, y)) ? "open" : "soil") };
  const cutAt = () => {
    const h = new Hyphae();
    h.root(0, 10, E);
    for (let i = 0; i < 6; i++) assert.ok(h.extend(h.tips[0]!, E, 0));
    for (let x = 0; x <= 6; x++) h.soil.add(cellKey(x, 10));
    dug.clear();
    dug.add(cellKey(3, 10));
    h.cutDug(g);
    for (const r of h.stumps.values()) r.wait = 1;
    return h;
  };
  // A tip already stands on the stump: no second one.
  const a = cutAt();
  a.tips.push({ x: 2, y: 10, heading: E, first: E, run: 0 });
  assert.equal(a.resprout(g, 0), 0);
  assert.equal(a.tips.length, 1);
  // The cut cell holds hypha again (grown back another way): no tip into it.
  const b = cutAt();
  b.addCell(3, 10);
  assert.equal(b.resprout(g, 0), 0);
  assert.equal(b.tips.length, 0);
  // From the soil, its own hypha down the tunnel: 5 cells from the cell ahead it slides along the wall, 8 cells it goes in.
  const { g: t } = tunnel(6, 8, [[SE, 10]]);
  const near = (steps: number) => {
    const h = new Hyphae();
    h.root(5, 8, E);
    const tip = h.tips[0]!;
    tip.run = 3;
    h.fruits.push(cellKey(tip.x, tip.y));
    let [fx, fy] = [6, 8];
    for (let i = 0; i < steps; i++) [fx, fy] = [nx(fx, fy, SE), ny(fy, SE)];
    h.addCell(fx, fy);
    return localGrowth(h, t, tip, situationOf(h, t, tip, 0, 1e9, 1), 0);
  };
  assert.equal(ENTER_GAP, 6);
  assert.notEqual(near(5), "grow");
  assert.equal(near(8), "grow");
});
