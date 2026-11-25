import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AIR,
  CELL,
  CHUNK,
  ChunkLayer,
  CURTAIN,
  Game,
  gameRng,
  generateEndlessWorld,
  R,
  INFECTED,
  PLANE,
  ROCK,
  SOIL,
  SPORE_FULL,
  SPORE_SHOWN,
  STRIP,
  cellOf,
  type WorldMap,
} from "../../colony/index.ts";
import { fitZoom, miniFrame, minimapRect, MINI_CHUNKS_H, MINI_CHUNKS_W } from "../camera.ts";
import { odourRgb } from "../field/colour.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import type { FieldEnv } from "../field/env.ts";
import { stripAt } from "../field/ground.ts";
import { MINIMAP_EVERY_MS, Minimap, WINDOW_UNITS_PX, arrowOn } from "../field/minimap.ts";
import { extentOf } from "../field/rig.ts";
import { Knowledge, GRACE, LIVE, REMEMBERED } from "../fog/knowledge.ts";
import { SNAP } from "../fog/sources.ts";
import { dimPx, fogRgb } from "../field/fogCull.ts";
import { holeOwner } from "../lens.ts";
import { SensedMap } from "../fungusSight.ts";
import { buildGame } from "../useColony.ts";
import { centreX, centreY } from "../../colony/index.ts";
import { RecordedCanvas, recordingContext } from "./recordingContext.ts";

// The minimap on a recording fake context (ja-fnd.6.3.19): its picture pixel by pixel from the map, the spores and the ants (the buffer is real bytes), and
// the stage that lays it in the corner with the camera's rectangle on it and repaints it twice a second at most. scripts/field-shots.mjs (the zoomed
// scenes: above-nest0, below-nest1, phone-above, dark-*) holds that the browser draws the same.

const THEME: FieldTheme = {
  paper: "#paper",
  ink: "#ink",
  accent: "#accent",
  warn: "#warn",
  line: "#line",
  fg3: "#fg3",
  rock: [11, 12, 13],
  soil: [21, 22, 23],
  sky: [31, 32, 33],
  spoil: [41, 42, 43],
  mound: "#mound",
  trail: [51, 52, 53],
  alarm: [61, 62, 63],
  accentRgb: [71, 72, 73],
  paperRgb: [240, 241, 242],
  inkRgb: [10, 20, 30],
  warnRgb: [200, 100, 50],
  spore: "#spore",
  aphid: "#aphid",
  sporeRgb: [81, 82, 83],
  chamber: [91, 92, 93],
};

/** A layer by hand: the value at a cell, from a table keyed "x,y". */
const table = (m: Map<string, number>) => ({ get: (x: number, y: number) => m.get(`${x},${y}`) ?? 0 });

interface Setup {
  w?: number;
  h?: number;
  x0?: number;
  rock?: Map<string, number>;
  food?: Map<string, number>;
  spoil?: Map<string, number>;
  spores?: Map<string, number>;
  colonies?: unknown[];
  over?: Partial<FieldCtx>;
  now?: () => number;
}

