import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CELL,
  ChunkLayer,
  cellAt,
  centreX,
  centreY,
  curtainLayerOf,
  Game,
  generateWorld,
  isCurtainLayer,
  lineIndexOfLayer,
  lineOfLayer,
  mapOfLayer,
  mulberry32,
  OPEN,
  oneWorldOnLines,
  PLANE,
  rockAt,
  SOIL,
  STRIP,
  type WorldMap,
} from "../../colony/index.ts";
import { inspectCell } from "../cellInspection.ts";
import { SensedMap } from "../fungusSight.ts";
import { inspectPatch } from "../inspectionPatch.ts";
import { chamberUnder, linkTarget } from "../field/hit.ts";
import { lineNear } from "../link.ts";
import { probe } from "../lens.ts";
import { statsOf } from "../stats.ts";
import { CameraRig } from "../field/rig.ts";

// The page reads every line (docs/endless-world.md §8, PRD §66 E5.1, ja-qpv.4.1): a game of two lines, layers [plane, curtain 1, curtain 2].

const SEED = 3;
const two = () =>
  new Game(oneWorldOnLines(SEED, generateWorld(SEED), [[0], [1]]), {}, mulberry32(5), [
    { antCount: 20, line: 0 },
    { antCount: 20, line: 1 },
  ]);
const trails = { food: false, home: false };

/** The first cell of a curtain's chambers, as world units. */
function chamberPoint(m: WorldMap): { x: number; y: number; colony: number } {
  for (let y = 0; y < m.size.h; y++)
    for (let x = m.x0; x < m.x0 + m.size.w; x++) {
      const id = m.chambers!.at(x, y);
      if (id >= 0) return { x: centreX(x, y), y: centreY(y), colony: m.chambers!.list[id]!.colony };
    }
  throw new Error("no chamber");
}

test("the layer helpers: a curtain's id is 1 + its line's index, and each reads that line's own map and line", () => {
  const g = two();
  const w = g.world;
  assert.equal(g.layers.length, 3);
  assert.deepEqual([PLANE, 1, 2].map(isCurtainLayer), [false, true, true]);
  assert.equal(curtainLayerOf(1), 2);
  assert.equal(lineIndexOfLayer(w, 1), 0);
  assert.equal(lineIndexOfLayer(w, 2), 1);
  assert.equal(lineIndexOfLayer(w, 9), 0, "a layer the world lacks reads as the first line");
  assert.equal(mapOfLayer(w, PLANE), w.plane);
  assert.equal(mapOfLayer(w, 1), w.lines[0]!.curtain);
  assert.equal(mapOfLayer(w, 2), w.lines[1]!.curtain);
  assert.equal(lineOfLayer(w, 2), w.lines[1]!.line);
  assert.notEqual(mapOfLayer(w, 2), w.curtain);
});

test("the lens reads layer 2's own chambers, and a hole is a nest's of the line shown", () => {
  const g = two();
  const sensed = new SensedMap();
  const c = chamberPoint(g.world.lines[1]!.curtain);
  const p = probe(g, sensed, 2, c.x, c.y, trails);
  assert.equal(p.view, "below");
  assert.equal(p.chamber!.k, 1, "colony 1 digs under line 1");
  // The same column and row on line 0's curtain is that line's ground
  const on1 = probe(g, sensed, 1, c.x, c.y, trails);
  assert.notEqual(on1.chamber?.k, 1);
  // Each colony's hole is found on its own line's curtain only, though both holes may sit at the same column
  for (const k of [0, 1]) {
    const h = g.colonies[k]!.holeCells[g.colonies[k]!.params.nest]!;
    const at = (layer: number) => probe(g, sensed, layer, centreX(h.col, h.row), centreY(h.row), trails).hole;
    assert.equal(at(curtainLayerOf(k)), k, `colony ${k}'s hole on its own curtain`);
    assert.notEqual(at(curtainLayerOf(1 - k)), k, "...and the other line's curtain has none of its own there");
  }
});

