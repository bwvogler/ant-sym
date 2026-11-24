import assert from "node:assert/strict";
import { test } from "node:test";
import { guarded } from "../../builder.ts";
import { STRAINS } from "../../fungus.ts";
import { Game, LANDING } from "../../game.ts";
import { lineSeed } from "../../lines.ts";
import { makeTransect } from "../../transect.ts";
import { CELL, cellOf } from "../../hex.ts";
import { generateCurtain, generateOneWorld, oneWorldOnLines } from "../../oneWorld.ts";
import { generateWorld, mulberry32 } from "../../world.ts";

// A game over two lines (docs/endless-world.md §5, PRD §66 E3.3a): each colony on its own line's curtain, the plane shared.

const SEED = 3;
const two = () => oneWorldOnLines(SEED, generateWorld(SEED), [[0], [1]]);
const game = (w = two()) =>
  new Game(w, {}, mulberry32(5), [
    { antCount: 40, line: 0 },
    { antCount: 40, line: 1 },
  ]);

test("a world over two groups of nests: two lines, each with its own curtain, salt and nests", () => {
  const w = two();
  assert.equal(w.lines.length, 2);
  assert.equal(w.lines[0]!.salt, 0, "the first line keeps today's seeds");
  assert.notEqual(w.lines[1]!.salt, 0);
  assert.notEqual(w.lines[0]!.curtain, w.lines[1]!.curtain);
  assert.deepEqual(
    w.lines.map((l) => l.curtain.nests.length),
    [1, 1],
  );
  assert.deepEqual(
    w.lines.map((l) => l.line.holes.length),
    [1, 1],
  );
  // another line's ground: the same columns and rows are different ground
  let differ = 0;
  for (let y = 60; y < 200; y += 3)
    for (let s = -20; s < 20; s++) if (w.lines[0]!.curtain.rock.get(s, y) !== w.lines[1]!.curtain.rock.get(s, y)) differ++;
  assert.ok(differ > 50, `${differ} cells differ`);
  // one group is exactly what oneWorldOn made before: a world of one line
  const one = generateOneWorld(SEED);
  assert.equal(one.lines.length, 1);
  assert.equal(one.lines[0]!.salt, 0);
});

test("a game over two lines: each colony's home is its own curtain, and it has a layer there and on the plane only", () => {
  const g = game();
  assert.equal(g.layers.length, 3, "the plane and two curtains");
  assert.deepEqual(
    g.colonies.map((c) => c.home),
    [1, 2],
  );
  assert.deepEqual(
    g.colonies.map((c) => c.lineIndex),
    [0, 1],
  );
  assert.deepEqual(
    [...g.colonies[0]!.layers.keys()].filter((l) => g.colonies[0]!.layers[l]),
    [0, 1],
  );
  assert.deepEqual(
    [...g.colonies[1]!.layers.keys()].filter((l) => g.colonies[1]!.layers[l]),
    [0, 2],
  );
  assert.equal(g.colonies[1]!.layers[2]!.map, g.world.lines[1]!.curtain);
  assert.equal(g.colonies[1]!.map, g.world.lines[1]!.curtain, "bound to its home between ticks");
  assert.deepEqual(
    g.colonies.map((c) => c.holeCells.length),
    [1, 1],
    "each sees the holes of its own curtain",
  );
  assert.equal(g.colonies[1]!.line, g.world.lines[1]!.line);
  // its nest on the plane is its own (the plane's nests are by colony), and on its curtain the first of that curtain's
  assert.equal(g.colonies[1]!.layers[0]!.nest, g.world.plane.nests[1]);
  assert.equal(g.colonies[0]!.layers[0]!.nest, g.world.plane.nests[0]);
  assert.equal(g.colonies[1]!.nest, g.world.lines[1]!.curtain.nests[0]);
  assert.equal(
    g.foodLeft,
    g.world.plane.foodLeft + g.world.lines[0]!.curtain.foodLeft + g.world.lines[1]!.curtain.foodLeft,
    "food left is every layer's",
  );
});