function setup(o: Setup = {}) {
  const w = o.w ?? 8;
  const h = o.h ?? 6;
  const x0 = o.x0 ?? 0;
  const canvases: RecordedCanvas[] = [];
  let clock = 0;
  const env: FieldEnv = {
    now: o.now ?? (() => clock),
    dpr: () => 1,
    dev: false,
    reducedMotion: () => false,
    newPath: () => {
      throw new Error("no path");
    },
    newCanvas: (cw, ch) => {
      const c = new RecordedCanvas(cw, ch);
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
    sprites: () => {
      throw new Error("no sprite");
    },
  };
  const rec = recordingContext();
  const m = {
    x0,
    size: { w, h },
    rock: table(o.rock ?? new Map()),
    food: table(o.food ?? new Map()),
    spoil: o.spoil ? table(o.spoil) : undefined,
  } as unknown as WorldMap;
  const k = {
    ctx: rec.ctx,
    theme: THEME,
    d: 1,
    v: { w: 800, h: 600, dpr: 1 },
    c: { x: x0 + w / 2, y: h / 2, zoom: 20 },
    lv: PLANE,
    m,
    ext: { x0, w, h },
    colonies: o.colonies ?? [],
    strip: false,
    spores: table(o.spores ?? new Map()),
    env,
    ...o.over,
  } as unknown as FieldCtx;
  const minimap = new Minimap(env);
  minimap.resize(k.ext);
  const image = () =>
    (canvases[0]!.getContext() as unknown as { createImageData: (w: number, h: number) => ImageData }).createImageData(0, 0);
  return { k, minimap, canvases, rec, tick: (ms: number) => (clock += ms), image };
}

/** The cell the minimap pixel (mx, my) reads (the cell under its centre). */
function cellOfPixel(x0: number, mx: number, my: number): string {
  cellOf(x0 + mx * 2 + 1, my * 2 + 1);
  return `${CELL[0]},${CELL[1]}`;
}

/** The pixel (mx, my) of the minimap's buffer after a paint. */
function paintedPixel(s: ReturnType<typeof setup>, mx: number, my: number): number[] {
  const canvas = s.canvases[0]!;
  const log = canvas.rec.log;
  assert.ok(
    log.some((l) => l.startsWith("putImageData(")),
    "painted",
  );
  const img = (s.minimap as unknown as { img: ImageData }).img;
  const i = (my * canvas.width + mx) * 4;
  return [...img.data.slice(i, i + 4)];
}

test("the canvas is two world units a pixel, rounded up, and made by the env", () => {
  const s = setup({ w: 9, h: 5 });
  assert.equal(s.canvases.length, 1);
  assert.deepEqual([s.canvases[0]!.width, s.canvases[0]!.height], [5, 3]);
  s.minimap.resize({ x0: 0, w: 20, h: 8 });
  assert.deepEqual([s.canvases[0]!.width, s.canvases[0]!.height], [10, 4]);
  const img = (s.minimap as unknown as { img: ImageData }).img;
  assert.deepEqual([img.width, img.height], [10, 4], "the colour buffer is the canvas's size, width first");
});

test("paint: each pixel is the cell under its centre: food, rock, soil, sky, the mound, else the paper; off the map is rock; spores wash it", () => {
  const rock = new Map<string, number>();
  const food = new Map<string, number>();
  const spoil = new Map<string, number>();
  const spores = new Map<string, number>();
  const at = (mx: number, my: number) => cellOfPixel(0, mx, my);
  food.set(at(0, 0), 1);
  rock.set(at(1, 0), ROCK);
  rock.set(at(2, 0), SOIL);
  rock.set(at(3, 0), AIR);
  spoil.set(at(0, 1), 2);
  // a heap on food, soil and sky changes none of them: they are chosen first
  spoil.set(at(0, 0), 2);
  spoil.set(at(2, 0), 2);
  spoil.set(at(3, 0), 2);
  spores.set(at(3, 2), 2 * SPORE_FULL); // past full: the wash stops at full
  spores.set(at(2, 1), SPORE_FULL); // over the paper
  spores.set(at(3, 1), SPORE_SHOWN / 2); // under the threshold
  spores.set(at(1, 2), SPORE_SHOWN * 2); // a little
  food.set(at(2, 2), 1);
  spores.set(at(2, 2), SPORE_FULL); // over food
  spores.set(at(0, 2), SPORE_SHOWN); // exactly the threshold: shown
  food.set(at(1, 3), 1); // under the last row, which is off the map: neither shows
  spores.set(at(1, 3), SPORE_FULL);
  const s = setup({ w: 9, h: 7, rock, food, spoil, spores });
  s.minimap.paint(s.k);
  const px = (mx: number, my: number) => paintedPixel(s, mx, my);
  const wash = (c: number[], sv: number) => {
    const a = sv >= SPORE_SHOWN ? 0.35 + 0.5 * Math.min(1, sv / SPORE_FULL) : 0;
    return [0, 1, 2].map((j) => Math.round(c[j]! + (THEME.sporeRgb[j]! - c[j]!) * a));
  };
  assert.deepEqual(px(0, 0), [...THEME.accentRgb, 255], "food");
  assert.deepEqual(px(1, 0), [...THEME.rock, 255], "rock");
  assert.deepEqual(px(2, 0), [...THEME.soil, 255], "soil");
  assert.deepEqual(px(3, 0), [...THEME.sky, 255], "sky");
  assert.deepEqual(px(0, 1), [...THEME.spoil, 255], "a heap on open ground");
  assert.deepEqual(px(1, 1), [...THEME.paperRgb, 255], "nothing: the paper");
  assert.deepEqual(px(2, 1), [...wash(THEME.paperRgb, SPORE_FULL), 255], "spores at full: 0.85 of the way to the spore colour");
  assert.deepEqual(px(3, 1), [...THEME.paperRgb, 255], "under the threshold: none");
  assert.deepEqual(px(1, 2), [...wash(THEME.paperRgb, SPORE_SHOWN * 2), 255], "a little: 0.35 and a bit");
  assert.deepEqual(px(2, 2), [...wash(THEME.accentRgb, SPORE_FULL), 255], "spores over food");
  assert.deepEqual(px(3, 2), [...wash(THEME.paperRgb, SPORE_FULL), 255], "spores past full wash no more than full");
  // the last row's centre is at y = 7, past the map's 7 rows: rock whatever the tables say
  assert.deepEqual(px(0, 3), [...THEME.rock, 255], "off the map: rock");
  assert.deepEqual(px(2, 3), [...THEME.rock, 255]);
  assert.deepEqual(
    px(0, 2),
    [...wash(THEME.paperRgb, SPORE_SHOWN), 255],
    "exactly the spore threshold: shown (the row above is inside the map)",
  );
  assert.deepEqual(px(1, 3), [...THEME.rock, 255], "off the map: no food, no spores");
});

test("paint: a pixel whose centre falls in the cell just past the map's last column is rock (a hex row's edge: an odd width)", () => {
  // w = 9, h = 12: pixel (4, 4)'s centre (9, 9) lies in cell (9, 10), one past the last column; the stub's tables read 0 (the paper) there
  const s = setup({ w: 9, h: 12 });
  s.minimap.paint(s.k);
  assert.equal(cellOfPixel(0, 4, 4), "9,10");
  assert.deepEqual(paintedPixel(s, 4, 4), [...THEME.rock, 255], "past the last column: rock");
  assert.deepEqual(paintedPixel(s, 3, 4), [...THEME.paperRgb, 255], "the column before is inside the map");
});

test("paint: the ants are dots in their colony's tone, the infected over the healthy in the spore colour halfway to ink; dead ants, other layers and ants off the map are not drawn", () => {
  const ants = (xs: number[], ys: number[], loads: number[], odour: number, alive: number[], layers: number[]) => ({
    n: xs.length,
    alive,
    layer: layers,
    x: xs,
    y: ys,
    load: loads,
    nestOdour: odour,
  });
  const colonies = [
    // colony 0: over pixel (0, 0); a dead one over (1, 0); one on the curtain over (2, 0); one off the map; a healthy one over (1, 1)
    ants([0.5, 2.5, 4.5, 40, 2.6], [0.5, 0.5, 0.5, 0.5, 2.6], [0, 0, 0, 0, 0], 0, [1, 0, 1, 1, 1], [PLANE, PLANE, CURTAIN, PLANE, PLANE]),
    // colony 1: one over (0, 0) too; an infected one over (1, 1); a healthy one over (3, 0); one a column past the buffer's width; one left of the map
    ants(
      [0.6, 2.5, 6.5, 8.5, -1.5],
      [0.6, 2.5, 1.5, 0.5, 4.5],
      [0, INFECTED, 0, 0, 0],
      1,
      [1, 1, 1, 1, 1],
      [PLANE, PLANE, PLANE, PLANE, PLANE],
    ),
  ];
  const s = setup({ w: 8, h: 6, colonies });
  s.minimap.paint(s.k);
  const px = (mx: number, my: number) => paintedPixel(s, mx, my).slice(0, 3);
  const tone = (odour: number) => odourRgb(THEME.inkRgb, THEME.warnRgb, odour);
  const host = [0, 1, 2].map((j) => Math.round((THEME.sporeRgb[j]! + THEME.inkRgb[j]!) / 2));
  assert.deepEqual(px(0, 0), tone(0), "two colonies' ants on a pixel: the first colony's on top");
  assert.deepEqual(px(1, 0), [...THEME.paperRgb], "a dead ant leaves nothing");
  assert.deepEqual(px(2, 0), [...THEME.paperRgb], "an ant of the other layer: nothing");
  assert.deepEqual(px(1, 1), host, "an infected ant over a healthy one on its pixel");
  assert.deepEqual(px(3, 0), tone(1), "the second colony's own tone (y = 1.5 is the first row of pixels)");
  assert.deepEqual(px(0, 1), [...THEME.paperRgb], "an ant a column past the width writes nowhere: not on the next row");
  assert.deepEqual(px(3, 0).length, 3);
  assert.deepEqual(px(3, 1), [...THEME.paperRgb], "an ant left of the map writes nowhere: not on the row above's end");
  assert.equal(paintedPixel(s, 0, 0)[3], 255);
  // an ant at x = 3.5 is in the second pixel (3.5 / 2 rounded down), not the third
  const odd = setup({ w: 8, h: 6, colonies: [ants([3.5], [4.5], [0], 0, [1], [PLANE])] });
  odd.minimap.paint(odd.k);
  assert.deepEqual(paintedPixel(odd, 1, 2).slice(0, 3), tone(0), "x = 3.5: pixel 1");
  assert.deepEqual(paintedPixel(odd, 2, 2).slice(0, 3), [...THEME.paperRgb], "not pixel 2");
  // a map that starts at x = 10: an ant is placed by its distance from the first column
  const shifted = setup({ w: 8, h: 6, x0: 10, colonies: [ants([10.5, 12.5], [0.5, 0.5], [0, 0], 0, [1, 1], [PLANE, PLANE])] });
  shifted.minimap.paint(shifted.k);
  assert.deepEqual(paintedPixel(shifted, 0, 0).slice(0, 3), tone(0), "x = 10.5 is the first pixel of a map that starts at 10");
  assert.deepEqual(paintedPixel(shifted, 1, 0).slice(0, 3), tone(0));
  // an infected ant of the first colony over a healthy one of the second: still the infected
  const flipped = setup({
    w: 8,
    h: 6,
    colonies: [ants([2.5], [2.5], [INFECTED], 0, [1], [PLANE]), ants([2.6], [2.6], [0], 1, [1], [PLANE])],
  });
  flipped.minimap.paint(flipped.k);
  assert.deepEqual(paintedPixel(flipped, 1, 1).slice(0, 3), host, "the infected are drawn after the healthy, whatever the colony");
});

test("paint, on the side view: the strip and the mound's cut are the plane's, drawn as the field draws them and never washed with spores", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const curtain = g.world.curtain;
  const ext = { x0: curtain.x0, w: curtain.size.w, h: curtain.size.h };
  const everywhere = { get: () => SPORE_FULL };
  const s = setup({ over: { m: curtain, ext, strip: true, lv: CURTAIN, world: g.world, spores: everywhere as never } });
  s.minimap.resize(ext);
  s.minimap.paint(s.k);
  const canvas = s.canvases[0]!;
  let cuts = 0;
  let washed = 0;
  for (let my = 0; my < Math.ceil(STRIP / 2) + 2; my++)
    for (let mx = 0; mx < canvas.width; mx += 7) {
      cellOf(curtain.x0 + mx * 2 + 1, my * 2 + 1);
      const [cx, cy] = [CELL[0], CELL[1]];
      const cut = stripAt(s.k, cx, cy);
      const pixel = paintedPixel(s, mx, my).slice(0, 3);
      if (cut) {
        cuts++;
        assert.deepEqual(pixel, [...cut], `pixel (${mx}, ${my}): the strip's colour, with no spores over it`);
      } else {
        washed++;
      }
    }
  assert.ok(cuts > 0, "some pixels are on the strip or its cut");
  assert.ok(washed > 0, "and some are not");
  // and a pixel that is not the strip's has the spores over it: full spores wash 0.85 of the way to the spore colour
  const sky = paintedPixel(s, 0, 0).slice(0, 3);
  cellOf(curtain.x0 + 1, 1);
  assert.equal(stripAt(s.k, CELL[0], CELL[1]), null, "the corner is sky: not the strip's");
  assert.deepEqual(
    sky,
    [0, 1, 2].map((j) => Math.round(THEME.sky[j]! + (THEME.sporeRgb[j]! - THEME.sky[j]!) * 0.85)),
    "washed with spores",
  );
});

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const SEEN_ALL = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };

test("draw: nothing while the whole map is in view; once zoomed in past a twentieth over the fit, the picture in the corner with its frame and the camera's rectangle", () => {
  const s = setup({ w: 200, h: 120, x0: 0 });
  const fit = fitZoom(s.k.ext, s.k.v);
  s.minimap.draw({ ...s.k, c: { x: 100, y: 60, zoom: fit * 1.05 } } as FieldCtx, SEEN_ALL);
  assert.deepEqual(s.rec.log, [], "at the fit, and a twentieth over it: not drawn");
  assert.equal(s.canvases[0]!.rec.log.filter((l) => l.startsWith("putImageData(")).length, 0, "and not painted");
  const k = { ...s.k, c: { x: 100, y: 60, zoom: fit * 1.06 } } as FieldCtx;
  const seen = { x0: 50, y0: 30, x1: 150, y1: 90 };
  s.minimap.draw(k, seen);
  const r = minimapRect(k.ext, k.v, k.d);
  const scale = r.w / 200;
  assert.deepEqual(s.rec.log, [
    "globalAlpha = 0.92",
    `drawImage(${s.canvases[0]}, ${r3(r.x)}, ${r3(r.y)}, ${r3(r.w)}, ${r3(r.h)})`,
    "globalAlpha = 1",
    "strokeStyle = #line",
    "lineWidth = 1",
    `strokeRect(${r3(r.x)}, ${r3(r.y)}, ${r3(r.w)}, ${r3(r.h)})`,
    "strokeStyle = #accent",
    "lineWidth = 1.5",
    `strokeRect(${r3(r.x + 50 * scale)}, ${r3(r.y + 30 * scale)}, ${r3(100 * scale)}, ${r3(60 * scale)})`,
  ]);
  assert.equal(s.canvases[0]!.rec.log.filter((l) => l.startsWith("putImageData(")).length, 1, "painted before it was first shown");
});

