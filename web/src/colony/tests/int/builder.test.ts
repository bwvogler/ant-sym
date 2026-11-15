import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILD, Builder, crayonLevel, FOLLOWED_AT, guarded, RAIN_CHANNELS, strokeCells, type BuildTool } from "../../builder.ts";
import { believePlane, fromHomePlane } from "../../homing.ts";
import { crossUp } from "../../crossing.ts";
import { NO_ENTRY_PAINTED } from "../../params.ts";
import { Game } from "../../game.ts";
import { CELL, cellOf, centreX, centreY, R } from "../../hex.ts";
import { CURTAIN, FAINT, PLANE } from "../../vocab.ts";
import { mulberry32, OPEN, qualityAt, ROCK, rockAt, SOIL, takeFoodCell, type WorldMap } from "../../world.ts";
import { smallOne } from "../builders.ts";

// The builder (docs/builder.md, PRD §73, ja-kjj8.2): a child's tools over the world, guarded, undoable.

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
  // Topped up to the level, not past it: within a tick's diffusion below it (review of #204, S3).
  const on = mine.fields.food.get(x + 4, y);
  const level = crayonLevel(g.crayons[0]!.age);
  assert.ok(on <= level + 0.05 && on >= level - 0.2, `field ${on} against level ${level}`);
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
  b.apply({ tool: "crayon", layer: PLANE, colony: 0, points: [pt(x + 5, y), pt(x + 7, y)] }, true);
  b.apply({ tool: "crayon", layer: PLANE, colony: 0, points: [pt(x + 7, y), pt(x + 9, y)] }, true);
  assert.equal(g.crayons.length, 1, "one line, however many pieces (review of #204, S1)");
  assert.ok(g.crayons[0]!.cells.length > n, "extended");
  const cells = g.crayons[0]!.cells;
  const distinct = new Set<number>();
  for (let k = 0; k < cells.length; k += 2) distinct.add(key(cells[k]!, cells[k + 1]!));
  assert.equal(distinct.size * 2, cells.length, "each cell once");
  b.begin();
  b.apply({ tool: "crayon", layer: PLANE, colony: 1, points: [pt(x, y + 4)] }, true);
  assert.equal(g.crayons.length, 2, "a new drag is a new line");
  assert.ok(b.undo());
  assert.equal(g.crayons.length, 1);
  assert.ok(b.undo());
  assert.equal(g.crayons.length, 0, "the whole first drag, every piece");
  const f = g.colonies[0]!.layers[PLANE]!.ph.fields.food;
  for (let d = 0; d <= 9; d++) assert.ok(f.get(x + d, y) < 1e-6, `no trail left at ${x + d} (review of #204, S3)`);
});

test("undo never fills soil back onto an ant or over food that came since (review of #204, S2)", () => {
  const g = game(20);
  const b = new Builder(g);
  const below = g.layers[CURTAIN] as WorldMap;
  const [x, y] = find(g, CURTAIN, SOIL);
  const [fx, fy] = find(g, CURTAIN, SOIL, [0, y + 8]);
  b.begin();
  b.apply({ tool: "dig", layer: CURTAIN, points: [pt(x, y)] }, true);
  b.apply({ tool: "dig", layer: CURTAIN, points: [pt(fx, fy)] }, true);
  assert.equal(rockAt(below, x, y), OPEN);
  // An ant walks into the first hole; food is put down in the second.
  const c = g.colonies[0]!;
  const i = [...Array(c.n).keys()].find((j) => c.alive[j] && c.layer[j] === CURTAIN)!;
  c.x[i] = centreX(x, y);
  c.y[i] = centreY(y);
  below.food.set(fx, fy, 5);
  below.foodLeft += 5;
  assert.ok(b.undo());
  assert.equal(rockAt(below, x, y), OPEN, "the ant's cell stays open");
  assert.equal(rockAt(below, fx, fy), OPEN, "the food stays on open ground");
});

