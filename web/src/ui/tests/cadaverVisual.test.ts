import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORPSE_ROT, PLANE, CURTAIN, centreX, centreY, cellKey, type Fungus } from "../../colony/index.ts";
import { buildGame } from "../useColony.ts";
import { SensedMap } from "../fungusSight.ts";
import { inspectCell } from "../cellInspection.ts";
import { decayStage, visibleCadavers } from "../cadaverVisual.ts";
import { fungalPrimitives, FUNGAL, STALK_HEIGHT, stalkPoint } from "../fungalStructures.ts";
import { inspectionFrameScale, mapOrbit } from "../inspectionOrbit.ts";
import { tintWorkerPixels } from "../workerSprites.ts";
import bands from "../../assets/inspection-3d/abdomen-bands.json" with { type: "json" };
const game = () => buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 });
const read = (g: ReturnType<typeof game>, layer: number) =>
  inspectCell(g, new SensedMap(), layer, centreX(50, 50), centreY(50), { food: false, home: false });

test("surface deaths retain one passive cadaver without entering the undertaker list or burial totals", () => {
  const g = game(),
    c = g.colonies[0];
  c.layer[0] = PLANE;
  c.x[0] = centreX(50, 50);
  c.y[0] = centreY(50);
  const population = c.population,
    buried = c.buried,
    loose = c.corpses.length;
  c.kill(0);
  c.kill(0);
  assert.equal(c.population, population - 1);
  assert.equal(c.buried, buried);
  assert.equal(c.corpses.length, loose);
  assert.equal(c.remains.length, 1);
  assert.equal(read(g, PLANE).recentRemains, 1);
  assert.equal(read(g, PLANE).cadavers?.length, 1);
  assert.equal(read(g, CURTAIN).cadavers?.length, 0);
});

test("grounded cadavers preserve the worker's heading on either layer", () => {
  for (const layer of [PLANE, CURTAIN]) {
    const g = game(),
      c = g.colonies[0];
    c.layer[0] = layer;
    c.x[0] = centreX(50, 50);
    c.y[0] = centreY(50);
    c.heading[0] = Math.PI / 2;
    const heading = c.heading[0];
    c.kill(0);
    c.heading[0] = 0;
    c.time += CORPSE_ROT / 2;
    assert.equal(read(g, layer).cadavers?.[0].heading, heading);
    assert.equal(read(g, layer).cadavers?.[0].stage, 2);
  }
});

test("cadavers age in discrete simulation-time steps, pause on repeated reads, and expire at the existing lifetime", () => {
  const g = game(),
    c = g.colonies[0];
  c.remains.push({ x: 50, y: 50, held: -1, died: 0, load: 0, strain: 0, layer: PLANE });
  for (const [time, stage] of [
    [0, 0],
    [179.9, 0],
    [180, 1],
    [449.9, 1],
    [450, 2],
    [720, 3],
    [900, 3],
  ]) {
    c.time = time;
    const before = JSON.stringify(c.remains);
    assert.equal(read(g, PLANE).cadavers?.[0].stage, stage);
    assert.equal(read(g, PLANE).cadavers?.[0].stage, stage);
    assert.equal(JSON.stringify(c.remains), before);
  }
  c.time = CORPSE_ROT + 1;
  assert.equal(visibleCadavers(c, PLANE).length, 0);
  g.tick(1 / 30);
  assert.equal(c.remains.length, 0, "expired history is pruned by simulation ticks");
  assert.equal(decayStage(0, 20), 0, "future or restored timestamps never produce a negative stage");
});

test("carried corpses follow the carrier's stage and are not duplicated on the ground", () => {
  const g = game(),
    c = g.colonies[0];
  c.x[0] = centreX(50, 50);
  c.y[0] = centreY(50);
  c.layer[0] = PLANE;
  c.time = 500;
  c.pellet[0] = 1;
  c.corpse[0] = 1;
  c.carrying[0] = 0;
  c.corpses.push({ x: 50, y: 50, held: 0, died: 0, load: 0, strain: 0, layer: PLANE });
  const state = read(g, PLANE);
  assert.equal(state.cadavers?.length, 0);
  assert.equal(state.ants.find((a) => a.i === 0)?.corpseStage, 2);
});