test("draw: the camera's rectangle is clipped to the map, from its first column, and the lines are as thick as the device ratio", () => {
  const s = setup({ w: 200, h: 120, x0: -30 });
  const fit = fitZoom(s.k.ext, s.k.v);
  const k = { ...s.k, d: 2, v: { w: 800, h: 600, dpr: 2 }, c: { x: 0, y: 60, zoom: fit * 2 } } as FieldCtx;
  s.minimap.draw(k, { x0: -80, y0: -10, x1: 300, y1: 500 });
  const r = minimapRect(k.ext, k.v, 2);
  const scale = r.w / 200;
  const strokes = s.rec.log.filter((l) => l.startsWith("strokeRect("));
  assert.equal(strokes[0], `strokeRect(${r3(r.x)}, ${r3(r.y)}, ${r3(r.w)}, ${r3(r.h)})`);
  assert.equal(
    strokes[1],
    `strokeRect(${r3(r.x)}, ${r3(r.y)}, ${r3(200 * scale)}, ${r3(120 * scale)})`,
    "all of it: clipped to the map on every side",
  );
  assert.ok(s.rec.log.includes("lineWidth = 2") && s.rec.log.includes("lineWidth = 3"), "1 and 1.5 device pixels at two to a CSS pixel");
  const t = setup({ w: 200, h: 120, x0: -30 });
  const kk = { ...t.k, c: { x: 0, y: 60, zoom: fit * 2 } } as FieldCtx;
  t.minimap.draw(kk, { x0: -10, y0: 20, x1: 90, y1: 80 });
  const r2 = minimapRect(kk.ext, kk.v, 1);
  const s2 = r2.w / 200;
  assert.equal(
    t.rec.log.filter((l) => l.startsWith("strokeRect("))[1],
    `strokeRect(${r3(r2.x + 20 * s2)}, ${r3(r2.y + 20 * s2)}, ${r3(100 * s2)}, ${r3(60 * s2)})`,
    "a rectangle inside a map that starts at -30: measured from the map's first column",
  );
});

test("draw: the picture is painted again only when it is older than half a second, a resize, or a new theme", () => {
  let now = 1000;
  const s = setup({ w: 200, h: 120, now: () => now });
  const fit = fitZoom(s.k.ext, s.k.v);
  const k = { ...s.k, c: { x: 100, y: 60, zoom: fit * 2 } } as FieldCtx;
  const paints = () => s.canvases[0]!.rec.log.filter((l) => l.startsWith("putImageData(")).length;
  s.minimap.draw(k, SEEN_ALL);
  assert.equal(paints(), 1);
  now += MINIMAP_EVERY_MS;
  s.minimap.draw(k, SEEN_ALL);
  assert.equal(paints(), 1, "exactly half a second: not yet");
  now += 1;
  s.minimap.draw(k, SEEN_ALL);
  assert.equal(paints(), 2, "older than half a second");
  s.minimap.draw(k, SEEN_ALL);
  assert.equal(paints(), 2, "and the clock restarts from the paint");
  s.minimap.invalidate();
  s.minimap.draw(k, SEEN_ALL);
  assert.equal(paints(), 3, "a new theme");
  s.minimap.resize(k.ext);
  s.minimap.draw(k, SEEN_ALL);
  assert.equal(paints(), 4, "a new size");
  // not shown, not painted: the clock does not run while it is hidden
  now += 10_000;
  s.minimap.draw({ ...k, c: { x: 100, y: 60, zoom: fit } } as FieldCtx, SEEN_ALL);
  assert.equal(paints(), 4);
  s.minimap.draw(k, SEEN_ALL);
  assert.equal(paints(), 5, "shown again after a while: painted at once");
});

test("under the fog a pixel is fog where nothing was sensed, the snapshot while sensed, dimmed once nobody senses it; ants only where live", () => {
  const rockSnap = new Uint8Array(64 * 64);
  cellOf(1, 1);
  const [px0, py0] = [CELL[0], CELL[1]]; // the cell pixel (0, 0) reads
  rockSnap[py0 * 64 + px0] = ROCK;
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, [{ name: SNAP.rock, layer: PLANE, at: (cx, cy) => (cx === 0 && cy === 0 ? rockSnap : undefined) }]);
  const ant = (gx: number, gy: number) => ({
    n: 1,
    nestOdour: 0,
    alive: Uint8Array.of(1),
    layer: Uint8Array.of(PLANE),
    load: Float32Array.of(0),
    params: { sensorDistance: 3 },
    alates: [],
    x: Float32Array.of(centreX(gx, gy)),
    y: Float32Array.of(centreY(gy)),
  });
  const host = { ...ant(px0, py0), load: Float32Array.of(INFECTED) };
  const walker = ant(7, 5); // a healthy ant in a cell nobody senses
  const s = setup({ over: { fog }, colonies: [walker as never] });
  const F = fogRgb(THEME);
  s.minimap.paint(s.k);
  assert.deepEqual(paintedPixel(s, 0, 0), [...F, 255], "nothing sensed: fog");
  sensed.stamp([host as never], 1);
  s.minimap.paint(s.k);
  assert.deepEqual(paintedPixel(s, 0, 0), [...THEME.rock, 255], "live: the snapshot's rock, not the table's open ground");
  assert.deepEqual(paintedPixel(s, 3, 2), [...F, 255], "far from the host: still fog");
  sensed.stamp([{ ...host, n: 0 } as never], 1 + GRACE + 1);
  s.minimap.paint(s.k);
  const dim = paintedPixel(s, 0, 0);
  assert.deepEqual(
    dim.slice(0, 3),
    THEME.rock.map((c, k) => Math.round(c * 0.6 + F[k]! * 0.4)),
    "remembered: dimmed towards the fog",
  );
  const withAnt = setup({ over: { fog }, colonies: [host as never] });
  withAnt.minimap.paint(withAnt.k);
  assert.deepEqual(
    paintedPixel(withAnt, 0, 0).slice(0, 3),
    dim.slice(0, 3),
    "an ant in a remembered cell is not drawn: its pixel is the dimmed ground",
  );
});