test("a rock tap straight on the queen, with no ant by her, leaves her cell open (review of #204, S2)", () => {
  const g = game(20);
  const b = new Builder(g);
  const below = g.layers[CURTAIN] as WorldMap;
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) if (c.layer[i] === CURTAIN) c.alive[i] = 0; // no ant guards her
  for (const c of g.colonies) {
    const q = c.queen!;
    b.apply({ tool: "rock", layer: CURTAIN, points: [{ x: q.x, y: q.y }] });
    cellOf(q.x, q.y);
    assert.equal(rockAt(below, CELL[0], CELL[1]), OPEN, `colony ${c.params.nest}'s queen`);
  }
});

test("a rock ring round a hole leaves every open cell within BUILD.holeGuard of it open (review of #204, S2)", () => {
  const g = game(1);
  const b = new Builder(g);
  const above = g.layers[PLANE] as WorldMap;
  for (const c of g.colonies) {
    const h = c.holeCells[c.params.nest]!;
    const o = pt(h.px, h.py);
    const near: [number, number][] = [];
    for (let y = h.py - 4; y <= h.py + 4; y++)
      for (let x = h.px - 4; x <= h.px + 4; x++)
        if (Math.hypot(centreX(x, y) - o.x, centreY(y) - o.y) <= BUILD.holeGuard && rockAt(above, x, y) === OPEN) near.push([x, y]);
    assert.ok(near.length > 1);
    const ring = Array.from({ length: 25 }, (_, k) => ({
      x: o.x + 1.5 * Math.cos((k * Math.PI) / 12),
      y: o.y + 1.5 * Math.sin((k * Math.PI) / 12),
    }));
    b.apply({ tool: "rock", layer: PLANE, points: ring });
    for (const [x, y] of near) assert.equal(rockAt(above, x, y), OPEN, `cell ${x},${y} by colony ${c.params.nest}'s hole`);
  }
});

test("builder food counts in the map's total, so a share of it stays a share; undo takes it back off (review of #204, S4)", () => {
  const g = game(1);
  const b = new Builder(g);
  const above = g.layers[PLANE] as WorldMap;
  const [x, y] = find(g, PLANE, OPEN);
  const total = above.foodTotal;
  const left = above.foodLeft;
  b.apply({ tool: "sugar", layer: PLANE, points: [pt(x, y)] });
  assert.ok(above.foodTotal > total);
  assert.equal(above.foodTotal - total, above.foodLeft - left, "the total rises by what was put down");
  assert.ok(b.undo());
  assert.equal(above.foodTotal, total);
});

test("undo gives refilled chamber cells back to their chamber (review of #204, N7)", () => {
  const g = game(20);
  const b = new Builder(g);
  const below = g.layers[CURTAIN] as WorldMap;
  const ch = below.chambers!;
  const room = ch.list.find((c) => c.colony === g.colonies[0]!.params.nest)!;
  const before = room.cells;
  const floor = { room: room.floor, colony: ch.floorOf[room.colony] };
  const points: { x: number; y: number }[] = [];
  for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) if (ch.at(x, y) === room.id) points.push(pt(x, y));
  assert.ok(b.apply({ tool: "dirt", layer: CURTAIN, points }) > 0);
  assert.ok(room.cells < before, "dirt shrinks the chamber");
  assert.ok(b.undo());
  assert.equal(room.cells, before, "undo gives every cell back");
  assert.deepEqual({ room: room.floor, colony: ch.floorOf[room.colony] }, floor, "and its floor, counted again (review of #204, S5)");
});

/** A row of open ground on the plane, clear of the guards and of food, 13 cells long and 5 high: its left end. */
function openRow(g: Game): [number, number] {
  const map = g.layers[PLANE] as WorldMap;
  const guard = guarded(g, PLANE);
  for (let y = 10; y < map.size.h - 10; y++)
    for (let x = 10; x < map.size.w - 20; x++) {
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++)
        for (let dx = -2; dx <= 12 && ok; dx++)
          ok = rockAt(map, x + dx, y + dy) === OPEN && !guard.has(key(x + dx, y + dy)) && map.food.get(x + dx, y + dy) === 0;
      if (ok) return [x, y];
    }
  throw new Error("no open row");
}

