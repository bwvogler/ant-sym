import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILD, Builder, crayonLevel, guarded, RAIN_CHANNELS, strokeCells, type BuildTool } from "../../builder.ts";
import { Game } from "../../game.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { CURTAIN, FAINT, PLANE } from "../../vocab.ts";
import { mulberry32, OPEN, qualityAt, ROCK, rockAt, SOIL, type WorldMap } from "../../world.ts";
import { smallOne } from "../builders.ts";

// The builder (docs/builder.md, PRD §70, ja-kjj8.2): a child's tools over the world, guarded, undoable.

const game = (ants = 20) => new Game(smallOne(7), { antCount: ants, rivalAnts: ants, regrow: 0 }, mulberry32(3));
const key = (x: number, y: number) => (y + 0x8000) * 0x10000 + (x + 0x8000);
const pt = (x: number, y: number) => ({ x: centreX(x, y), y: centreY(y) });

/** The first cell of `t` on a layer's map, away from every guarded cell, scanning from (x0, y0). */
function find(g: Game, layer: number, t: number, from: [number, number] = [0, 0], clear = 4): [number, number] {
  const map = g.layers[layer] as WorldMap;
  const guard = guarded(g, layer);
  for (let y = Math.max(from[1], map.surfaceRows ?? 0) + clear; y < map.size.h - clear; y++)
    for (let x = map.x0 + clear; x < map.x0 + map.size.w - clear; x++) {
      if (rockAt(map, x, y) !== t || map.food.get(x, y) > 0) continue;
      let near = false;
      for (let dy = -clear; dy <= clear && !near; dy++)
        for (let dx = -clear; dx <= clear && !near; dx++) near = guard.has(key(x + dx, y + dy));
      if (!near) return [x, y];
    }
  throw new Error(`no cell of ${t} on layer ${layer}`);
}

test("dig opens soil below; dirt fills it back; both count as the ants' digging does", () => {
  const g = game();
  const b = new Builder(g);
  const map = g.layers[CURTAIN] as WorldMap;
  const [x, y] = find(g, CURTAIN, SOIL);
  const dug = map.dug;
  assert.ok(b.apply({ tool: "dig", layer: CURTAIN, points: [pt(x, y)] }) > 0);
  assert.equal(rockAt(map, x, y), OPEN);
  assert.ok(map.dug > dug, "dug counted (the way-out field's version moves)");
  const filled = map.filled;
  assert.ok(b.apply({ tool: "dirt", layer: CURTAIN, points: [pt(x, y)] }) > 0);
  assert.equal(rockAt(map, x, y), SOIL);
  assert.ok(map.filled > filled);
  assert.equal(map.filledAt.get(x, y), -Infinity, "not a fresh pellet: no building scent");
});

test("on the plane, which has no soil, dirt is a wall of rock; dig clears rock", () => {
  const g = game();
  const b = new Builder(g);
  const map = g.layers[PLANE] as WorldMap;
  const [x, y] = find(g, PLANE, OPEN);
  b.apply({ tool: "dirt", layer: PLANE, points: [pt(x, y)] });
  assert.equal(rockAt(map, x, y), ROCK);
  b.apply({ tool: "dig", layer: PLANE, points: [pt(x, y)] });
  assert.equal(rockAt(map, x, y), OPEN);
});

