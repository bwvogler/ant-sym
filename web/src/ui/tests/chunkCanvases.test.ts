import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHUNK,
  ChunkLayer,
  ENDLESS_HALF,
  Game,
  PLANE,
  R,
  ROCK,
  SPORE_FULL,
  gameRng,
  generateEndlessWorld,
  type WorldMap,
} from "../../colony/index.ts";
import { toScreen } from "../camera.ts";
import type { FieldCtx, FieldInputs, FieldTheme } from "../field/ctx.ts";
import type { FieldEnv } from "../field/env.ts";
import { EVICT_MARGIN, Ground, peekCell, type GroundShow } from "../field/ground.ts";
import { beginFrame, FieldRenderer, foodStage, groundStage, paperStage, type FieldParts, type FrameRefs } from "../field/renderer.ts";
import { extentOf } from "../field/rig.ts";
import { SENSED_FADE } from "../fungusSight.ts";
import { FOOD_FULL } from "../lens.ts";
import { RecordedCanvas, RecordedPath, recordingContext } from "./recordingContext.ts";

// E5.4 (ja-qpv.4.4, docs/endless-world.md §8): on an endless plane the ground's chunk canvases are dropped when far from the view, a chunk is repainted only
// when its inputs changed, no edge is drawn where the plane has none, and drawing makes no chunk the game has not made. A bounded map's ground is pinned by
// ground.test.ts, renderer.test.ts and scenes.test.ts, which this stage left as they were.

const THEME = {
  paper: "#paper",
  ink: "#ink",
  accent: "#accent",
  warn: "#warn",
  trail: [51, 52, 53],
  alarm: [61, 62, 63],
  rock: [11, 12, 13],
  soil: [21, 22, 23],
  sky: [31, 32, 33],
  spoil: [41, 42, 43],
  accentRgb: [71, 72, 73],
  paperRgb: [240, 241, 242],
  inkRgb: [10, 20, 30],
  warnRgb: [200, 100, 50],
  sporeRgb: [81, 82, 83],
  chamber: [91, 92, 93],
} as unknown as FieldTheme;
const SHOW: GroundShow = { food: true, home: true };
const WIN = (cx0: number, cx1: number, cy0 = 0, cy1 = 0) => ({
  rx0: cx0 * CHUNK,
  rx1: cx1 * CHUNK + CHUNK - 1,
  ry0: cy0 * CHUNK,
  ry1: cy1 * CHUNK + CHUNK - 1,
});
const keys = (g: Ground) => [...g.chunks.keys()].sort();

function env(canvases: RecordedCanvas[] = []): FieldEnv {
  return {
    now: () => 0,
    dpr: () => 1,
    dev: false,
    reducedMotion: () => false,
    newPath: () => new RecordedPath() as unknown as Path2D,
    newCanvas: (w, h) => {
      const c = new RecordedCanvas(w, h);
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
    sprites: () => {
      throw new Error("no sprite");
    },
  };
}

/** An endless-shaped map built by hand (the real layers, no generator): chunks exist only where `make` put them. */
function plain() {
  const rock = new ChunkLayer<Uint8Array>((n) => new Uint8Array(n), 1);
  const food = new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0);
  const m = { endless: true, x0: -ENDLESS_HALF, size: { w: 2 * ENDLESS_HALF, h: 2 * ENDLESS_HALF }, rock, food } as unknown as WorldMap;
  const make = (cx: number, cy: number) => {
    rock.put(cx, cy, new Uint8Array(CHUNK * CHUNK));
    food.put(cx, cy, new Float32Array(CHUNK * CHUNK));
  };
  return { m, rock, food, make };
}

/** A frame's context over a map: a camera and a recording canvas. */
function field(m: WorldMap, o: Partial<FieldCtx> & { cam?: { x: number; y: number; zoom: number } } = {}) {
  const rec = recordingContext();
  const { cam, ...over } = o;
  const k = {
    ctx: rec.ctx,
    theme: THEME,
    d: 1,
    v: { w: 800, h: 600, dpr: 1 },
    c: cam ?? { x: 0, y: 0, zoom: 2 },
    lv: PLANE,
    m,
    ext: { x0: m.x0, w: m.size.w, h: m.size.h, ...(m.endless ? { endless: true } : {}) },
    world: null,
    colonies: [],
    fungus: {},
    smellAll: false,
    strip: false,
    trails: [],
    alarms: [],
    spores: new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0),
    sensedLayer: null,
    sensedNow: 0,
    ...over,
  } as unknown as FieldCtx;
  const canvases: RecordedCanvas[] = [];
  return { k, ground: new Ground(env(canvases)), rec, canvases };
}