test("inspecting layer 2 reads curtain 2: the cell, its patch and its chambers", () => {
  const g = two();
  const sensed = new SensedMap();
  const m = g.world.lines[1]!.curtain;
  const c = chamberPoint(m);
  const s = inspectCell(g, sensed, 2, c.x, c.y, trails);
  m.quality = new ChunkLayer((n) => new Float32Array(n).fill(0.5), 0.5);
  assert.equal(inspectCell(g, sensed, 2, c.x, c.y, trails).quality, 0.5, "curtain 2's own food quality");
  assert.equal(s.quality, 1);
  assert.equal(s.place.chamber?.k, 1);
  const patch = inspectPatch(g, sensed, 2, c.x, c.y, trails);
  assert.equal(patch.mode, "below");
  assert.equal(patch.cells.length, 7);
  assert.equal(patch.selected.place.chamber?.k, 1);
  // A cell of the strip projects the plane under that line's column: the one of line 1 on layer 2, of line 0 on layer 1
  const [l0, l1] = g.world.lines.map((l) => l.line);
  const groundUnder = (line: typeof l0, col: number) => {
    cellAt(line!, col);
    const [px, py] = [CELL[0]!, CELL[1]!];
    const r = rockAt(g.world.plane, px, py);
    return {
      cell: `${px},${py}`,
      ground: r === OPEN ? "open" : r === SOIL ? "soil" : "rock",
      spoil: g.world.plane.spoil?.get(px, py) ?? 0,
    };
  };
  let checked = 0;
  for (let col = l1!.sMin; col <= l1!.sMax; col++) {
    if (!cellAt(l1!, col) || !cellAt(l0!, col)) continue;
    const a = groundUnder(l0, col);
    const b = groundUnder(l1, col);
    if (a.cell === b.cell) continue;
    for (const [layer, want] of [
      [1, a],
      [2, b],
    ] as const) {
      const cell = inspectPatch(g, sensed, layer, centreX(col, STRIP), centreY(STRIP), trails).cells[0]!;
      assert.equal(cell.surfaceStrip, true);
      assert.equal(cell.projectedGround, want.ground, `layer ${layer} column ${col}`);
      assert.equal(cell.projectedSpoil, want.spoil);
    }
    checked++;
  }
  assert.ok(checked > 5, `${checked} columns where the two lines lie over different plane cells`);
});

test("the stats sum food over the plane and every line's curtain", () => {
  const g = two();
  const w = g.world;
  const all = w.plane.foodTotal + w.lines[0]!.curtain.foodTotal + w.lines[1]!.curtain.foodTotal;
  assert.ok(w.lines[1]!.curtain.foodTotal > 0);
  assert.equal(statsOf(g, 0, 1).foodTotal, all);
});

test("a click on the plane over a hole picks that line; from curtain 2 the strip links back to line 1's cell", () => {
  const g = two();
  const w = g.world;
  assert.equal(lineNear(w, 0, 0, 0.001), null, "far from any line");
  w.lines.forEach((l, li) => {
    const h = l.line.holes[0]!;
    const x = centreX(h.x, h.y);
    const y = centreY(h.y);
    assert.equal(lineNear(w, x, y)?.line, li);
    const cam = { x, y, zoom: 4 };
    const vp = { w: 400, h: 300, dpr: 1 };
    const t = linkTarget(w, PLANE, cam, vp, 200, 150)!;
    assert.equal(t.view, curtainLayerOf(li), "the side view of the line clicked");
    assert.ok(t.x >= l.curtain.x0 && t.x < l.curtain.x0 + l.curtain.size.w + 1, "centred on that line's column");
    // and from that curtain's strip, back to the plane over the hole
    const back = linkTarget(w, curtainLayerOf(li), { x: t.x, y: t.y, zoom: 4 }, vp, 200, 150)!;
    assert.equal(back.view, PLANE);
    assert.equal(back.x, x);
    assert.equal(back.y, y);
  });
});

test("each line keeps its own camera, and the rig fits each line's own map", () => {
  const w = two().world;
  let shown = 1;
  const rig = new CameraRig({
    view: () => shown,
    map: (v) => mapOfLayer(w, v),
    size: () => ({ w: 400, h: 300 }),
    dpr: () => 1,
    following: () => false,
    unfollow: () => {},
  });
  rig.centreOn(1, 5, 50, { close: true });
  rig.centreOn(2, -7, 60, { close: true });
  assert.notEqual(rig.of(1), rig.of(2));
  assert.equal(rig.of(1).cam!.x, 5);
  assert.equal(rig.of(2).cam!.x, -7);
  shown = 2;
  assert.equal(rig.vc(), rig.of(2));
  assert.deepEqual(rig.extent().x0, w.lines[1]!.curtain.x0);
});

test("a chamber under the pointer on curtain 2 is named by the colony of line 1, not the one with the same nest number on line 0", () => {
  const g = two();
  const m = g.world.lines[1]!.curtain;
  const c = chamberPoint(m);
  const cam = { x: c.x, y: c.y, zoom: 4 };
  const vp = { w: 400, h: 300, dpr: 1 };
  assert.equal(chamberUnder(m, g.colonies, cam, vp, 200, 150)?.k, 1);
  const m0 = g.world.lines[0]!.curtain;
  const c0 = chamberPoint(m0);
  assert.equal(chamberUnder(m0, g.colonies, { ...cam, x: c0.x, y: c0.y }, vp, 200, 150)?.k, 0);
});