test("dirt and rock never cover a hole, an ant, the brood or the queen, or bury food", () => {
  const g = game(40);
  for (let k = 0; k < 30 * 5; k++) g.tick(1 / 30);
  const b = new Builder(g);
  for (const layer of [PLANE, CURTAIN]) {
    const map = g.layers[layer] as WorldMap;
    const guard = guarded(g, layer);
    assert.ok(guard.size > 0);
    // A stroke through every guarded cell and the food on this layer.
    const points: { x: number; y: number }[] = [];
    for (const k of guard) points.push(pt((k % 0x10000) - 0x8000, Math.floor(k / 0x10000) - 0x8000));
    const cellOfKey = (k: number): [number, number] => [(k % 0x10000) - 0x8000, Math.floor(k / 0x10000) - 0x8000];
    const was = new Map([...guard].map((k) => [k, rockAt(map, ...cellOfKey(k))]));
    for (const tool of ["rock", "dirt"] as BuildTool[]) {
      b.apply({ tool, layer, points });
      for (const [k, t] of was)
        assert.equal(rockAt(map, ...cellOfKey(k)), t, `guarded cell ${cellOfKey(k)} on layer ${layer} after ${tool}`);
    }
    // Food is never buried: a pile with dirt over it keeps its cell open.
    const [fx, fy] = find(g, layer, OPEN);
    map.food.set(fx, fy, 5);
    map.foodLeft += 5;
    b.apply({ tool: "rock", layer, points: [pt(fx, fy)] });
    assert.equal(rockAt(map, fx, fy), OPEN);
    // Every ant still stands on open ground; the holes are open.
    for (const c of g.colonies)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.layer[i] !== layer) continue;
        c.antCell(i);
        assert.equal(rockAt(map, CELL[0], CELL[1]), OPEN, `colony ${c.params.nest} ant ${i} buried on layer ${layer}`);
      }
  }
  for (const c of g.colonies) {
    const h = c.holeCells[c.params.nest]!;
    assert.equal(rockAt(g.layers[PLANE]!, h.px, h.py), OPEN, "the plane's hole");
    assert.equal(rockAt(g.layers[CURTAIN]!, h.col, h.row), OPEN, "the curtain's hole");
    for (const it of c.brood.items) assert.equal(rockAt(g.layers[CURTAIN]!, it.x, it.y), OPEN, "brood");
    if (c.queen?.alive) {
      cellOf(c.queen.x, c.queen.y);
      assert.equal(rockAt(g.layers[CURTAIN]!, CELL[0], CELL[1]), OPEN, "the queen");
    }
  }
});

test("sugar and crumb: the world's pile size at A2b's two qualities, capped per cell; never on rock", () => {
  const g = game();
  const b = new Builder(g);
  const map = g.layers[PLANE] as WorldMap;
  const [x, y] = find(g, PLANE, OPEN);
  const left = map.foodLeft;
  b.apply({ tool: "sugar", layer: PLANE, points: [pt(x, y)] });
  assert.equal(map.food.get(x, y), BUILD.foodPerCell);
  assert.equal(qualityAt(map, x, y), BUILD.sugar);
  assert.ok(map.foodLeft > left);
  for (let k = 0; k < 10; k++) b.apply({ tool: "sugar", layer: PLANE, points: [pt(x, y)] });
  assert.equal(map.food.get(x, y), BUILD.foodCap);
  const [cx, cy] = find(g, PLANE, OPEN, [x + 10, y + 10]);
  b.apply({ tool: "crumb", layer: PLANE, points: [pt(cx, cy)] });
  assert.equal(qualityAt(map, cx, cy), BUILD.crumb);
  const [rx, ry] = find(g, PLANE, ROCK);
  b.apply({ tool: "sugar", layer: PLANE, points: [pt(rx, ry)] });
  assert.equal(map.food.get(rx, ry), 0);
});