// ---- eviction ----

test("eviction: a chunk canvas more than EVICT_MARGIN chunks beyond the view is dropped, one within it kept, whichever way the camera went", () => {
  const p = plain();
  for (let cx = -30; cx <= 60; cx++) p.make(cx, 0);
  const f = field(p.m);
  f.ground.draw(f.k, SHOW, WIN(0, 3), 0, false);
  assert.deepEqual(keys(f.ground), ["0,0", "1,0", "2,0", "3,0"], "the view's chunks, and no other");
  f.ground.draw(f.k, SHOW, WIN(4, 7), 0, false);
  assert.equal(EVICT_MARGIN, 2);
  assert.deepEqual(
    keys(f.ground),
    ["2,0", "3,0", "4,0", "5,0", "6,0", "7,0"],
    "the view's, and two chunks (the margin) behind it: 0 and 1 are gone",
  );
  f.ground.draw(f.k, SHOW, WIN(-3, 0), 0, false);
  assert.deepEqual(
    keys(f.ground),
    ["-3,0", "-2,0", "-1,0", "0,0", "2,0"].sort(),
    "panning back: 2 is still within the margin of 0; 3 and the far ones are not",
  );
  const before = f.ground.chunks.get("2,0")!;
  f.ground.draw(f.k, SHOW, WIN(40, 43), 0, false);
  assert.deepEqual(keys(f.ground), ["40,0", "41,0", "42,0", "43,0"], "a jump: everything left behind is dropped");
  assert.ok(!f.ground.chunks.has("2,0"));
  f.ground.draw(f.k, SHOW, WIN(0, 3), 0, false);
  assert.notEqual(f.ground.chunks.get("2,0"), before, "a chunk that comes back is a new canvas, painted afresh");
  assert.equal(f.ground.chunks.get("2,0")!.version, 1);
});

test("eviction: the rows count too, and memory follows the view not the ground crossed (200 chunks panned, never more than the view and its margin)", () => {
  const p = plain();
  const f = field(p.m);
  let most = 0;
  for (let cx = 0; cx < 200; cx++) {
    for (let cy = -2; cy <= 2; cy++) if (p.rock.peek(cx + 3, cy) === undefined) p.make(cx + 3, cy);
    for (let cy = -2; cy <= 2; cy++) if (p.rock.peek(cx, cy) === undefined) p.make(cx, cy);
    f.ground.draw(f.k, SHOW, WIN(cx, cx + 3, -1, 1), 0, false);
    most = Math.max(most, f.ground.chunks.size);
  }
  const bound = (4 + EVICT_MARGIN) * (3 + 2 * EVICT_MARGIN);
  assert.ok(most <= bound, `${most} canvases at most, the bound is ${bound}`);
  assert.ok(f.canvases.length > 400, `many more canvases were made over the pan (${f.canvases.length}) than were ever held`);
  for (const key of f.ground.chunks.keys())
    assert.ok(Number(key.split(",")[1]) >= -3 && Number(key.split(",")[1]) <= 3, "no row beyond the margin: " + key);
  f.ground.draw(f.k, SHOW, WIN(0, 3, 50, 52), 0, false);
  assert.ok(
    [...f.ground.chunks.values()].every((c) => c.cy >= 48),
    "a jump in y drops the rows left behind",
  );
});