test("under the fog the minimap's food and mound come from the snapshot too, not from what is there now", () => {
  const food = new Float32Array(64 * 64);
  const spoil = new Uint16Array(64 * 64);
  const a = cellOfPixel(0, 1, 0).split(",").map(Number) as [number, number];
  const b = cellOfPixel(0, 2, 0).split(",").map(Number) as [number, number];
  food[a[1] * 64 + a[0]] = 0.5;
  spoil[b[1] * 64 + b[0]] = 3;
  const chunk = (arr: Float32Array | Uint16Array) => (cx: number, cy: number) => (cx === 0 && cy === 0 ? arr : undefined);
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, [
    { name: SNAP.food, layer: PLANE, at: chunk(food) },
    { name: SNAP.spoil, layer: PLANE, at: chunk(spoil) },
  ]);
  const hosts = {
    n: 2,
    nestOdour: 0,
    alive: Uint8Array.of(1, 1),
    layer: Uint8Array.of(PLANE, PLANE),
    load: Float32Array.of(INFECTED, INFECTED),
    params: { sensorDistance: 3 },
    alates: [],
    x: Float32Array.of(centreX(a[0], a[1]), centreX(b[0], b[1])),
    y: Float32Array.of(centreY(a[1]), centreY(b[1])),
  };
  sensed.stamp([hosts as never], 1);
  const s = setup({ over: { fog }, spoil: new Map(), colonies: [] });
  s.minimap.paint(s.k);
  assert.deepEqual(paintedPixel(s, 1, 0), [...THEME.accentRgb, 255], "food as sensed, though the map's table has none");
  assert.deepEqual(paintedPixel(s, 2, 0), [...THEME.spoil, 255], "the mound as sensed");
});

// ---- The endless plane's minimap: a window of chunks round the camera (E5.3, ja-qpv.4.3). It replaces E5.2's "draws nothing" guard on purpose. ----

const WIN_PX = [(MINI_CHUNKS_W * CHUNK) / WINDOW_UNITS_PX, Math.ceil((MINI_CHUNKS_H * CHUNK * R) / WINDOW_UNITS_PX)];

/** A real endless game's world, a camera far from the start (its chunks are not made), and the minimap over them. */
function endless(cam = { x: 5000, y: 3000 }, o: Setup = {}) {
  const world = generateEndlessWorld(4);
  const g = new Game(world, {}, gameRng(4), [{ antCount: 20 }, { antCount: 20 }]);
  const plane = world.plane;
  const ext = extentOf(plane);
  const spores = new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0);
  const s = setup({
    over: { m: plane, ext, world: g.world, colonies: g.colonies, spores, c: { ...cam, zoom: 8 }, ...o.over },
    now: o.now,
  });
  return { ...s, g, plane, spores, ext };
}

/** The cell of the window's pixel (mx, my), as paint reads it. */
function windowCell(win: { x0: number; y0: number }, mx: number, my: number): [number, number] {
  cellOf(win.x0 + mx * WINDOW_UNITS_PX + WINDOW_UNITS_PX / 2, win.y0 + my * WINDOW_UNITS_PX + WINDOW_UNITS_PX / 2);
  return [CELL[0]!, CELL[1]!];
}

/** A hole's world position. */
function centreXY(h: { x: number; y: number }): { x: number; y: number } {
  return { x: h.x + 0.5 + 0.5 * (h.y & 1), y: (h.y + 0.5) * R };
}

test("endless: the canvas is the window's, 16 x 12 chunks at 4 units a pixel, whatever the plane's nominal box; the bounded map's is unchanged", () => {
  const s = endless();
  assert.equal(s.canvases.length, 1, "one canvas");
  assert.deepEqual([s.canvases[0]!.width, s.canvases[0]!.height], WIN_PX, "256 x 167");
  assert.deepEqual(WIN_PX, [256, 167]);
  const img = (s.minimap as unknown as { img: ImageData }).img;
  assert.deepEqual([img.width, img.height], WIN_PX, "and the colour buffer is that size too, not the nominal box's");
  assert.ok(s.ext.w > 4e6, "the nominal box is millions of cells wide");
  const b = setup({ w: 9, h: 5 });
  assert.deepEqual([b.canvases[0]!.width, b.canvases[0]!.height], [5, 3], "a bounded map: 2 units a pixel as before");
});

test("endless: each pixel is the cell under its centre, read from the chunks the game has made; a chunk it has not made is fog, and painting makes none", () => {
  const s = endless();
  const win = miniFrame(s.ext, s.k.c);
  const [x, y] = windowCell(win, 40, 50);
  const [cx, cy] = [x >> 6, y >> 6];
  const rock = s.plane.rock.ensure(cx, cy);
  const food = s.plane.food.ensure(cx, cy);
  rock.fill(0);
  food.fill(0);
  const sp = s.spores.ensure(cx, cy);
  const put = (mx: number, my: number, f: (i: number) => void) => {
    const [a, b] = windowCell(win, mx, my);
    assert.deepEqual([a >> 6, b >> 6], [cx, cy], `pixel (${mx}, ${my}) is in the chunk made`);
    f(((b & 63) << 6) | (a & 63));
  };
  put(40, 50, (i) => (food[i] = 1));
  put(41, 50, (i) => (rock[i] = ROCK));
  put(42, 50, (i) => (rock[i] = SOIL));
  put(41, 51, (i) => (rock[i] = AIR));
  put(43, 50, (i) => (sp[i] = SPORE_FULL));
  const counts = () => [s.plane.rock.count, s.plane.food.count, s.spores.count];
  const before = counts();
  s.minimap.paint(s.k);
  assert.deepEqual(counts(), before, "painting made no chunk of the rock, food or spore layers");
  const px = (mx: number, my: number) => paintedPixel(s, mx, my);
  assert.deepEqual(px(40, 50), [...THEME.accentRgb, 255], "food");
  assert.deepEqual(px(41, 50), [...THEME.rock, 255], "rock");
  assert.deepEqual(px(42, 50), [...THEME.soil, 255], "soil");
  assert.deepEqual(px(41, 51), [...THEME.sky, 255], "sky");
  assert.deepEqual(px(44, 50), [...THEME.paperRgb, 255], "open ground in the made chunk: the paper");
  assert.deepEqual(
    px(43, 50),
    [...THEME.paperRgb.map((c, j) => Math.round(c + (THEME.sporeRgb[j]! - c) * 0.85)), 255],
    "spores wash it as they do a bounded map",
  );
  const F = fogRgb(THEME);
  assert.deepEqual(px(0, 0), [...F, 255], "a chunk nobody made: the fog's colour");
  assert.deepEqual(px(255, 166), [...F, 255], "the last pixel too");
  assert.deepEqual(counts(), before, "and still no chunk after reading them all");
});