// Slice 2 (docs/builder.md "Slice 2", PRD §73.3, ja-b3us.2): tweezers, the no-entry paint, and what happened.

/** An ant of colony 0 out on the plane, after `seconds` of play. */
function planeAnt(g: Game, seconds = 20): number {
  for (let k = 0; k < 30 * seconds; k++) g.tick(1 / 30);
  const c = g.colonies[0]!;
  const i = [...Array(c.n).keys()].find((j) => c.alive[j] && c.layer[j] === PLANE);
  assert.ok(i !== undefined, "an ant on the plane");
  return i!;
}

test("tweezers: the ant is set down there, and its belief of home moves by as much; undo puts both back", () => {
  const g = game(30);
  const b = new Builder(g);
  const c = g.colonies[0]!;
  const i = planeAnt(g);
  const [x, y] = find(g, PLANE, OPEN, [0, 0], 6);
  const to = pt(x, y);
  const from = { x: c.x[i]!, y: c.y[i]! };
  c.bind(PLANE);
  const home0 = fromHomePlane(c, i);
  assert.ok(b.moveAnt(0, i, to.x, to.y));
  assert.equal(c.x[i], Math.fround(to.x));
  assert.equal(c.y[i], Math.fround(to.y));
  // The believed home moved with the ant: its distance from it is as it was before the move.
  assert.ok(Math.abs(fromHomePlane(c, i) - home0) < 1e-3, `distance to believed home ${fromHomePlane(c, i)} vs ${home0}`);
  assert.ok(Math.abs(c.carriedX[i]! - (to.x - from.x)) < 1e-3 && Math.abs(c.carriedY[i]! - (to.y - from.y)) < 1e-3);
  assert.ok(b.undo());
  assert.ok(Math.abs(c.x[i]! - from.x) < 1e-3 && Math.abs(c.y[i]! - from.y) < 1e-3, "back where it was picked up");
  assert.ok(Math.abs(c.carriedX[i]!) < 1e-3 && Math.abs(c.carriedY[i]!) < 1e-3, "and its belief with it");
  c.bind(c.home);
});

test("tweezers: the belief the ant steers by is the hole, its drift and the carry; up out of its own hole the carry is gone (review of #229, S2)", () => {
  const g = game(30);
  const b = new Builder(g);
  const c = g.colonies[0]!;
  const i = planeAnt(g);
  const h = c.holeCells[c.params.nest]!;
  const hole = pt(h.px, h.py);
  // Set down far from its hole (out of sight of it), on open ground, where the home it then believes in is on the map
  // (believePlane keeps a belief inside the plane's edges).
  const map = g.layers[PLANE] as WorldMap;
  c.bind(PLANE);
  const [ox, oy] = [c.nest.x + c.odoSurf[i]! * c.driftSurf[i]!, c.nest.y + c.odoSurf[i]! * c.driftSurfY[i]!];
  const [lx, hx, hy] = [c.map.x0 + 20, c.map.x0 + c.map.size.w - 20, c.map.size.h * R - 20];
  c.bind(c.home);
  const [fx, fy] = [c.x[i]!, c.y[i]!];
  let to: { x: number; y: number } | null = null;
  for (let y = 5; y < map.size.h - 5 && !to; y++)
    for (let x = 5; x < map.size.w - 5 && !to; x++) {
      const p = pt(x, y);
      const [bx, by] = [ox + p.x - fx, oy + p.y - fy];
      if (Math.hypot(p.x - hole.x, p.y - hole.y) > 40 && rockAt(map, x, y) === OPEN && bx > lx && bx < hx && by > 20 && by < hy) to = p;
    }
  c.routeN[i] = 3; // it stored places on its way out, and is retracing them
  c.routeState[i] = 1;
  assert.ok(to && b.moveAnt(0, i, to.x, to.y));
  assert.equal(c.routeN[i], 0, "no retrace by places stored where it no longer is (S1)");
  assert.equal(c.routeState[i], 0);
  assert.equal(c.search[i], 0);
  c.bind(PLANE);
  const goal = c.nest;
  const odo = c.odoSurf[i]!;
  const bx = goal.x + odo * c.driftSurf[i]! + c.carriedX[i]!;
  const by = goal.y + odo * c.driftSurfY[i]! + c.carriedY[i]!;
  const belief = believePlane(c, i, goal);
  assert.ok(Math.abs(belief.x - bx) < 1e-3 && Math.abs(belief.y - by) < 1e-3, `belief ${belief.x},${belief.y} vs ${bx},${by}`);
  assert.ok(Math.hypot(c.carriedX[i]!, c.carriedY[i]!) > 1, "the carry is in it");
  c.bind(c.home);
  // Down its hole and up again: a fresh trip, nothing carried.
  c.putAnt(i, CURTAIN, centreX(h.col, h.row), centreY(h.row));
  crossUp(c, i, h.col, h.row);
  assert.equal(c.carriedX[i], 0);
  assert.equal(c.carriedY[i], 0);
});