test("eviction: the margin is the same in rows, above and below the view", () => {
  const p = plain();
  for (let cy = -10; cy <= 10; cy++) p.make(0, cy);
  const f = field(p.m);
  const rows = () => [...f.ground.chunks.values()].map((c) => c.cy).sort((x, y) => x - y);
  f.ground.draw(f.k, SHOW, WIN(0, 0, 0, 2), 0, false);
  f.ground.draw(f.k, SHOW, WIN(0, 0, 4, 5), 0, false);
  assert.deepEqual(rows(), [2, 4, 5], "going down: row 2 is 2 rows above the view (kept), row 1 is 3 (dropped)");
  f.ground.draw(f.k, SHOW, WIN(0, 0, -3, -2), 0, false);
  assert.deepEqual(rows(), [-3, -2], "a jump up drops the rows below");
  f.ground.draw(f.k, SHOW, WIN(0, 0, -6, -5), 0, false);
  assert.deepEqual(rows(), [-6, -5, -3], "going up: row -3 is 2 rows below the view (kept), row -2 is 3 (dropped)");
});

test("the rows of a chunk past the plane's own box (above -h/2) are clear, the first row's are painted", () => {
  const p = plain();
  const half = ENDLESS_HALF / CHUNK;
  p.rock.put(0, -half, new Uint8Array(CHUNK * CHUNK).fill(ROCK));
  p.rock.put(0, -half - 1, new Uint8Array(CHUNK * CHUNK).fill(ROCK));
  const f = field(p.m);
  const paint = (cy: number) => {
    const cc = f.ground.chunkCanvas(0, cy);
    f.ground.paintChunk(f.k, SHOW, 0, cy, cc, p.rock.peek(0, cy)!, false);
    return cc.img.data[3];
  };
  assert.equal(paint(-half), 255, "the first chunk row of the plane is painted");
  assert.equal(paint(-half - 1), 0, "one row above it is past the box");
});

test("a bounded map's canvases are never evicted (its size is its bound), and its reads are the same `chunk` reads as before", () => {
  const rock = new ChunkLayer<Uint8Array>((n) => new Uint8Array(n), 1);
  const food = new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0);
  for (let cx = 0; cx < 12; cx++) {
    rock.put(cx, 0, new Uint8Array(CHUNK * CHUNK));
    food.put(cx, 0, new Float32Array(CHUNK * CHUNK));
  }
  const m = { x0: 0, size: { w: 12 * CHUNK, h: CHUNK }, rock, food } as unknown as WorldMap;
  const f = field(m);
  (f.k as { ext: unknown }).ext = { x0: 0, w: 12 * CHUNK, h: CHUNK };
  f.ground.draw(f.k, SHOW, WIN(0, 1), 0, false);
  f.ground.draw(f.k, SHOW, WIN(10, 11), 0, false);
  assert.equal(f.ground.chunks.size, 4, "0, 1, 10 and 11 all still held");
});

test("a chunk the game has not made gets no canvas and is not made; one it let go of loses its canvas", () => {
  const p = plain();
  p.make(0, 0);
  p.make(2, 0);
  const f = field(p.m);
  const count = () => [p.rock.count, p.food.count];
  const before = count();
  f.ground.draw(f.k, SHOW, WIN(0, 2), 0, false);
  assert.deepEqual(keys(f.ground), ["0,0", "2,0"], "chunk 1 was never made: no canvas");
  assert.deepEqual(count(), before, "and drawing made none");
  p.rock.drop(2, 0); // the game frees far ground (E4.4b)
  f.ground.draw(f.k, SHOW, WIN(0, 2), 0, false);
  assert.deepEqual(keys(f.ground), ["0,0"], "its canvas goes with it");
  assert.deepEqual(count(), [before[0]! - 1, before[1]!], "and nothing was made again");
});

// ---- dirty chunks ----