test("a crayon lays one colony's food trail, kept topped up as it fades at the home trail's half-life, then dropped", () => {
  const g = game(1);
  const b = new Builder(g);
  const [x, y] = find(g, PLANE, OPEN);
  b.apply({ tool: "crayon", layer: PLANE, colony: 1, points: [pt(x, y), pt(x + 8, y)] });
  const mine = g.colonies[1]!.layers[PLANE]!.ph;
  const theirs = g.colonies[0]!.layers[PLANE]!.ph;
  assert.ok(mine.fields.food.get(x + 4, y) >= BUILD.crayonLevel - 1e-6, "drawn at once");
  assert.equal(theirs.fields.food.get(x + 4, y), 0, "the other colony's trail untouched");
  assert.equal(g.crayons.length, 1);
  // After one half-life the line still reads half its first level (it is topped up, not left to the food channel's faster fade).
  for (let k = 0; k < 30 * BUILD.crayonHalfLife; k++) g.tick(1 / 30);
  assert.ok(Math.abs(crayonLevel(g.crayons[0]!.age) - BUILD.crayonLevel / 2) < 0.05);
  assert.ok(mine.fields.food.get(x + 4, y) >= BUILD.crayonLevel / 2 - 0.05);
  // Gone once it would read below faint.
  const fade = BUILD.crayonHalfLife * Math.log2(BUILD.crayonLevel / FAINT);
  for (let k = 0; k < 30 * (fade - BUILD.crayonHalfLife + 2); k++) g.tick(1 / 30);
  assert.equal(g.crayons.length, 0);
});

test("crayon lines are saved with the game", () => {
  const g = game(1);
  const b = new Builder(g);
  const [x, y] = find(g, PLANE, OPEN);
  b.apply({ tool: "crayon", layer: PLANE, colony: 0, points: [pt(x, y), pt(x + 5, y)] });
  for (let k = 0; k < 30; k++) g.tick(1 / 30);
  const saved = JSON.parse(JSON.stringify(g.save()));
  const h = game(1);
  h.load(saved);
  assert.deepEqual(h.crayons, g.crayons);
});

test("rain clears every colony's trails and alarm under the cloud, and the crayon cells there; undo puts them back", () => {
  const g = game(1);
  const b = new Builder(g);
  const [x, y] = find(g, PLANE, OPEN, [0, 0], 8);
  for (const c of g.colonies) for (const ch of RAIN_CHANNELS) c.layers[PLANE]!.ph.depositCell(ch, x, y, 2);
  b.apply({ tool: "crayon", layer: PLANE, colony: 0, points: [pt(x - 3, y), pt(x + 3, y)] });
  const before = g.crayons[0]!.cells.length;
  b.apply({ tool: "rain", layer: PLANE, points: [pt(x, y)] });
  for (const c of g.colonies) for (const ch of RAIN_CHANNELS) assert.equal(c.layers[PLANE]!.ph.fields[ch].get(x, y), 0, ch);
  assert.ok(g.crayons[0]!.cells.length < before, "the crayon cells under the cloud are washed off the line");
  assert.ok(b.undo());
  for (const ch of RAIN_CHANNELS) assert.ok(g.colonies[1]!.layers[PLANE]!.ph.fields[ch].get(x, y) >= 2 - 1e-6, ch);
  assert.equal(g.crayons[0]!.cells.length, before);
});

test("undo: terrain and food go back as long as they are still the stroke's; a stroke that changes nothing records nothing", () => {
  const g = game();
  const b = new Builder(g);
  const below = g.layers[CURTAIN] as WorldMap;
  const above = g.layers[PLANE] as WorldMap;
  const [x, y] = find(g, CURTAIN, SOIL);
  b.apply({ tool: "dig", layer: CURTAIN, points: [pt(x, y)] });
  const [fx, fy] = find(g, PLANE, OPEN);
  const left = above.foodLeft;
  b.apply({ tool: "sugar", layer: PLANE, points: [pt(fx, fy)] });
  assert.ok(b.undo());
  assert.equal(above.food.get(fx, fy), 0);
  assert.equal(above.foodLeft, left);
  assert.ok(b.undo());
  assert.equal(rockAt(below, x, y), SOIL);
  assert.equal(b.undo(), false);
  assert.equal(b.apply({ tool: "dig", layer: CURTAIN, points: [pt(x, y)] }) > 0, true);
  assert.equal(b.apply({ tool: "dig", layer: CURTAIN, points: [pt(x, y)] }), 0, "already open: nothing to undo");
  assert.ok(b.undo());
  assert.equal(b.canUndo, false);
});