test("tweezers refuse rock and an ant underground", () => {
  const g = game(30);
  const b = new Builder(g);
  const c = g.colonies[0]!;
  const i = planeAnt(g);
  const [rx, ry] = find(g, PLANE, ROCK);
  assert.equal(b.moveAnt(0, i, pt(rx, ry).x, pt(rx, ry).y), false, "not onto rock");
  const u = [...Array(c.n).keys()].find((j) => c.alive[j] && c.layer[j] === CURTAIN)!;
  const [x, y] = find(g, PLANE, OPEN);
  assert.equal(b.moveAnt(0, u, pt(x, y).x, pt(x, y).y), false, "not an ant underground");
});

test("the no-entry paint lays every colony's 'no entry', topped up as it fades, and undo takes it off", () => {
  const g = game(1);
  const b = new Builder(g);
  const [x, y] = openRow(g);
  b.begin();
  b.apply({ tool: "noEntry", layer: PLANE, points: [pt(x, y), pt(x + 3, y)] }, true);
  b.apply({ tool: "noEntry", layer: PLANE, points: [pt(x + 3, y), pt(x + 6, y)] }, true);
  assert.equal(g.crayons.length, 1, "one line for the drag");
  assert.equal(g.crayons[0]!.channel, "noEntry");
  assert.equal(g.crayons[0]!.colony, -1);
  for (const c of g.colonies) {
    const ph = c.layers[PLANE]!.ph;
    assert.ok(ph.fields.noEntry.get(x + 3, y) >= BUILD.crayonLevel - 1e-6, `colony ${c.params.nest}'s no entry`);
    assert.equal(ph.fields.food.get(x + 3, y), 0, "no food trail");
    assert.ok(ph.live("noEntry"));
  }
  for (let k = 0; k < 30 * 10; k++) g.tick(1 / 30);
  const level = crayonLevel(g.crayons[0]!.age);
  assert.ok(g.colonies[1]!.layers[PLANE]!.ph.fields.noEntry.get(x + 3, y) >= level - 0.2, "topped up");
  assert.ok(b.undo());
  assert.equal(g.crayons.length, 0);
  // What diffusion carried past the line's level during play fades by itself; below FAINT, no ant senses it.
  for (const c of g.colonies) assert.ok(c.layers[PLANE]!.ph.fields.noEntry.get(x + 3, y) < FAINT);
});

test("painted 'no entry' is read at NO_ENTRY_PAINTED while noEntryAvoid is 0; with no paint the field never wakes (the turn: builderSign.test.ts)", () => {
  assert.equal(NO_ENTRY_PAINTED, 4);
  // The colonies lay none of their own: a game with no paint never wakes the field.
  const g = game(20);
  for (let k = 0; k < 30 * 20; k++) g.tick(1 / 30);
  for (const c of g.colonies) {
    assert.equal(c.params.noEntryAvoid, 0);
    assert.equal(c.layers[PLANE]!.ph.live("noEntry"), false, "no paint, no field");
  }
});