test("dirty flags: a frame over unchanged chunks paints none; a change repaints exactly that chunk", () => {
  const p = plain();
  for (let cx = 0; cx < 4; cx++) p.make(cx, 0);
  const f = field(p.m);
  const versions = () => [...f.ground.chunks.values()].map((c) => c.version);
  f.ground.beginFrame();
  f.ground.draw(f.k, SHOW, WIN(0, 3), 0, false);
  assert.equal(f.ground.paints, 4, "the first frame paints every chunk");
  assert.deepEqual(versions(), [1, 1, 1, 1]);
  for (let frame = 0; frame < 5; frame++) {
    f.ground.beginFrame();
    f.ground.draw(f.k, SHOW, WIN(0, 3), 0, false);
    assert.deepEqual([f.ground.paints, f.ground.hits], [0, 4], `frame ${frame}: nothing changed, nothing repainted`);
  }
  assert.deepEqual(versions(), [1, 1, 1, 1]);
  // food taken or put down in chunk 2
  p.food.peek(2, 0)![5] = 3;
  f.ground.beginFrame();
  f.ground.draw(f.k, SHOW, WIN(0, 3), 0, false);
  assert.deepEqual([f.ground.paints, f.ground.hits], [1, 3]);
  assert.deepEqual(versions(), [1, 1, 2, 1], "chunk 2 only");
  // dug (rock to open or filled) in chunk 0
  p.rock.peek(0, 0)![9] = ROCK;
  // spores shown in chunk 3
  f.k.spores.ensure(3, 0)[7] = SPORE_FULL;
  f.ground.beginFrame();
  f.ground.draw(f.k, SHOW, WIN(0, 3), 0, false);
  assert.deepEqual([f.ground.paints, f.ground.hits], [2, 2]);
  assert.deepEqual(versions(), [2, 1, 2, 2], "chunks 0 and 3");
  // the theme changed (the shell's retheme) repaints every one
  f.ground.clearTiles();
  f.ground.beginFrame();
  f.ground.draw(f.k, SHOW, WIN(0, 3), 0, false);
  assert.equal(f.ground.paints, 4);
});

test("dirty flags: time passing repaints a chunk only where it moves the picture (a scent to fade), not for a chunk a host sensed that shows no trail", () => {
  const p = plain();
  p.make(0, 0);
  p.make(1, 0);
  const sensed = new ChunkLayer<Float32Array>((n) => new Float32Array(n), -Infinity);
  sensed.ensure(0, 0).fill(100);
  sensed.ensure(1, 0).fill(100);
  const trail = new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0);
  trail.ensure(1, 0)[3] = FOOD_FULL; // a food trail in chunk 1 only
  const home = new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0);
  const f = field(p.m, { sensedLayer: sensed, trails: [{ food: trail, home, odour: 0.5 }] as never, sensedNow: 100 });
  f.ground.beginFrame();
  f.ground.draw(f.k, SHOW, WIN(0, 1), 0, false);
  assert.equal(f.ground.paints, 2);
  for (const now of [101, 102, 103]) {
    f.k.sensedNow = now;
    f.ground.beginFrame();
    f.ground.draw(f.k, SHOW, WIN(0, 1), 0, false);
    assert.deepEqual(
      [f.ground.paints, f.ground.hits],
      [1, 1],
      `at ${now}: the chunk with a trail fades, so it repaints; chunk 0 has nothing to fade`,
    );
    assert.equal(f.ground.chunks.get("0,0")!.version, 1, "chunk 0 stayed as painted");
  }
});

test("the faded chunk (ja-23io): a chunk whose newest mark is SENSED_FADE old reads no trail and repaints no more, and its pixels are the unskipped ones", () => {
  const p = plain();
  p.make(0, 0);
  const sensed = new ChunkLayer<Float32Array>((n) => new Float32Array(n), -Infinity);
  sensed.ensure(0, 0).fill(100); // sensed at 100
  const reads: string[] = [];
  const spy = (name: string) => {
    const l = new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0);
    l.ensure(0, 0).fill(FOOD_FULL);
    const chunk = l.chunk.bind(l);
    l.chunk = (cx: number, cy: number) => (reads.push(name), chunk(cx, cy));
    return l;
  };
  const trails = [{ food: spy("food"), home: spy("home"), odour: 0.5 }] as never;
  const alarm = spy("alarm");
  const at = (now: number, newest: number | undefined) => {
    const f = field(p.m, {
      sensedLayer: sensed,
      trails,
      alarms: [alarm] as never,
      sensedNow: now,
      sensedNewest: newest === undefined ? undefined : () => newest,
    });
    reads.length = 0;
    f.ground.draw(f.k, SHOW, WIN(0, 0), 0, false);
    return { f, reads: [...reads] };
  };
  const fresh = at(100 + SENSED_FADE / 2, 100);
  assert.deepEqual(fresh.reads.sort(), ["alarm", "food", "home"], "a fresh chunk reads its scent");
  const faded = at(100 + SENSED_FADE, 100);
  assert.deepEqual(faded.reads, [], "a faded one reads none");
  const unskipped = at(100 + SENSED_FADE, undefined); // no newest known: every cell is read, and every cell's sight is 0
  assert.equal(unskipped.reads.length, 3);
  const px = (c: { f: ReturnType<typeof field> }) => [...c.f.ground.chunks.get("0,0")!.img.data];
  assert.deepEqual(px(faded), px(unskipped), "the same pixels either way");
  // and it repaints no more as time goes on
  faded.f.k.sensedNow = 100 + SENSED_FADE * 3;
  faded.f.ground.beginFrame();
  faded.f.ground.draw(faded.f.k, SHOW, WIN(0, 0), 0, false);
  assert.deepEqual([faded.f.ground.paints, faded.f.ground.hits], [0, 1]);
});