test("surface corpse history survives save/load and older saves retain an empty compatible default", () => {
  const g = game(),
    c = g.colonies[0];
  c.time = 500;
  c.remains.push({ x: 50, y: 50, held: -1, died: 0, load: 0.2, strain: 0, layer: PLANE });
  const saved = c.saveState(),
    other = game();
  other.colonies[0].loadState(saved);
  assert.deepEqual(other.colonies[0].remains, c.remains);
  assert.equal(read(other, PLANE).cadavers?.[0].stage, 2);
  delete (saved.fields as Record<string, unknown>).remains;
  const legacy = game();
  legacy.colonies[0].loadState(saved);
  assert.deepEqual(legacy.colonies[0].remains, []);
});

test("recorded fungal stalks gain a cadaver anchor in legacy saves without inventing loose or buried counts", () => {
  const g = game(),
    key = cellKey(50, 50),
    f = g.fungus;
  const fungus = {
    spores: f.spores,
    sporesOn: (l: number) => f.sporesOn(l),
    hyphaeOn: () => null,
    stalksOn: (l: number) => (l === PLANE ? [key] : []),
    corpsesOn: (l: number) => new Map(l === PLANE ? [[key, 3]] : []),
    evolution: { level: () => 2 },
  } as unknown as Fungus;
  const state = inspectCell({ ...g, fungus }, new SensedMap(), PLANE, centreX(50, 50), centreY(50), { food: false, home: false });
  assert.equal(state.cadavers?.length, 1);
  assert.equal(state.cadavers?.[0].fungal, true);
  assert.equal(state.fallen, 0);
  assert.equal(state.recentRemains, 0);
  assert.equal(state.buried, 0);
});

test("decay meshes shed appendages and finish as fragments, while stalk cushions remain brown and stems curved", () => {
  const models = JSON.parse(readFileSync(new URL("../../assets/inspection-3d/models.json", import.meta.url), "utf8"));
  assert.ok(models["corpse-2"].body.positions.length < models["corpse-1"].body.positions.length);
  assert.ok(models["corpse-3"].body.positions.length < models["corpse-2"].body.positions.length / 5);
  for (let i = 0; i < 4; i++) assert.equal(models[`corpse-${i}`].band.positions.length, 0);
  const stalk = fungalPrimitives({ stalkLevel: 2 });
  assert.ok(stalk.some((p) => p.kind === "box" && p.colour === FUNGAL.rind));
  assert.ok(!stalk.some((p) => p.colour === FUNGAL.spores));
  const a = stalkPoint(0, STALK_HEIGHT[2]),
    b = stalkPoint(0.5, STALK_HEIGHT[2]),
    c = stalkPoint(1, STALK_HEIGHT[2]);
  assert.ok(Math.abs(b[0] - (a[0] + c[0]) / 2) > 0.05);
  assert.ok(c[2] > 2.7);
  assert.equal(inspectionFrameScale([[0.48, 0, 2.84]], "surface", mapOrbit()), 1);
  assert.ok(inspectionFrameScale([[0.48, 0, 2.84]], "surface", { yaw: 0, tilt: 1.15 }) > 1);
});

test("aerial abdomen bands remain visible in all tiny headings and never tint unmasked chitin", () => {
  const mask = new Uint8Array(264 * 22);
  for (let i = 0; i < bands.workerTiny.length; i += 2) mask.fill(1, bands.workerTiny[i], bands.workerTiny[i] + bands.workerTiny[i + 1]);
  for (let d = 0; d < 12; d++) {
    let n = 0;
    for (let y = 1; y <= 20; y++) for (let x = d * 22 + 1; x < d * 22 + 21; x++) n += mask[y * 264 + x];
    assert.ok(n > 0, `direction ${d} retains its band`);
  }
  const p = new Uint8ClampedArray([30, 31, 32, 255, 30, 31, 32, 255]);
  tintWorkerPixels(p, [200, 100, 20], [1, 1]);
  assert.deepEqual([...p.slice(0, 4)], [30, 31, 32, 255]);
  assert.notEqual(p[4], 30);
});