test("endless, on a real game: painting and drawing generate no chunk, near the start nests or far, and do not touch the plane's miss count", () => {
  const first = endless({ x: 0, y: 0 });
  const [a] = first.plane.plane.startNests();
  for (const cam of [
    { x: a!.x, y: a!.y },
    { x: a!.x + 800, y: a!.y - 600 },
    { x: -3e5, y: 2e5 },
  ]) {
    const s = endless(cam);
    // some ground made round the camera, as the page's own chunk painter makes it
    s.plane.rock.chunk(Math.floor(cam.x / 64), Math.floor(cam.y / R / 64));
    const key = () => [s.plane.rock.count, s.plane.food.count, s.plane.gen.misses, s.plane.gen.prefetched];
    const before = key();
    s.minimap.paint(s.k);
    s.minimap.draw(s.k, SEEN_ALL);
    assert.deepEqual(key(), before, `the camera at ${cam.x}, ${cam.y}`);
  }
});

test("endless: the window follows the camera a chunk at a time; between two repaints the old picture is shifted under the new frame, and repainted at most twice a second", () => {
  let now = 1000;
  const s = endless({ x: 5000, y: 3000 }, { now: () => now });
  const paints = () => s.canvases[0]!.rec.log.filter((l) => l.startsWith("putImageData(")).length;
  const k1 = s.k;
  const w1 = miniFrame(s.ext, k1.c);
  s.minimap.draw(k1, SEEN_ALL);
  assert.equal(paints(), 1);
  assert.ok(!s.rec.log.includes("clip()"), "no shift while the window has not moved");
  const r = minimapRect(w1, k1.v, k1.d);
  assert.ok(s.rec.log.includes(`drawImage(${s.canvases[0]}, ${r3(r.x)}, ${r3(r.y)}, ${r3(r.w)}, ${r3(r.h)})`));
  // the camera moves within its chunk: the same window, no repaint, no shift
  s.rec.log.length = 0;
  const k2 = { ...k1, c: { ...k1.c, x: k1.c.x + 3 } } as FieldCtx;
  assert.deepEqual(miniFrame(s.ext, k2.c), w1);
  s.minimap.draw(k2, SEEN_ALL);
  assert.equal(paints(), 1);
  assert.ok(!s.rec.log.includes("clip()"));
  // two chunks east, one up: the window moves by those chunks; the picture painted for the old one is drawn shifted by the same, clipped to the minimap
  s.rec.log.length = 0;
  const k3 = { ...k1, c: { ...k1.c, x: k1.c.x + 2 * CHUNK, y: k1.c.y - CHUNK * R } } as FieldCtx;
  const w3 = miniFrame(s.ext, k3.c);
  assert.equal(w3.x0 - w1.x0, 2 * CHUNK);
  assert.ok(Math.abs(w3.y0 - w1.y0 + CHUNK * R) < 1e-9);
  s.minimap.draw(k3, SEEN_ALL);
  assert.equal(paints(), 1, "within half a second: not painted again");
  const r3w = minimapRect(w3, k3.v, k3.d);
  const sc = r3w.w / w3.w;
  assert.ok(s.rec.log.includes("clip()"), "clipped to the minimap");
  assert.ok(
    s.rec.log.includes(
      `drawImage(${s.canvases[0]}, ${r3(r3w.x + (w1.x0 - w3.x0) * sc)}, ${r3(r3w.y + (w1.y0 - w3.y0) * sc)}, ${r3(r3w.w)}, ${r3(r3w.h)})`,
    ),
    "the old picture, moved by two chunks west and one down in the new frame (a chunk is 16 pixels)",
  );
  now += MINIMAP_EVERY_MS + 1;
  s.rec.log.length = 0;
  s.minimap.draw(k3, SEEN_ALL);
  assert.equal(paints(), 2, "older than half a second: painted for the window the camera is in");
  assert.ok(!s.rec.log.includes("clip()"), "and drawn unshifted");
});

test("endless: the camera's rectangle is in window coordinates and clipped to the window; nothing is drawn while the view is zoomed out", () => {
  const s = endless({ x: 5000, y: 3000 });
  const win = miniFrame(s.ext, s.k.c);
  const r = minimapRect(win, s.k.v, s.k.d);
  const sc = r.w / win.w;
  const seen = { x0: 4900, y0: 2900, x1: 5100, y1: 3050 };
  s.minimap.draw(s.k, seen);
  const strokes = s.rec.log.filter((l) => l.startsWith("strokeRect("));
  assert.equal(strokes[0], `strokeRect(${r3(r.x)}, ${r3(r.y)}, ${r3(r.w)}, ${r3(r.h)})`, "the frame");
  assert.equal(
    strokes[1],
    `strokeRect(${r3(r.x + (4900 - win.x0) * sc)}, ${r3(r.y + (2900 - win.y0) * sc)}, ${r3(200 * sc)}, ${r3(150 * sc)})`,
    "the rectangle: from the window's own corner, not the nominal box's",
  );
  const t = endless({ x: 5000, y: 3000 });
  t.minimap.draw(t.k, SEEN_ALL);
  assert.equal(
    t.rec.log.filter((l) => l.startsWith("strokeRect("))[1],
    `strokeRect(${r3(r.x)}, ${r3(r.y)}, ${r3(r.w)}, ${r3(r.h)})`,
    "a view wider than the window: the whole frame",
  );
  const z = endless({ x: 5000, y: 3000 });
  z.minimap.draw({ ...z.k, c: { x: 5000, y: 3000, zoom: 0.5 } } as FieldCtx, SEEN_ALL);
  assert.deepEqual(z.rec.log, [], "zoomed out past the level: not drawn");
  assert.equal(z.canvases[0]!.rec.log.filter((l) => l.startsWith("putImageData(")).length, 0, "and not painted");
});