// ---- no false edge ----

/** A frame of the ground stages over an endless map; the log is the canvas's. */
function frame(f: ReturnType<typeof field>, extra: Partial<FieldCtx> = {}) {
  Object.assign(f.k, extra);
  const sprites = {
    resource: { get: () => ({ toString: () => "resource" }) },
    nest: { get: () => ({ toString: () => "nest" }) },
    worker: { ready: () => true },
    surfaceLeaves: {
      get: (x: number, y: number, at: (a: number, b: number) => number) => (at(x, y), at(x + 1, y), at(x, y + 1), `tiles ${x},${y}`),
    },
    mapLeaves: { draw: () => {} },
  };
  Object.assign(f.k, { sprites });
  const inputs = { hover: null, pen: null, penSeen: { current: null }, show: SHOW } as FieldInputs;
  const parts = { ground: f.ground } as unknown as FieldParts;
  const refs = { sensed: {} } as unknown as FrameRefs;
  const fs = beginFrame(f.k, inputs, parts, refs, { started: 0, f: null, fcol: null, fHere: false });
  const g = (globalThis as { Path2D?: unknown }).Path2D;
  (globalThis as { Path2D?: unknown }).Path2D = RecordedPath; // the terrain's grain makes paths
  try {
    new FieldRenderer([paperStage, groundStage, foodStage]).frame(fs);
  } finally {
    (globalThis as { Path2D?: unknown }).Path2D = g;
  }
  return fs;
}

test("no false edge: an endless plane's rows run on above row 0, so the window, the paper and the chunk rows above it are all drawn", () => {
  const p = plain();
  for (let cx = -1; cx <= 0; cx++) for (let cy = -2; cy <= 1; cy++) p.make(cx, cy);
  p.rock.peek(0, -1)![63 * CHUNK + 5] = ROCK; // the last row above row 0
  const f = field(p.m, { cam: { x: 0, y: 0, zoom: 2 } });
  const fs = frame(f);
  const vis = fs.vis;
  assert.ok(vis.y0 < 0, "the camera at y 0 sees rows above 0");
  assert.equal(fs.cellWindow.ry0, Math.floor(vis.y0 / R) - 1, "the window starts at the top of the view, not at row 0");
  assert.ok(fs.cellWindow.ry0 < 0);
  assert.equal(fs.cellWindow.ry1, Math.ceil(vis.y1 / R) + 1);
  assert.equal(fs.cellWindow.rx0, Math.floor(vis.x0) - 1, "and x runs on left of 0 too");
  const fills = f.rec.log.filter((l) => l.startsWith("fillRect("));
  assert.deepEqual(
    fills.slice(0, 2),
    ["fillRect(0, 0, 800, 600)", "fillRect(0, 0, 800, 600)"],
    "the page's paper, then the ground's over the whole view: no edge at row 0 or at ext.h",
  );
  const [, row0] = toScreen(f.k.c, f.k.v, 0, 0);
  const above = f.rec.log
    .filter((l) => l.startsWith("drawImage("))
    .map((l) => l.slice("drawImage(".length, -1).split(", "))
    .filter((a) => Number(a[6]) < row0);
  assert.ok(above.length > 40, `rows of the chunks above row 0 are laid on the canvas (${above.length})`);
  assert.ok(f.ground.chunks.has("0,-1") && f.ground.chunks.has("-1,-2"), "chunks of negative rows have canvases");
  const img = f.ground.chunks.get("0,-1")!.img.data;
  assert.equal(img[(63 * CHUNK + 5) * 4 + 3], 255, "and are painted (a chunk above row 0 is not clipped to clear)");
});

