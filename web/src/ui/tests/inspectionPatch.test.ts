import { test } from "node:test";
import assert from "node:assert/strict";
import { cellOf, CELL, cellKey, centreX, centreY, CURTAIN, PLANE, STRIP, nx, ny } from "../../colony/index.ts";
import { buildGame } from "../useColony.ts";
import { SensedMap } from "../fungusSight.ts";
import { inspectPatch } from "../inspectionPatch.ts";
import { buildPatchTerrain, InspectionPatchRenderer, patchPoint } from "../drawInspectionPatch.ts";

const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 });
const sensed = new SensedMap(),
  trails = { food: true, home: true };
const patch = (layer = PLANE, gx = 50, gy = 50) => inspectPatch(g, sensed, layer, centreX(gx, gy), centreY(gy), trails);
const fakeContext = () =>
  new Proxy({ drawImage: () => {} }, { get: (o, k) => Reflect.get(o, k) ?? (() => {}) }) as unknown as CanvasRenderingContext2D;
const canvas = () => ({ width: 0, height: 0, getContext: () => fakeContext() }) as unknown as HTMLCanvasElement;

test("the below selection contacts the back plane and is drawn before foreground occlusion", () => {
  const p = patch(CURTAIN);
  let path: number[][] = [],
    lastStroke: number[][] = [];
  const order: string[] = [];
  const ctx = Object.assign(fakeContext(), {
    beginPath: () => {
      path = [];
    },
    lineTo: (...point: number[]) => {
      path.push(point);
    },
    stroke: () => {
      lastStroke = path.slice();
      order.push("stroke");
    },
    drawImage: () => {
      order.push("image");
    },
  });
  new InspectionPatchRenderer(canvas).draw(ctx, p, {}, 384, 320, { scents: false, markers: false });
  assert.equal(lastStroke.length, 6);
  assert.deepEqual(lastStroke[0], patchPoint("below", 384, 320, 0.5, 0.5 / Math.sqrt(3), 0.025));
  assert.equal(order.at(-1), "image", "solid foreground is painted after the back-plane outline");
});

test("one selected cell and precisely its six game neighbours, with centre-only counts", () => {
  const c = g.colonies[0];
  c.alive.fill(0);
  for (let i = 0; i < 3; i++) {
    c.alive[i] = 1;
    c.layer[i] = PLANE;
  }
  c.x[0] = centreX(50, 50);
  c.y[0] = centreY(50);
  c.x[1] = c.x[2] = centreX(51, 50);
  c.y[1] = c.y[2] = centreY(50);
  const p = patch();
  assert.equal(p.cells.length, 7);
  assert.equal(new Set(p.cells.map((c) => cellKey(...c.state.cell))).size, 7);
  assert.equal(p.selected, p.cells[0].state);
  assert.equal(p.selected.ants.length, 1);
  assert.equal(
    p.cells.slice(1).reduce((n, c) => n + c.state.ants.length, 0),
    2,
  );
  for (let d = 0; d < 6; d++) assert.deepEqual(p.cells[d + 1].state.cell, [nx(50, 50, d), ny(50, d)]);
});

test("crossing into a neighbour changes centre counts without a position jump or duplicate actor", () => {
  const c = g.colonies[0];
  c.alive.fill(0);
  c.alive[0] = 1;
  c.layer[0] = PLANE;
  c.x[0] = centreX(50, 50) + 0.49;
  c.y[0] = centreY(50);
  const a = patch();
  c.x[0] += 0.02;
  const b = patch();
  const positions = (p: ReturnType<typeof patch>) =>
    p.cells.flatMap((c) => c.state.ants.map((a) => ({ x: c.x + a.x, y: c.y + a.y, gen: a.gen })));
  assert.equal(a.selected.ants.length, 1);
  assert.equal(b.selected.ants.length, 0);
  assert.equal(positions(a).length, 1);
  assert.equal(positions(b).length, 1);
  assert.ok(Math.abs(positions(b)[0].x - positions(a)[0].x - 0.02) < 1e-4);
  assert.equal(positions(a)[0].gen, positions(b)[0].gen);
});

test("negative curtain columns and map-edge slots use actual bounds, not invented rock", () => {
  const map = g.world!.curtain;
  assert.ok(map.x0 < 0);
  const p = patch(CURTAIN, map.x0, STRIP + 5);
  assert.equal(p.mode, "below");
  assert.equal(p.cells.length, 7);
  for (const c of p.cells)
    assert.equal(
      c.valid,
      c.state.cell[0] >= map.x0 && c.state.cell[0] < map.x0 + map.size.w && c.state.cell[1] >= 0 && c.state.cell[1] < map.size.h,
    );
  assert.ok(p.cells.some((c) => !c.valid));
  const edge = patch(PLANE, 0, 0);
  assert.ok(edge.cells.some((c) => !c.valid));
});

test("surface strip remains a projected boundary; sky is never given an excavated rear wall", () => {
  const col = g.colonies[0].holeCells[0].col;
  const p = patch(CURTAIN, col, STRIP);
  assert.equal(p.cells[0].surfaceStrip, true);
  assert.equal(p.cells[0].state.place.ground, "air");
  assert.equal(p.cells[0].surfaceEntrance, true);
  assert.ok(p.cells[0].projectedGround);
  const sky = patch(CURTAIN, col, STRIP - 3);
  assert.equal(buildPatchTerrain(sky).length, 0);
});

