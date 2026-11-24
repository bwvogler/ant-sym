import assert from "node:assert/strict";
import { test } from "node:test";
import { cellKey, centreX } from "../../hex.ts";
import { STRAINS } from "../../fungus.ts";
import { Game } from "../../game.ts";
import { generateOneWorld, mainGround } from "../../oneWorld.ts";
import { mulberry32 } from "../../world.ts";

// A founding that starts a line (docs/endless-world.md §5, PRD §66 E3.3b): its curtain, its layer on every per-layer structure, its colony.

const SEED = 2;
const specs = [{ antCount: 40 }, { antCount: 40 }];
const fresh = () => new Game(generateOneWorld(SEED), {}, mulberry32(5), specs);
/** The plane's main open ground, worked out once per world (every settleAt would else work it out afresh: ~14 ms). */
const grounds = new WeakMap<Game, (x: number, y: number) => boolean>();
const groundOf = (g: Game) => {
  let f = grounds.get(g);
  if (!f) grounds.set(g, (f = mainGround(g.world)));
  return f;
};
const settle = (g: Game, p: { x: number; y: number }) => g.settleAt(p, groundOf(g));

/** Found a colony at plane point p where settleAt says (so the founding is the one settleAt shows). */
function found(g: Game, p: { x: number; y: number }, antCount: number, odour: number): number {
  const s = settle(g, p);
  if (!s.ok) throw new Error(s.reason);
  return g.addColony({
    ...p,
    antCount,
    odour,
    spot: { cell: s.cell, end: s.end, line: s.line, ...(s.newLine ? { newLine: s.newLine } : {}) },
  });
}

/** A plane point where, with new lines on, a founding starts a line: far (over a unit) from every hole. */
function farPoint(g: Game, line = 1): { x: number; y: number } {
  g.newLines = true;
  for (let y = 20; y < 360; y += 20)
    for (let x = 20; x < 500; x += 20) {
      const s = settle(g, { x, y });
      if (s.ok && s.newLine && s.line === line) return { x, y };
    }
  throw new Error("no far point on this plane");
}

test("with new lines off (the bounded game) a far point never starts a line; with them on it does, along a heading from the seed", () => {
  const g = fresh();
  const p = farPoint(g);
  g.newLines = false;
  const off = settle(g, p);
  assert.ok(!off.ok || !off.newLine, "no line of its own while new lines are off");
  g.newLines = true;
  const on = settle(g, p);
  assert.ok(on.ok && on.newLine && on.line === 1);
  assert.ok(on.newLine.heading >= 0 && on.newLine.heading < Math.PI);
  assert.deepEqual(settle(fresh(), p), off, "settleAt changes nothing");
  g.newLines = true;
  assert.deepEqual(settle(g, p), on, "and asking again gives the same");
});

test("founding there starts line 1: its curtain, its layer on the game, the grids, the recognition and the fungus, and a colony on it", () => {
  const g = fresh();
  const p = farPoint(g);
  const w = g.world;
  const k = found(g, p, 30, 0.5);
  assert.equal(k, 2);
  assert.equal(w.lines.length, 2);
  assert.equal(g.layers.length, 3, "the plane and two curtains");
  assert.equal(g.layers[2], w.lines[1]!.curtain);
  assert.equal(w.plane.nests.length, 3, "the plane's nests are by colony");
  assert.equal(w.lines[1]!.curtain.nests.length, 1, "its curtain's only nest is the colony's");
  const c = g.colonies[2]!;
  assert.equal(c.home, 2);
  assert.equal(c.lineIndex, 1);
  assert.equal(c.nest, w.lines[1]!.curtain.nests[0]);
  assert.equal(c.layers[0]!.nest, w.plane.nests[2]);
  assert.equal(w.lines[1]!.line.holes.length, 1);
  assert.notEqual(w.lines[1]!.salt, 0);
  const f = g.founded[0]!;
  assert.equal(f.spot!.line, 1);
  assert.ok(f.spot!.newLine, "the founding records that it began the line");
  assert.ok(g.fungus.sporesOn(2), "the fungus has a layer for the new curtain");
  assert.doesNotThrow(() => g.paintSpores(centreX(w.lines[1]!.line.holes[0]!.x, 0), 200, 3, 1, 0.1, 0, 2));
  // the grids, recognition and wiring are in step: it plays on without a throw, the new colony's ants on the plane or its own curtain
  for (let t = 0; t < 60 * 30; t++) g.tick(1 / 30);
  for (let i = 0; i < c.n; i++) if (c.alive[i]) assert.ok(c.layer[i] === 0 || c.layer[i] === 2, `ant ${i} on layer ${c.layer[i]}`);
  assert.ok(c.population > 0);
  for (const old of [0, 1])
    for (let i = 0; i < g.colonies[old]!.n; i++) if (g.colonies[old]!.alive[i]) assert.ok([0, 1].includes(g.colonies[old]!.layer[i]!));
});