test("no false edge: close up, the hexagons' ground paper is the whole view too", () => {
  const p = plain();
  for (let cy = -1; cy <= 0; cy++) p.make(0, cy);
  const f = field(p.m, { cam: { x: 8, y: 0, zoom: 40 } });
  frame(f);
  const fills = f.rec.log.filter((l) => l.startsWith("fillRect("));
  assert.deepEqual(
    fills,
    ["fillRect(0, 0, 800, 600)", "fillRect(0, 0, 800, 600)", "fillRect(0, 0, 800, 600)"],
    "paper, the ground's paper, the hexagons' own, each the view",
  );
});

test("a bounded map still draws its box's edge: paper over the box only", () => {
  const rock = new ChunkLayer<Uint8Array>((n) => new Uint8Array(n), 1);
  const food = new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0);
  rock.put(0, 0, new Uint8Array(CHUNK * CHUNK));
  food.put(0, 0, new Float32Array(CHUNK * CHUNK));
  const m = { x0: 0, size: { w: 64, h: 64 }, rock, food } as unknown as WorldMap;
  const f = field(m, { cam: { x: 32, y: 32, zoom: 2 } });
  (f.k as { ext: unknown }).ext = { x0: 0, w: 64, h: 64 };
  const fs = frame(f);
  assert.equal(fs.cellWindow.ry0, 0, "clipped at row 0");
  const fills = f.rec.log.filter((l) => l.startsWith("fillRect("));
  assert.equal(fills[0], "fillRect(0, 0, 800, 600)");
  assert.notEqual(fills[1], "fillRect(0, 0, 800, 600)", "the ground's paper is the box, not the view");
});

test("peekCell reads a cell without making its chunk, and an unmade chunk reads as the layer's empty", () => {
  const p = plain();
  p.make(0, 0);
  p.rock.peek(0, 0)![CHUNK * 2 + 3] = 2;
  assert.equal(peekCell(p.rock, 3, 2), 2);
  assert.equal(peekCell(p.rock, -5, 2), 1, "an unmade chunk of rock reads as rock");
  assert.equal(peekCell(p.food, 100000, -100000), 0, "and of food as none");
  assert.equal(p.rock.count, 1);
});

// ---- on a real game ----

test("on a real endless game, drawing the ground and the food makes no chunk, near the start nests or far, bricks or hexagons", () => {
  const world = generateEndlessWorld(4);
  const g = new Game(world, {}, gameRng(4), [{ antCount: 20 }, { antCount: 20 }]);
  for (let k = 0; k < 40; k++) g.tick(0.05); // the ants make the ground they walk on
  const plane = world.plane;
  const [a] = plane.plane.startNests();
  let held = 0;
  for (const cam of [
    { x: a!.x, y: a!.y, zoom: 2 },
    { x: a!.x, y: a!.y, zoom: 30 },
    { x: a!.x + 700, y: a!.y - 500, zoom: 30 },
    { x: -3e5, y: 2e5, zoom: 4 },
    { x: 5000, y: -3000, zoom: 40 },
  ]) {
    const f = field(plane, { cam, colonies: g.colonies, world: g.world });
    f.k.ext = extentOf(plane);
    const key = () => [plane.rock.count, plane.food.count, plane.gen.misses, plane.gen.prefetched];
    const before = key();
    frame(f);
    frame(f);
    assert.deepEqual(key(), before, `the camera at ${cam.x}, ${cam.y}, zoom ${cam.zoom}`);
    held += f.ground.chunks.size;
    for (const cc of f.ground.chunks.values())
      assert.ok(plane.rock.peek(cc.cx, cc.cy) !== undefined, "a canvas only for a chunk the game made");
  }
  assert.ok(held > 0, "some of the ground near the start nests was made, and drawn");
});