test("two minutes of it: every ant is on the plane or its own curtain, foragers go out and come back, and nothing throws", () => {
  const g = game();
  const out = [false, false];
  for (let t = 0; t < 120 * 30; t++) {
    g.tick(1 / 30);
    if (t % 30 === 0)
      g.colonies.forEach((c, k) => {
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i]) continue;
          const l = c.layer[i]!;
          assert.ok(l === 0 || l === c.home, `colony ${k} ant ${i} on layer ${l}`);
          if (l === 0) out[k] = true;
        }
      });
  }
  assert.deepEqual(out, [true, true], "both colonies had ants out on the plane");
  g.colonies.forEach((c, k) => assert.ok(c.population > 0, `colony ${k} still has ants`));
});

test("a colony founded onto the second line is on that line's curtain, with its own index there and on the plane", () => {
  const w = two();
  const g = game(w);
  const line = w.lines[1]!.line;
  const h = line.holes[0]!;
  const spot = { cell: { x: h.x + 60, y: h.y }, end: "end" as const, line: 1 };
  const k = g.addColony({ x: h.x + 60.5, y: (h.y + 0.5) * 0.866, antCount: 30, odour: 0.5, spot });
  assert.equal(k, 2);
  const c = g.colonies[2]!;
  assert.equal(c.home, 2);
  assert.equal(c.lineIndex, 1);
  assert.equal(w.lines[1]!.line.holes.length, 2, "line 1 grew");
  assert.equal(w.lines[0]!.line.holes.length, 1, "line 0 did not");
  assert.equal(w.lines[1]!.curtain.nests.length, 2);
  assert.equal(w.plane.nests.length, 3, "the plane's nests are by colony");
  assert.equal(c.nest, w.lines[1]!.curtain.nests[1], "its nest is the second of its curtain's");
  assert.equal(c.layers[0]!.nest, w.plane.nests[2], "and its nest on the plane is the one just made, by colony");
  assert.equal(g.founded[0]!.spot!.line, 1, "the founding records its line");
  for (let t = 0; t < 30 * 30; t++) g.tick(1 / 30);
  assert.ok(c.population > 0);
});

test("a colony on a line the world does not have is an error, and so are more colonies on a line than it has start nests", () => {
  assert.throws(() => new Game(two(), {}, mulberry32(1), [{ antCount: 10, line: 2 }]), /line 2/);
  assert.throws(
    () =>
      new Game(two(), {}, mulberry32(1), [
        { antCount: 10, line: 1 },
        { antCount: 10, line: 1 },
      ]),
    /2 colonies on line 1/,
  );
});

test("a colony's food left is its plane's and its own curtain's, not another line's", () => {
  const g = game();
  g.colonies.forEach((c, k) => assert.equal(c.foodLeft, g.world.plane.foodLeft + g.world.lines[k]!.curtain.foodLeft, `colony ${k}`));
});

test("growing the second line digs its new columns from that line's own seed, as a fresh curtain over the grown line would", () => {
  const w = two();
  const g = game(w);
  const old = w.lines[1]!.line;
  const h = old.holes[0]!;
  g.addColony({
    x: h.x + 60.5,
    y: (h.y + 0.5) * 0.866,
    antCount: 20,
    odour: 0.5,
    spot: { cell: { x: h.x + 60, y: h.y }, end: "end", line: 1 },
  });
  const grown = w.lines[1]!;
  assert.ok(grown.line.sMax > old.sMax, "the line grew at its end");
  const fresh = generateCurtain(lineSeed(w.seed, grown.salt), grown.line);
  // deep rows, in the stretch the growth added and between the two holes' shafts: the same ground
  let same = 0;
  for (let y = 120; y < 280; y += 7)
    for (let s = old.sMax + 5; s < grown.line.sMax - 5; s += 3) {
      assert.equal(grown.curtain.rock.get(s, y), fresh.rock.get(s, y), `line 1 column ${s} row ${y}`);
      same++;
    }
  assert.ok(same > 100, `${same} cells compared`);
});