test("an all-open underground patch has a continuous recessed back, with no solid front walls", () => {
  const p = patch(CURTAIN, 0, STRIP + 6);
  for (const c of p.cells) {
    c.valid = true;
    c.surfaceStrip = false;
    c.state.place.ground = "open";
  }
  const faces = buildPatchTerrain(p);
  assert.ok(faces.length > 0);
  assert.ok(faces.every((f) => !f.front && f.kind === "back"));
  assert.ok(faces.every((f) => f.points.every((v) => v[1] >= 1.08 - 1e-9)));
  p.cells[1].state.place.ground = "rock";
  assert.ok(buildPatchTerrain(p).some((f) => f.front && f.kind === "rock"));
});

test("terrain colours retain north/south cell identity in the surface camera", () => {
  const p = patch();
  for (const c of p.cells) {
    c.valid = true;
    c.state.place.ground = "open";
  }
  p.cells[5].state.place.ground = "rock";
  const rock = buildPatchTerrain(p).filter((f) => f.kind === "rock");
  assert.ok(rock.length > 0);
  for (const f of rock) {
    const center = f.points.reduce((a, v) => [a[0] + v[0] / 4, a[1] + v[1] / 4, a[2] + v[2] / 4], [0, 0, 0]);
    assert.ok(center[1] >= -0.1, "north maps to positive Blender Y");
  }
});

test("renderer includes every contextual worker and caches terrain only until it changes", () => {
  const p = patch();
  for (const c of p.cells) {
    c.valid = true;
    c.state.place.ground = "open";
    c.state.ants = [];
    c.state.queens = [];
    c.state.brood = [0, 0, 0];
    c.state.fallen = 0;
  }
  const ant = { k: 0, i: 0, gen: 1, x: 0, y: 0, heading: 0, carrying: false, quality: 1, infected: false };
  p.selected.ants = Array.from({ length: 12 }, (_, i) => ({ ...ant, i, x: i * 0.01 }));
  p.cells[1].state.ants = [{ ...ant, i: 20 }];
  const r = new InspectionPatchRenderer(canvas),
    ctx = fakeContext(),
    images = { surface: {} as CanvasImageSource, lifecycle: {} as CanvasImageSource };
  const a = r.draw(ctx, p, images, 384, 320);
  assert.equal(a.selectedWorkers, 12);
  assert.equal(a.contextWorkers, 1);
  assert.equal(a.drawnWorkers, 13);
  assert.equal(a.terrainCacheHit, false);
  p.selected.ants[0].x += 0.01;
  assert.equal(r.draw(ctx, p, images, 384, 320).terrainCacheHit, true);
  p.cells[2].state.place.ground = "rock";
  assert.equal(r.draw(ctx, p, images, 384, 320).terrainCacheHit, false);
  const x = patchPoint("below", 384, 320, 0, 0),
    y = patchPoint("below", 384, 320, 0, 1);
  assert.ok(y[1] > x[1]);
});

test("inspection patches preserve ant arrays, brood, and terrain while sampling", () => {
  const c = g.colonies[0],
    before = { x: [...c.x], y: [...c.y], alive: [...c.alive], gen: [...c.gen], brood: JSON.stringify(c.brood.items) };
  patch();
  patch(CURTAIN, 0, STRIP + 5);
  assert.deepEqual([...c.x], before.x);
  assert.deepEqual([...c.y], before.y);
  assert.deepEqual([...c.alive], before.alive);
  assert.deepEqual([...c.gen], before.gen);
  assert.equal(JSON.stringify(c.brood.items), before.brood);
  cellOf(c.x[0], c.y[0]);
  assert.equal(CELL.length, 2);
});

test("surface rocks rise above ants and adjoining cells have no internal wall", () => {
  const p = patch();
  for (const c of p.cells) {
    c.valid = true;
    c.state.place.ground = "open";
  }
  p.cells[0].state.place.ground = p.cells[1].state.place.ground = "rock";
  const faces = buildPatchTerrain(p).filter((f) => f.kind === "rock");
  assert.equal(Math.max(...faces.flatMap((f) => f.points.map((p) => p[2]))), 1);
  assert.ok(faces.some((f) => f.normal[2] === 1 && f.points.every((p) => p[2] === 1)));
  assert.ok(
    !faces.some((f) => f.normal[0] !== 0 && f.points.every((p) => Math.abs(p[0] - 0.5) < 1e-8 && Math.abs(p[1]) < 0.2 && p[2] > 0)),
    "no exposed face inside the joined rock mass",
  );
});

test("surface walls occlude a rear worker but a foreground worker is painted over the wall", () => {
  const p = patch();
  for (const c of p.cells) {
    c.valid = true;
    c.state.place.ground = "open";
    c.state.ants = [];
    c.state.queens = [];
    c.state.place.food = 0;
    c.state.fallen = 0;
    c.state.brood = [0, 0, 0];
  }
  p.cells[0].state.place.ground = "rock";
  const worker = { k: 0, i: 0, gen: 1, x: 0, y: 0, heading: 0, carrying: false, quality: 1, infected: false };
  p.cells[0].state.ants = [
    { ...worker, y: -1.5 },
    { ...worker, i: 1, y: 1.5 },
  ];
  const order: string[] = [];
  const image = {} as CanvasImageSource;
  const ctx = Object.assign(fakeContext(), {
    fill: () => order.push("wall"),
    drawImage: (source: CanvasImageSource) => {
      if (source === image) order.push("ant");
    },
  });
  new InspectionPatchRenderer(canvas).draw(ctx, p, { surface: image }, 384, 320, { scents: false, markers: false });
  const ants = order.flatMap((value, i) => (value === "ant" ? [i] : []));
  const walls = order.flatMap((value, i) => (value === "wall" ? [i] : []));
  assert.equal(ants.length, 2);
  // Empty leaf paths may fill before actors; actual elevated walls fill between the two ants.
  assert.ok(walls.some((i) => i > ants[0] && i < ants[1]));
  assert.ok(ants[1] > Math.max(...walls));
});