test("undo keeps the last BUILD.undoDepth strokes", () => {
  const g = game(1);
  const b = new Builder(g);
  const [x, y] = find(g, PLANE, OPEN);
  for (let k = 0; k < BUILD.undoDepth + 5; k++) b.apply({ tool: k % 2 ? "dig" : "rock", layer: PLANE, points: [pt(x, y)] });
  let n = 0;
  while (b.undo()) n++;
  assert.equal(n, BUILD.undoDepth);
});

test("a stroke's cells: each once, with no gaps between far points", () => {
  const g = game(1);
  const map = g.layers[PLANE] as WorldMap;
  const cells = strokeCells(map, "crayon", [pt(20, 20), pt(40, 20)]);
  const set = new Set<number>();
  for (let k = 0; k < cells.length; k += 2) set.add(key(cells[k]!, cells[k + 1]!));
  assert.equal(set.size * 2, cells.length);
  for (let x = 20; x <= 40; x++) assert.ok(set.has(key(x, 20)), `cell ${x} on the line`);
});

test("a drag is one undo: its pieces join, and a new drag starts a new one", () => {
  const g = game(1);
  const b = new Builder(g);
  const map = g.layers[PLANE] as WorldMap;
  // A row of open ground, clear of the guards, for three dabs (each 1.6 wide).
  const guard = guarded(g, PLANE);
  let x = -1;
  let y = -1;
  for (let yy = 10; yy < map.size.h - 10 && x < 0; yy++)
    for (let xx = 10; xx < map.size.w - 20 && x < 0; xx++) {
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++)
        for (let dx = -2; dx <= 12 && ok; dx++)
          ok = rockAt(map, xx + dx, yy + dy) === OPEN && !guard.has(key(xx + dx, yy + dy)) && map.food.get(xx + dx, yy + dy) === 0;
      if (ok) [x, y] = [xx, yy];
    }
  assert.ok(x >= 0, "a clear row");
  b.begin();
  b.apply({ tool: "rock", layer: PLANE, points: [pt(x, y)] }, true);
  b.apply({ tool: "rock", layer: PLANE, points: [pt(x + 4, y)] }, true);
  b.begin();
  b.apply({ tool: "rock", layer: PLANE, points: [pt(x + 8, y)] }, true);
  assert.ok(b.undo());
  assert.equal(rockAt(map, x + 8, y), OPEN);
  assert.equal(rockAt(map, x + 4, y), ROCK, "the first drag is still there");
  assert.ok(b.undo());
  assert.equal(rockAt(map, x, y), OPEN);
  assert.equal(rockAt(map, x + 4, y), OPEN, "both pieces of the first drag went with one undo");
  assert.equal(b.undo(), false);
});

test("a crayon drag is one line: its pieces extend it, and undo takes the whole line", () => {
  const g = game(1);
  const b = new Builder(g);
  const [x, y] = find(g, PLANE, OPEN, [0, 0], 8);
  b.begin();
  b.apply({ tool: "crayon", layer: PLANE, colony: 0, points: [pt(x, y), pt(x + 2, y)] }, true);
  const n = g.crayons[0]!.cells.length;
  b.apply({ tool: "crayon", layer: PLANE, colony: 0, points: [pt(x + 2, y), pt(x + 5, y)] }, true);
  assert.equal(g.crayons.length, 1, "one line");
  assert.ok(g.crayons[0]!.cells.length > n, "extended");
  b.begin();
  b.apply({ tool: "crayon", layer: PLANE, colony: 1, points: [pt(x, y + 4)] }, true);
  assert.equal(g.crayons.length, 2, "a new drag is a new line");
  assert.ok(b.undo());
  assert.equal(g.crayons.length, 1);
  assert.ok(b.undo());
  assert.equal(g.crayons.length, 0, "the whole first drag, both pieces");
});