test("arrowOn: none for a point inside the window; else on the frame, on the side the point lies, pointing at it, clamped to the frame", () => {
  const win = { x0: 1000, y0: 500, w: 1024, h: 600 };
  assert.equal(arrowOn(win, 1000, 500), null, "the corner is inside");
  assert.equal(arrowOn(win, 2023.9, 1099.9), null);
  const east = arrowOn(win, 9000, 800)!;
  assert.deepEqual([east.x, east.y, east.angle], [2024, 800, 0], "far east: the middle of the right side, pointing east");
  const north = arrowOn(win, 1512, -9000)!;
  assert.deepEqual([north.x, north.y], [1512, 500]);
  assert.ok(Math.abs(north.angle + Math.PI / 2) < 1e-12, "north is up: y grows down");
  const west = arrowOn(win, 0, 800)!;
  assert.equal(west.x, 1000);
  assert.ok(Math.abs(Math.abs(west.angle) - Math.PI) < 1e-12);
  const south = arrowOn(win, 1512, 5000)!;
  assert.deepEqual([south.x, south.y, south.angle], [1512, 1100, Math.PI / 2]);
  const ne = arrowOn(win, 1512 + 5000, 800 - 5000)!;
  assert.ok(Math.abs(ne.y - 500) < 1e-9 && ne.x > 1512 && ne.x < 2024, "steeper than the window's corner: on the top side");
  assert.ok(Math.abs(ne.angle + Math.PI / 4) < 1e-12);
  const flat = arrowOn(win, 1512 + 5000, 800 - 1000)!;
  assert.ok(Math.abs(flat.x - 2024) < 1e-9 && flat.y < 800 && flat.y > 500, "shallower: on the right side");
  for (const [x, y] of [
    [3000, 3000],
    [-4000, 200],
    [1500, 90000],
    [2100, 700],
  ] as const) {
    const a = arrowOn(win, x, y)!;
    assert.ok(a.x >= 1000 - 1e-9 && a.x <= 2024 + 1e-9 && a.y >= 500 - 1e-9 && a.y <= 1100 + 1e-9, `(${x}, ${y}) is clamped to the frame`);
    assert.ok(Math.abs(Math.atan2(y - 800, x - 1512) - a.angle) < 1e-12, "and points at the point from the middle");
  }
});

test("endless: a nest beyond the window's edge is an arrow on the frame pointing at it; a hole inside the window has none", () => {
  const s = endless({ x: 5000, y: 3000 });
  const win = miniFrame(s.ext, s.k.c);
  const r = minimapRect(win, s.k.v, s.k.d);
  const sc = r.w / win.w;
  const holes = s.g.world.lines.flatMap((wl) => wl.line.holes);
  assert.equal(holes.length, 2, "the start's two holes, both far from this camera");
  s.minimap.draw(s.k, SEEN_ALL);
  assert.equal(s.rec.log.filter((l) => l === "fill()").length, 2, "an arrow for each");
  for (const h of holes) {
    const a = arrowOn(win, centreXY(h).x, centreXY(h).y)!;
    const [ax, ay] = [r.x + (a.x - win.x0) * sc, r.y + (a.y - win.y0) * sc];
    const tip = `moveTo(${r3(ax + Math.cos(a.angle) * 4.5)}, ${r3(ay + Math.sin(a.angle) * 4.5)})`;
    assert.ok(s.rec.log.includes(tip), `the tip of the arrow for hole ${h.x}, ${h.y}: ${tip}`);
  }
  // the camera over a hole: that one is on the picture (no arrow); only a hole beyond the window's edge has one
  const h0 = centreXY(holes[0]!);
  const near = endless({ x: h0.x, y: h0.y });
  near.minimap.draw(near.k, SEEN_ALL);
  const w2 = miniFrame(near.ext, near.k.c);
  const far = holes.filter((h) => arrowOn(w2, centreXY(h).x, centreXY(h).y));
  assert.ok(far.length < holes.length, "the hole under the camera is on the picture");
  assert.equal(near.rec.log.filter((l) => l === "fill()").length, far.length, "an arrow only for a hole beyond the edge");
});

test("endless: under the fog the window paints unsensed ground as fog, though made, and an unsensed hole has no arrow", () => {
  const fog = new Knowledge(new SensedMap(), []);
  const s = endless({ x: 5000, y: 3000 }, { over: { fog } as Partial<FieldCtx> });
  const win = miniFrame(s.ext, s.k.c);
  const [x, y] = windowCell(win, 40, 50);
  s.plane.rock.ensure(x >> 6, y >> 6).fill(0);
  s.minimap.draw(s.k, SEEN_ALL);
  assert.deepEqual(paintedPixel(s, 40, 50), [...fogRgb(THEME), 255], "a made chunk nobody has sensed: fog");
  assert.equal(s.rec.log.filter((l) => l === "fill()").length, 0, "no hole has been sensed: no arrow shows where one lies");
});

// ---- Review of #411, S1: the window's ants, its remembered-ground path, its arrow colour and its frame at negative cameras. ----

test("endless paint: a healthy ant is a dot in its colony's odour colour, an infected one in the host tone, a dead one and one on the other layer are not drawn", () => {
  const s = endless({ x: 5000, y: 3000 });
  const win = miniFrame(s.ext, s.k.c);
  const ant = (mx: number, my: number) => [win.x0 + mx * 4 + 1, win.y0 + my * 4 + 1] as const;
  const [a0, a1, a2, a3] = [ant(10, 30), ant(20, 30), ant(30, 30), ant(40, 30)];
  const colony = {
    n: 4,
    nestOdour: 0.3,
    alive: [true, true, false, true],
    layer: [PLANE, PLANE, PLANE, CURTAIN],
    load: [0, INFECTED, 0, 0],
    x: [a0[0], a1[0], a2[0], a3[0]],
    y: [a0[1], a1[1], a2[1], a3[1]],
  };
  s.minimap.paint({ ...s.k, colonies: [colony] } as unknown as FieldCtx);
  const px = (mx: number, my: number) => paintedPixel(s, mx, my).slice(0, 3);
  assert.deepEqual(px(10, 30), [...odourRgb(THEME.inkRgb, THEME.warnRgb, 0.3)], "a healthy ant, at its pixel of the window");
  assert.deepEqual(
    px(20, 30),
    [0, 1, 2].map((j) => Math.round((THEME.sporeRgb[j]! + THEME.inkRgb[j]!) / 2)),
    "an infected one, in the host tone",
  );
  assert.deepEqual(px(30, 30), [...fogRgb(THEME)], "a dead ant is not drawn");
  assert.deepEqual(px(40, 30), [...fogRgb(THEME)], "nor one on the other layer");
});