test("the new line keeps off the first's: no plane cell lies over both curtains, and a second far founding starts line 2", () => {
  const g = fresh();
  const p = farPoint(g);
  found(g, p, 20, 0.4);
  const cells = (li: number) => {
    const t = g.world.lines[li]!.line;
    const out = new Set<number>();
    for (let j = 0; j < t.cells.length; j += 2) out.add(cellKey(t.cells[j]!, t.cells[j + 1]!));
    return out;
  };
  const a = cells(0);
  for (const key of cells(1)) assert.ok(!a.has(key), "a plane cell is over two curtains");
  // another founding far from every hole of both lines
  let second: { x: number; y: number } | null = null;
  try {
    second = farPoint(g, 2);
  } catch {
    second = null; // this plane has room for one line only
  }
  if (second) {
    found(g, second, 20, 0.6);
    assert.equal(g.world.lines.length, 3);
    assert.equal(g.layers.length, 4);
    assert.equal(g.colonies[3]!.home, 3);
    for (let t = 0; t < 20 * 30; t++) g.tick(1 / 30);
  }
});

test("the same world and the same landing make the same line: its salt, heading and tiles do not depend on the game's stream", () => {
  const make = (stream: number) => {
    const g = new Game(generateOneWorld(SEED), {}, mulberry32(stream), specs);
    const p = farPoint(g);
    found(g, p, 20, 0.4);
    return g.world.lines[1]!;
  };
  const a = make(99);
  const b = make(7); // another stream
  assert.equal(a.salt, b.salt);
  assert.deepEqual([...a.line.cells], [...b.line.cells]);
  assert.deepEqual(a.line.holes, b.line.holes);
});

test("a game over a line that began mid-game refuses to save, so no line is lost without a word", () => {
  const g = fresh();
  found(g, farPoint(g), 20, 0.4);
  assert.throws(() => g.save(), /2 lines/);
});

test("with the fungus's hyphae on, a line that begins mid-game takes a landing and plays on: every per-layer structure of the fungus was made for it", () => {
  const g = new Game(generateOneWorld(SEED), { autoFound: false, fungus: { hyphae: true } }, mulberry32(5), specs);
  const p = farPoint(g);
  const k = found(g, p, 30, 0.5);
  const garden = STRAINS.findIndex((x) => x.id === "garden");
  g.land(k, garden, { evolve: true });
  for (let t = 0; t < 120 * 30; t++) g.tick(1 / 30);
  assert.ok(g.fungus.hyphaeOn(2), "its hyphae grew on the new line's curtain");
});

test("an explicit spot that begins a line is checked again: a stale line index, and a hole already at its cell", () => {
  const g = fresh();
  const p = farPoint(g);
  const s = settle(g, p);
  assert.ok(s.ok && s.newLine);
  const spot = { cell: s.cell, end: s.end, line: s.line, newLine: s.newLine };
  assert.throws(() => g.addColony({ ...p, antCount: 10, odour: 0.4, spot: { ...spot, line: 5 } }), /next line is 1/);
  g.addColony({ ...p, antCount: 10, odour: 0.4, spot });
  // the same spot again: its cell now holds a hole (and its line index is stale)
  assert.throws(() => g.addColony({ ...p, antCount: 10, odour: 0.4, spot: { ...spot, line: g.world.lines.length } }), /already has a hole/);
});
