import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import lifecycleLayout from "../../assets/inspection/lifecycle-manifest.json" with { type: "json" };
import { APHID, HYPHA_ROOT, Hyphae, cellKey, centreX, centreY, PLANE, CURTAIN, type Fungus } from "../../colony/index.ts";
import { inspectCell } from "../cellInspection.ts";
import { inspectionPoint, drawCellInspection } from "../drawCellInspection.ts";
import { buildGame } from "../useColony.ts";
import { SensedMap } from "../fungusSight.ts";
const game = () => buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 });
const trails = { food: true, home: true };

test("oversized lifecycle frames preserve world scale and match the shipped atlas dimensions", () => {
  const data = readFileSync(new URL("../../assets/inspection/inspection-lifecycle.png", import.meta.url));
  assert.equal(data.readUInt32BE(16), lifecycleLayout.width);
  assert.equal(data.readUInt32BE(20), lifecycleLayout.height);
  const g = game(),
    state = inspectCell(g, new SensedMap(), PLANE, centreX(50, 50), centreY(50), trails);
  state.place = { ...state.place, ground: "open", food: 0, hypha: false, spores: false, mound: 0, hole: -1 };
  state.ants = [];
  state.queens = [{ k: 0, x: 0, y: 0, alive: true, infected: false }];
  state.brood = [0, 0, 0];
  state.fallen = 0;
  const calls: unknown[][] = [],
    ctx = { clearRect: () => {}, drawImage: (...args: unknown[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
  drawCellInspection(ctx, {} as CanvasImageSource, state, 384, 320, false, {} as CanvasImageSource);
  assert.equal(calls.length, 2);
  assert.equal((calls[1][7] as number) / lifecycleLayout.worldFrame, 256 / 1.5, "extra frame padding must not shrink the queen");
});

test("queens keep recorded positions and alive status, and appear only on their home layer", () => {
  const g = game(),
    c = g.colonies[0],
    s = new SensedMap(),
    x = centreX(50, 50),
    y = centreY(50);
  assert.ok(c.queen);
  c.queen.x = x + 0.1;
  c.queen.y = y;
  c.queen.alive = false;
  const p = inspectCell(g, s, c.home, x, y, trails);
  assert.equal(p.queens.length, 1);
  assert.equal(p.queens[0].x, c.queen.x - x);
  assert.equal(p.queens[0].alive, false);
  assert.equal(inspectCell(g, s, PLANE, x, y, trails).queens.length, 0);
});

test("loose brood is counted by stage; held brood follows the actual carrier across layers without floor duplication", () => {
  const g = game(),
    c = g.colonies[0],
    s = new SensedMap(),
    x = centreX(50, 50),
    y = centreY(50);
  c.brood.items.length = 0;
  for (const stage of [0, 1, 2] as const) {
    const b = c.brood.add(50, 50, -1);
    b.stage = stage;
  }
  const held = c.brood.add(50, 50, -1);
  held.stage = 2;
  held.held = 0;
  c.alive[0] = 1;
  c.x[0] = x;
  c.y[0] = y;
  c.layer[0] = c.home;
  c.broodHeld[0] = 1;
  c.carrying[0] = 0;
  c.pellet[0] = 0;
  const floor = inspectCell(g, s, c.home, x, y, trails);
  assert.deepEqual(floor.brood, [1, 1, 1]);
  assert.equal(floor.ants.find((a) => a.i === 0)?.broodStage, 2);
  c.layer[0] = PLANE;
  const above = inspectCell(g, s, PLANE, x, y, trails);
  assert.deepEqual(above.brood, [0, 0, 0]);
  assert.equal(above.ants.find((a) => a.i === 0)?.broodStage, 2);
  assert.equal(held.held, 0);
  assert.equal(c.brood.items.length, 4, "reading never moves or removes brood");
});

test("fallen, held and buried workers stay distinct and respect corpse layer defaults", () => {
  const g = game(),
    c = g.colonies[0],
    s = new SensedMap(),
    x = centreX(50, 50),
    y = centreY(50);
  c.corpses.length = 0;
  c.corpses.push(
    { x: 50, y: 50, held: -1, died: 0, load: 0, strain: 0 },
    { x: 50, y: 50, held: -1, died: 0, load: 0, strain: 0, layer: PLANE },
    { x: 50, y: 50, held: 0, died: 0, load: 0, strain: 0, layer: PLANE },
  );
  c.midden.set(cellKey(50, 50), 7);
  const above = inspectCell(g, s, PLANE, x, y, trails),
    below = inspectCell(g, s, c.home, x, y, trails);
  assert.equal(above.fallen, 1);
  assert.equal(below.fallen, 1);
  assert.equal(above.buried, 7);
  assert.equal(below.buried, 0);
  assert.equal(c.corpses.length, 3);
});

test("floor brood and fallen bodies use grouped icons, leaving exact counts in the state", () => {
  const g = game(),
    state = inspectCell(g, new SensedMap(), PLANE, centreX(50, 50), centreY(50), trails);
  state.place = { ...state.place, ground: "open", food: 0, hypha: false, spores: false, mound: 0, hole: -1 };
  state.ants = [];
  state.queens = [];
  state.brood = [8, 3, 0];
  state.fallen = 5;
  const calls: unknown[][] = [],
    ctx = { clearRect: () => {}, drawImage: (...args: unknown[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
  drawCellInspection(ctx, {} as CanvasImageSource, state, 384, 320, false, {} as CanvasImageSource);
  assert.equal(calls.length, 4, "ground, two brood stage icons and one fallen-worker icon");
  assert.deepEqual(state.brood, [8, 3, 0]);
  assert.equal(state.fallen, 5);
});

test("inspection includes all occupants at their real offsets, excludes other layers and dead slots, and writes no ant arrays", () => {
  const g = game(),
    c = g.colonies[0],
    gx = 50,
    gy = 50,
    x = centreX(gx, gy),
    y = centreY(gy);
  c.alive.fill(0);
  for (let i = 0; i < 14; i++) {
    c.alive[i] = 1;
    c.x[i] = x + (i % 3) * 0.03;
    c.y[i] = y + (i % 4) * 0.02;
    c.layer[i] = PLANE;
  }
  c.layer[12] = CURTAIN;
  c.alive[13] = 0;
  const before = [...c.x, ...c.y, ...c.gen, ...c.alive, ...c.layer];
  const p = inspectCell(g, new SensedMap(), PLANE, x, y, trails);
  assert.equal(p.ants.length, 12, "no occupancy cap or representative ant");
  assert.deepEqual(p.cell, [gx, gy]);
  assert.equal(p.ants[1].x, c.x[1] - x);
  assert.deepEqual([...c.x, ...c.y, ...c.gen, ...c.alive, ...c.layer], before);
});

test("inspection cannot expose an unsensed or disabled trail", () => {
  const g = game(),
    s = new SensedMap(),
    x = centreX(50, 50),
    y = centreY(50);
  g.colonies[0].layers[PLANE].ph.fields.food.set(50, 50, 100);
  const p = inspectCell(g, s, PLANE, x, y, trails);
  assert.equal(p.place.foodTrail, 0);
  assert.equal(inspectCell(g, s, PLANE, x, y, { food: false, home: false }).place.foodTrail, 0);
});

test("aphids are read as layer-specific aggregate density and disappear at clump end", () => {
  const g = game(),
    s = new SensedMap(),
    x = centreX(50, 50),
    y = centreY(50);
  const c = { layer: PLANE, cells: [50, 50, 51, 50], start: 6, eaten: 0, age: 0, owed: 0 };
  assert.equal(inspectCell(g, s, PLANE, x, y, trails, [c]).aphidDensity, 3);
  assert.equal(inspectCell(g, s, CURTAIN, x, y, trails, [c]).aphidDensity, 0);
  c.age = APHID.endAt;
  assert.equal(inspectCell(g, s, PLANE, x, y, trails, [c]).aphidDensity, 0);
});

test("mycelium uses parent, child and fusion connections; a lone root invents no branches", () => {
  const g = game(),
    s = new SensedMap(),
    x = centreX(50, 50),
    y = centreY(50),
    key = cellKey(50, 50),
    h = new Hyphae();
  h.addCell(50, 50);
  const f = {
    spores: g.fungus.spores,
    sporesOn: (l: number) => g.fungus.sporesOn(l),
    hyphaeOn: () => h,
    stalksOn: () => [key],
  } as unknown as Fungus;
  const world = { colonies: g.colonies, world: g.world, fungus: f };
  assert.deepEqual(inspectCell(world, s, PLANE, x, y, trails).threads, []);
  const west = cellKey(49, 50),
    east = cellKey(51, 50),
    north = cellKey(50, 49);
  h.parent.set(key, west);
  h.parent.set(west, HYPHA_ROOT);
  h.parent.set(east, key);
  h.fusions.push(key, north);
  const p = inspectCell(world, s, PLANE, x, y, trails);
  assert.equal(p.threads.length, 3);
  assert.ok(p.stalk);
  assert.ok(p.threads.some(([dx, dy]) => dx === -1 && dy === 0));
  assert.ok(p.threads.some(([dx, dy]) => dx === 1 && dy === 0));
});

test("projection and sprite drawing share Blender anchors and do not cap a crowded cell", () => {
  assert.deepEqual(inspectionPoint(0, 0), [0, 0]);
  assert.ok(inspectionPoint(0, 0, 1)[1] < 0);
  const g = game(),
    state = inspectCell(g, new SensedMap(), PLANE, centreX(50, 50), centreY(50), trails);
  state.place = { ...state.place, ground: "open", food: 0, spores: false, hypha: false, mound: 0, hole: -1 };
  state.ants = Array.from({ length: 12 }, (_, i) => ({
    k: 0,
    i,
    gen: 1,
    x: i * 0.01,
    y: 0,
    heading: 0,
    carrying: false,
    quality: 1,
    infected: false,
  }));
  const draws: unknown[][] = [];
  const ctx = { clearRect: () => {}, drawImage: (...a: unknown[]) => draws.push(a) } as unknown as CanvasRenderingContext2D;
  drawCellInspection(ctx, {} as CanvasImageSource, state, 384, 320, false);
  assert.equal(draws.length, 13, "one ground tile and every ant");
  assert.ok((draws[1][5] as number) < (draws.at(-1)![5] as number), "real relative positions remain distinct");
});