test("watch: sugar found, then gone; a followed crayon line; a moved ant home, and one lost; each said once", () => {
  const g = game(30);
  const b = new Builder(g);
  const c = g.colonies[0]!;
  const i = planeAnt(g, 10);
  const map = g.layers[PLANE] as WorldMap;
  const [x, y] = find(g, PLANE, OPEN, [0, 0], 6);
  b.apply({ tool: "sugar", layer: PLANE, points: [pt(x, y)] });
  assert.deepEqual(b.watch(), []);
  takeFoodCell(map, x, y);
  assert.deepEqual(b.watch(), [{ kind: "foodFound", tool: "sugar" }]);
  assert.deepEqual(b.watch(), [], "said once");
  for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) while (takeFoodCell(map, xx, yy));
  assert.deepEqual(b.watch(), [{ kind: "foodGone", tool: "sugar" }]);
  // A crayon line with three of its colony's ants on it.
  const [lx, ly] = find(g, PLANE, OPEN, [0, y + 10], 6);
  b.apply({ tool: "crayon", layer: PLANE, colony: 0, points: [pt(lx, ly), pt(lx + 4, ly)] });
  const on = [...Array(c.n).keys()].filter((j) => c.alive[j] && c.layer[j] === PLANE && j !== i).slice(0, FOLLOWED_AT);
  on.forEach((j, k) => c.putAnt(j, PLANE, pt(lx + k, ly).x, pt(lx + k, ly).y));
  const ev = b.watch();
  assert.equal(ev.length, 1);
  assert.equal(ev[0]!.kind, "lineFollowed");
  assert.deepEqual(b.watch(), [], "said once");
  // A moved ant that goes down a hole is home; one that dies is lost.
  const [mx, my] = find(g, PLANE, OPEN, [0, ly + 10], 6);
  assert.ok(b.moveAnt(0, i, pt(mx, my).x, pt(mx, my).y));
  for (let k = 0; k < 30 * 2; k++) g.tick(1 / 30);
  if (c.layer[i] === PLANE && c.alive[i]) c.layer[i] = CURTAIN; // as if it went down its hole
  const home = b.watch().find((e) => e.kind === "antHome");
  assert.ok(home && home.kind === "antHome" && home.seconds >= 2 - 1e-6, JSON.stringify(home));
  const j = [...Array(c.n).keys()].find((k) => c.alive[k] && c.layer[k] === PLANE)!;
  assert.ok(b.moveAnt(0, j, pt(mx, my).x, pt(mx, my).y));
  c.alive[j] = 0;
  assert.deepEqual(
    b.watch().filter((e) => e.kind === "antLost"),
    [{ kind: "antLost", colony: 0 }],
  );
});

test("watch says nothing of a move undone, and nothing of a line fewer than FOLLOWED_AT follow (review of #229, S3)", () => {
  const g = game(30);
  const b = new Builder(g);
  const c = g.colonies[0]!;
  const i = planeAnt(g, 10);
  const [x, y] = openRow(g);
  assert.ok(b.moveAnt(0, i, pt(x, y).x, pt(x, y).y));
  assert.ok(b.undo());
  c.layer[i] = CURTAIN; // as if it went down a hole: not "home", the move was undone
  assert.deepEqual(b.watch(), []);
  b.apply({ tool: "crayon", layer: PLANE, colony: 0, points: [pt(x, y), pt(x + 6, y)] });
  const two = [...Array(c.n).keys()].filter((j) => c.alive[j] && c.layer[j] === PLANE).slice(0, FOLLOWED_AT - 1);
  two.forEach((j, k) => c.putAnt(j, PLANE, pt(x + k, y).x, pt(x + k, y).y));
  assert.deepEqual(
    b.watch().filter((e) => e.kind === "lineFollowed"),
    [],
    `${FOLLOWED_AT - 1} ants are not a following`,
  );
});

test("watch says nothing of a build undone", () => {
  const g = game(1);
  const b = new Builder(g);
  const [x, y] = find(g, PLANE, OPEN, [0, 0], 6);
  b.apply({ tool: "sugar", layer: PLANE, points: [pt(x, y)] });
  assert.ok(b.undo());
  assert.deepEqual(b.watch(), []);
});
