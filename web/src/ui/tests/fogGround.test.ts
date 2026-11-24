import assert from "node:assert/strict";
import { test } from "node:test";
import { centreX, centreY, CHUNK, INFECTED, PLANE, ROCK, type Colony, type WorldMap } from "../../colony/index.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import type { FieldEnv } from "../field/env.ts";
import { Ground } from "../field/ground.ts";
import { GRACE, Knowledge } from "../fog/knowledge.ts";
import { SNAP } from "../fog/sources.ts";
import { SensedMap } from "../fungusSight.ts";
import { CLOSE_SPRITE_GROUND } from "../inspectionGround.ts";
import { RecordedCanvas, RecordedPath, recordingContext } from "./recordingContext.ts";

// The ground under the fog (docs/fog-of-war.md §5.1, ja-1ypq.3.1): a chunk never sensed is fog; a sensed cell paints from its snapshot, dimmed
// once nobody senses it, and a change made while it was out of sight does not show.

const THEME = {
  paperRgb: [240, 240, 240],
  inkRgb: [0, 20, 40],
  rock: [11, 12, 13],
  soil: [21, 22, 23],
  sky: [31, 32, 33],
  spoil: [41, 42, 43],
  accentRgb: [71, 72, 73],
  sporeRgb: [81, 82, 83],
  alarm: [61, 62, 63],
  trail: [51, 52, 53],
  chamber: [91, 92, 93],
} as unknown as FieldTheme;
const FOG = [0, 1, 2].map((k) => Math.round(THEME.paperRgb[k]! + (THEME.inkRgb[k]! - THEME.paperRgb[k]!) * 0.16));

let made: RecordedPath[] = [];
const env = {
  now: () => 0,
  dpr: () => 1,
  dev: false,
  reducedMotion: () => false,
  newPath: () => {
    const p = new RecordedPath();
    made.push(p);
    return p as unknown as Path2D;
  },
  newCanvas: (w: number, h: number) => new RecordedCanvas(w, h) as unknown as HTMLCanvasElement,
  sprites: () => {
    throw new Error("the ground uses no sprite");
  },
} as unknown as FieldEnv;

const cell = (x: number, y: number) => y * CHUNK + x;
const px = (img: ImageData, x: number, y: number): number[] => [...img.data.slice(cell(x, y) * 4, cell(x, y) * 4 + 4)];
const host = (gx: number, gy: number): Colony =>
  ({
    n: 1,
    params: { sensorDistance: 3 },
    alive: Uint8Array.of(1),
    load: Float32Array.of(INFECTED),
    layer: Uint8Array.of(PLANE),
    x: Float32Array.of(centreX(gx, gy)),
    y: Float32Array.of(centreY(gy)),
  }) as unknown as Colony;

function setup(fog: boolean) {
  const rock = new Uint8Array(CHUNK * CHUNK);
  rock[cell(10, 10)] = ROCK;
  const layer = (a: Uint8Array) => ({ chunk: (cx: number, cy: number) => (cx === 0 && cy === 0 ? a : undefined) }) as never;
  const m = {
    x0: 0,
    size: { w: 64, h: 64 },
    rock: layer(rock),
    food: { chunk: () => undefined },
  } as unknown as WorldMap;
  const sensed = new SensedMap();
  const knowledge = fog
    ? new Knowledge(sensed, [{ name: SNAP.rock, layer: PLANE, at: (cx, cy) => (cx === 0 && cy === 0 ? rock : undefined) }])
    : null;
  const ground = new Ground(env);
  const rec = recordingContext();
  const k = (now: number) =>
    ({
      ctx: rec.ctx,
      theme: THEME,
      d: 1,
      v: { w: 800, h: 600, dpr: 1 },
      c: { x: 32, y: 20, zoom: 16 },
      lv: PLANE,
      m,
      ext: { x0: 0, w: 64, h: 64 },
      world: undefined,
      colonies: [],
      fungus: {},
      smellAll: false,
      strip: false,
      trails: [],
      alarms: [],
      spores: { chunk: () => undefined },
      sensedLayer: sensed.layer(PLANE),
      sensedNow: now,
      fog: knowledge,
    }) as unknown as FieldCtx;
  const paint = (now: number) => {
    const cc = ground.chunkCanvas(0, 0);
    ground.paintChunk(k(now), { food: true, home: true }, 0, 0, cc, rock, false);
    return cc.img;
  };
  return { rock, sensed, paint, ground, rec, k };
}

test("a chunk nothing has sensed is fog, every cell opaque", () => {
  const { paint } = setup(true);
  const img = paint(1);
  assert.deepEqual(px(img, 10, 10), [...FOG, 255], "even a rock cell shows nothing of itself");
  assert.deepEqual(px(img, 40, 40), [...FOG, 255]);
});

test("a sensed cell paints from the truth while live, a never-sensed cell of the same chunk stays fog", () => {
  const { sensed, paint } = setup(true);
  sensed.stamp([host(10, 10)], 1);
  const img = paint(1);
  assert.deepEqual(px(img, 10, 10), [...CLOSE_SPRITE_GROUND.rock, 255], "live: as it is");
  assert.deepEqual(px(img, 50, 50), [...FOG, 255], "far from the host: unknown");
});

test("once nobody senses it a cell is dimmed, and a change made while it was out of sight does not show", () => {
  const { rock, sensed, paint } = setup(true);
  sensed.stamp([host(10, 10)], 1);
  const live = paint(1);
  const bright = px(live, 10, 10).slice(0, 3);
  rock[cell(10, 10)] = 0; // dug out while no host was near
  sensed.stamp([{ ...host(60, 60), n: 0 } as Colony], 1 + GRACE + 1);
  const img = paint(1 + GRACE + 1);
  const dim = px(img, 10, 10);
  assert.equal(dim[3], 255, "still the rock that was seen, not the open ground it became");
  assert.deepEqual(
    dim.slice(0, 3),
    bright.map((c, k) => Math.round(c * 0.6 + FOG[k]! * 0.4)),
    "dimmed towards the fog",
  );
});