test("endless paint, under the fog: remembered ground is the snapshot, dimmed, and an ant on ground that is not live is not drawn", () => {
  const stub = (st: number, at: number) => ({
    state: () => st,
    stateAt: () => at,
    snapshot: (_l: number, n: string) => (n === SNAP.rock ? ROCK : 0),
  });
  const s = endless({ x: 5000, y: 3000 }, { over: { fog: stub(REMEMBERED, LIVE) } as unknown as Partial<FieldCtx> });
  const win = miniFrame(s.ext, s.k.c);
  const [x, y] = windowCell(win, 40, 50);
  s.plane.rock.ensure(x >> 6, y >> 6).fill(0); // the world says open here now; the snapshot says rock
  s.minimap.paint(s.k);
  const want = new Uint8ClampedArray([...THEME.rock, 255]);
  dimPx(want, 0, fogRgb(THEME));
  assert.deepEqual(paintedPixel(s, 40, 50), [...want], "the snapshot's rock, dimmed, not what the world holds now");
  const colony = { n: 1, nestOdour: 0.3, alive: [true], layer: [PLANE], load: [0], x: [win.x0 + 161], y: [win.y0 + 201] };
  s.minimap.paint({ ...s.k, colonies: [colony], fog: stub(LIVE, REMEMBERED) } as unknown as FieldCtx);
  assert.notDeepEqual(
    paintedPixel(s, 40, 50).slice(0, 3),
    [...odourRgb(THEME.inkRgb, THEME.warnRgb, 0.3)],
    "an ant on ground that is only remembered is not drawn",
  );
});

test("endless draw: each hole's arrow is in its owner's odour colour (the two start colonies differ)", () => {
  const s = endless({ x: 5000, y: 3000 });
  s.minimap.draw(s.k, SEEN_ALL);
  const odours = new Set<number>();
  for (const h of s.g.world.lines.flatMap((wl) => wl.line.holes)) {
    const col = s.g.colonies[holeOwner(s.g.colonies, PLANE, h.x, h.y)]!;
    odours.add(col.nestOdour);
    const [r, g, b] = odourRgb(THEME.inkRgb, THEME.warnRgb, col.nestOdour);
    assert.ok(s.rec.log.includes(`fillStyle = rgb(${r}, ${g}, ${b})`), `an arrow for the hole at ${h.x},${h.y}`);
  }
  assert.equal(odours.size, 2, "so the test can tell the colours apart");
});

test("miniFrame puts the camera's chunk in the 9th column and 7th row for any camera, negative chunks included", () => {
  const e = { x0: -2097152, w: 4194304, h: 3565158, endless: true as const };
  for (const c of [
    { x: 5000, y: 3000 },
    { x: -5000, y: -3000 },
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: -10, y: 10 },
  ]) {
    const f = miniFrame(e, c);
    assert.equal(Math.floor((c.x - f.x0) / CHUNK), 8, `column for ${c.x},${c.y}`);
    assert.equal(Math.floor((c.y - f.y0) / (CHUNK * R)), 6, `row for ${c.x},${c.y}`);
  }
});

test("endless: with a frozen window (the pointer down on the minimap) the picture, the camera's rectangle and the pixels use it, however far the camera has moved; no shift, no clip", () => {
  const s = endless({ x: 5000, y: 3000 });
  const frozen = miniFrame(s.ext, s.k.c);
  // the camera has run five chunks east and two up since the press
  const moved = { ...s.k.c, x: s.k.c.x + 5 * CHUNK, y: s.k.c.y - 2 * CHUNK * R };
  assert.notDeepEqual(miniFrame(s.ext, moved), frozen);
  // an ant at the frozen window's pixel (3, 4): painted there only by the frozen window
  const col = s.g.colonies[0]!;
  col.x[0] = frozen.x0 + 3 * WINDOW_UNITS_PX + 1;
  col.y[0] = frozen.y0 + 4 * WINDOW_UNITS_PX + 1;
  col.alive[0] = 1;
  col.layer[0] = PLANE;
  col.load[0] = 0;
  const tone = odourRgb(THEME.inkRgb, THEME.warnRgb, col.nestOdour);
  const k = { ...s.k, c: moved, miniWin: frozen, colonies: [col] } as FieldCtx;
  const seen = { x0: moved.x - 100, y0: moved.y - 60, x1: moved.x + 100, y1: moved.y + 60 };
  s.minimap.draw(k, seen);
  assert.deepEqual(paintedPixel(s, 3, 4).slice(0, 3), [...tone], "the pixel of the frozen window");
  const r = minimapRect(frozen, k.v, k.d);
  const sc = r.w / frozen.w;
  assert.ok(!s.rec.log.includes("clip()"), "painted for the frozen window: drawn unshifted");
  assert.ok(s.rec.log.includes(`drawImage(${s.canvases[0]}, ${r3(r.x)}, ${r3(r.y)}, ${r3(r.w)}, ${r3(r.h)})`));
  const strokes = s.rec.log.filter((l) => l.startsWith("strokeRect("));
  assert.equal(
    strokes[1],
    `strokeRect(${r3(r.x + (seen.x0 - frozen.x0) * sc)}, ${r3(r.y + (seen.y0 - frozen.y0) * sc)}, ${r3(200 * sc)}, ${r3(120 * sc)})`,
    "the camera's rectangle in the frozen window's coordinates",
  );
  // the same frame without the freeze follows the camera: the ant is not at that pixel in that window
  const t = endless({ x: 5000, y: 3000 });
  t.minimap.draw({ ...t.k, c: moved, colonies: [col] } as FieldCtx, seen);
  assert.notDeepEqual(paintedPixel(t, 3, 4).slice(0, 3), [...tone], "the window round the camera is another place");
  // and a camera beyond the frozen window has a rectangle of nothing, not one run off the frame
  s.rec.log.length = 0;
  s.minimap.draw(k, { x0: frozen.x0 + frozen.w + 500, y0: frozen.y0, x1: frozen.x0 + frozen.w + 700, y1: frozen.y0 + 100 });
  assert.match(s.rec.log.filter((l) => l.startsWith("strokeRect("))[1]!, /, 0, [\d.]+\)$/);
});