test("founding with the fungus: a landing by the second colony is beside its own hole, toward its line's other hole", () => {
  const w = two();
  const g = new Game(w, { autoFound: false, fungus: { hyphae: true } }, mulberry32(5), [
    { antCount: 40, line: 0 },
    { antCount: 40, line: 1 },
  ]);
  const h = w.lines[1]!.line.holes[0]!;
  // the neighbour to the west, so a landing east of the hole (the no-neighbour fallback) would fail the direction below
  g.addColony({
    x: h.x - 59.5,
    y: (h.y + 0.5) * 0.866,
    antCount: 20,
    odour: 0.5,
    spot: { cell: { x: h.x - 60, y: h.y }, end: "start", line: 1 },
  });
  const garden = STRAINS.findIndex((x) => x.id === "garden");
  const at = g.land(1, garden, { evolve: true });
  const nest = g.colonies[1]!.layers[0]!.nest;
  const other = g.colonies[2]!.layers[0]!.nest;
  assert.ok(Math.hypot(at.x - nest.x, at.y - nest.y) < nest.r + LANDING.offset + 2, "beside its own hole");
  assert.ok(
    (at.x - nest.x) * (other.x - nest.x) + (at.y - nest.y) * (other.y - nest.y) > 0,
    "on the side of the neighbouring hole of its own line",
  );
});

test("the fungus on a second line's curtain: spores and hyphae are on layer 2, and play goes on without a throw", () => {
  const w = two();
  const g = new Game(w, { autoFound: false, fungus: { hyphae: true } }, mulberry32(5), [
    { antCount: 40, line: 0 },
    { antCount: 40, line: 1 },
  ]);
  const garden = STRAINS.findIndex((x) => x.id === "garden");
  g.land(1, garden, { evolve: true });
  const nest = g.colonies[1]!.layers[2]!.nest;
  // spores on the second curtain, among its ants and its queen's chamber
  g.paintSpores(nest.x, nest.y, 6, 5, 0.3, garden, 2);
  assert.ok(g.fungus.sporesOn(2), "layer 2 has spores");
  for (let t = 0; t < 150 * 30; t++) g.tick(1 / 30);
  assert.equal(g.fungus.hyphaeOn(1), null, "nothing on the first line's curtain: no colony of the first line was reached");
  assert.ok(g.fungus.hyphaeOn(2), "the hyphae went down the second line's hole into layer 2");
  void makeTransect;
});

test("the builder's guard is per curtain: a colony's queen and brood are guarded on its own curtain, which is not layer 1 for the second line", () => {
  const g = game();
  const key = (x: number, y: number) => (y + 0x8000) * 0x10000 + (x + 0x8000);
  const at = (x: number, y: number) => {
    cellOf(x, y);
    return key(CELL[0]!, CELL[1]!);
  };
  for (const [k, layer] of [
    [0, 1],
    [1, 2],
  ] as const) {
    const c = g.colonies[k]!;
    const guard = guarded(g, layer);
    assert.ok(c.queen?.alive);
    assert.ok(guard.has(at(c.queen.x, c.queen.y)), `colony ${k}'s queen is guarded on layer ${layer}`);
    for (const b of c.brood.items) assert.ok(guard.has(at(b.x, b.y)), `colony ${k}'s brood is guarded on layer ${layer}`);
  }
  // a colony's hole on the plane is guarded on the plane for both
  const plane = guarded(g, 0);
  for (const c of g.colonies) {
    const hc = c.holeCells[c.params.nest]!;
    assert.ok(plane.has(key(hc.px, hc.py)), "its hole's plane cell is guarded");
  }
});