test("without the fog the ground is the truth, as before", () => {
  const { paint } = setup(false);
  const img = paint(1);
  assert.deepEqual(px(img, 10, 10), [...CLOSE_SPRITE_GROUND.rock, 255]);
  assert.deepEqual(px(img, 40, 40), [0, 0, 0, 0], "open ground, clear");
});

test("the actors' cull: in the fog only where live; without it, in view alone", async () => {
  const { actorCull } = await import("../field/fogCull.ts");
  const { sensed } = setup(true);
  const fog = new Knowledge(sensed, []);
  sensed.stamp([host(10, 10)], 1);
  const fc = { fog, lv: PLANE } as unknown as FieldCtx;
  const cull = actorCull(fc, () => true);
  assert.equal(cull(centreX(10, 10), centreY(10)), true, "live");
  assert.equal(cull(centreX(50, 50), centreY(50)), false, "never sensed");
  sensed.stamp([{ ...host(60, 60), n: 0 } as Colony], 1 + GRACE + 1);
  assert.equal(cull(centreX(10, 10), centreY(10)), false, "sensed once, remembered: no ant is drawn there");
  assert.equal(actorCull({ lv: PLANE } as FieldCtx, () => false)(0, 0), false, "no fog: inView decides");
  assert.equal(actorCull({ lv: PLANE } as FieldCtx, () => true)(0, 0), true);
});

test("the paint cache: an unknown chunk is painted once, a sensed one repaints, and a remembered one is a hit at the same time", () => {
  const { sensed, paint, ground } = setup(true);
  const img = paint(1);
  img.data[0] = 7; // scribble on the buffer: a repaint would put the fog back
  paint(1);
  assert.equal(img.data[0], 7, "a second paint of an unknown chunk is the cache's");
  sensed.stamp([host(10, 10)], 1);
  paint(1);
  assert.notEqual(img.data[0], 7, "sensed: its explored bits changed, so it paints");
  const hits = ground.hits;
  paint(1);
  assert.equal(ground.hits, hits + 1, "the same inputs at the same time: a hit");
  sensed.stamp([{ ...host(60, 60), n: 0 } as Colony], 1 + GRACE + 1);
  paint(1 + GRACE + 1);
  const again = ground.hits;
  paint(1 + GRACE + 1);
  assert.equal(ground.hits, again + 1, "remembered, at the same time: a hit, not a repaint every frame");
});

test("a remembered chamber is tinted plainly: its role is not what it may be now", () => {
  const rock = new Uint8Array(CHUNK * CHUNK);
  const chamber = new Uint16Array(CHUNK * CHUNK);
  chamber[cell(10, 10)] = 1;
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, [{ name: SNAP.chamber, layer: PLANE, at: (cx, cy) => (cx === 0 && cy === 0 ? chamber : undefined) }]);
  const m = {
    x0: 0,
    size: { w: 64, h: 64 },
    rock: { chunk: () => rock },
    food: { chunk: () => undefined },
    chambers: { cell: { chunk: () => chamber }, list: [{ role: "brood" }] },
  } as unknown as WorldMap;
  const ground = new Ground(env);
  const paint = (now: number) => {
    const cc = ground.chunkCanvas(0, 0);
    const k = {
      ctx: recordingContext().ctx,
      theme: THEME,
      d: 1,
      v: { w: 800, h: 600, dpr: 1 },
      c: { x: 32, y: 20, zoom: 16 },
      lv: PLANE,
      m,
      ext: { x0: 0, w: 64, h: 64 },
      world: undefined,
      colonies: [],
      fungus: {},
      smellAll: false,
      strip: false,
      trails: [],
      alarms: [],
      spores: { chunk: () => undefined },
      sensedLayer: sensed.layer(PLANE),
      sensedNow: now,
      fog,
    } as unknown as FieldCtx;
    ground.paintChunk(k, { food: true, home: true }, 0, 0, cc, rock, false);
    return cc.img;
  };
  sensed.stamp([host(10, 10)], 1);
  assert.equal(px(paint(1), 10, 10)[3], 70, "live: the role's tint");
  sensed.stamp([{ ...host(60, 60), n: 0 } as Colony], 1 + GRACE + 1);
  assert.equal(px(paint(1 + GRACE + 1), 10, 10)[3], 55, "remembered: the plain tint (no role)");
});

test("up close, fog and remembered open ground are laid as strips, hexagons only where something shows (a phone's frame rate)", () => {
  const win = { rx0: 0, rx1: 63, ry0: 0, ry1: 40 };
  const hexes = (fog: boolean, stamp: boolean) => {
    made = [];
    const { sensed, ground, rec, k } = setup(fog);
    if (stamp) sensed.stamp([host(10, 10)], 1);
    ground.draw(k(1), { food: true, home: true }, win, 1, false);
    return {
      hex: made.reduce((n, p) => n + p.cmds.filter((c) => c.startsWith("moveTo(")).length, 0),
      strips: rec.log.filter((l) => l.startsWith("drawImage(")).length,
    };
  };
  const unknown = hexes(true, false);
  assert.equal(unknown.hex, 0, "nothing sensed: no hexagon at all");
  assert.ok(unknown.strips > 0, "the fog is laid as strips");
  const some = hexes(true, true);
  assert.ok(some.hex > 0 && some.hex < 100, `a rock cell and the like draw as hexagons, not every cell (${some.hex})`);
  assert.ok(hexes(false, false).strips === 0, "without the fog, no strips under the hexagons");
});
