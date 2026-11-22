import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AIR,
  CELL,
  CHUNK,
  CURTAIN,
  OPEN,
  R,
  SIDE,
  PLANE,
  ROCK,
  SOIL,
  SPORE_FULL,
  SPORE_SHOWN,
  STRIP,
  cellAt,
  cellKey,
  type Game,
  type WorldMap,
} from "../../colony/index.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import type { FieldEnv } from "../field/env.ts";
import {
  CRUMB_RGB,
  Ground,
  SUGAR_RGB,
  groundPaper,
  groundRock,
  groundSoil,
  groundSpoil,
  stripAt,
  type GroundShow,
} from "../field/ground.ts";
import { SENSED_FADE } from "../fungusSight.ts";
import { CLOSE_SPRITE_GROUND } from "../inspectionGround.ts";
import { ALARM_FULL, FOOD_FULL, HOME_FULL } from "../lens.ts";
import { moundBalls } from "../inspectionMound.ts";
import { HOME_RGB, ROLE_RGB } from "../palette.ts";
import { toScreen } from "../camera.ts";
import { odourRgb } from "../field/colour.ts";
import { buildGame } from "../useColony.ts";
import { RecordedCanvas, RecordedPath, callsOf, recordingContext } from "./recordingContext.ts";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// The ground on a recording fake context (ja-fnd.6.3.7): each chunk's colour buffer, painted pixel by pixel from the map and the scent, kept while its
// inputs hold, and laid on the canvas as bricks or hexagons. The buffers are real byte arrays, so the pixels are asserted exactly; the draw calls are
// read off the recording context. scripts/field-shots.mjs (above-*, below-*, dark-*, desert-*, built-*) holds that the browser draws the same.

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
const SHOW: GroundShow = { food: true, home: true };
const NOW = 100;
const FRESH = NOW; // a cell sensed just now: it shows in full

function env(): { env: FieldEnv; canvases: RecordedCanvas[]; paths: RecordedPath[] } {
  const canvases: RecordedCanvas[] = [];
  const paths: RecordedPath[] = [];
  return {
    canvases,
    paths,
    env: {
      now: () => 0,
      dpr: () => 1,
      dev: false,
      reducedMotion: () => false,
      newPath: () => {
        const p = new RecordedPath();
        paths.push(p);
        return p as unknown as Path2D;
      },
      newCanvas: (w, h) => {
        const c = new RecordedCanvas(w, h);
        canvases.push(c);
        return c as unknown as HTMLCanvasElement;
      },
      sprites: () => {
        throw new Error("the ground uses no sprite");
      },
    },
  };
}

/** A chunk layer of one chunk (0, 0) for a test: the array is the chunk's cells, row by row (64 a row). */
const layer = <A extends ArrayLike<number>>(a: A | undefined) =>
  ({ chunk: (cx: number, cy: number) => (cx === 0 && cy === 0 ? a : undefined) }) as never;

interface Cells {
  rock?: Uint8Array;
  food?: Float32Array;
  quality?: Float32Array;
  spoil?: Uint16Array;
  chambers?: { cell: Uint8Array; roles: string[] };
  width?: number;
  height?: number;
  x0?: number;
}

/** A map of one chunk with the layers a test fills in; only what paintChunk and drawHexes read. */
function stubMap(c: Cells): WorldMap {
  return {
    x0: c.x0 ?? 0,
    size: { w: c.width ?? 64, h: c.height ?? 64 },
    rock: layer(c.rock ?? new Uint8Array(CHUNK * CHUNK)),
    food: layer(c.food),
    quality: c.quality ? layer(c.quality) : undefined,
    spoil: c.spoil ? layer(c.spoil) : undefined,
    chambers: c.chambers ? { cell: layer(c.chambers.cell), list: c.chambers.roles.map((role) => ({ role })) } : undefined,
  } as unknown as WorldMap;
}

interface Over extends Partial<Omit<FieldCtx, "spores">> {
  cells?: Cells;
  sensed?: Float32Array;
  food?: Float32Array;
  home?: Float32Array;
  alarm?: Float32Array;
  spores?: Float32Array;
}

function field(game: Game | null, o: Over = {}) {
  const rec = recordingContext();
  const { cells, sensed, food, home, alarm, spores, ...over } = o;
  const k = {
    ctx: rec.ctx,
    theme: THEME,
    d: 1,
    v: { w: 800, h: 600, dpr: 1 },
    c: { x: 32, y: 20, zoom: 16 },
    lv: PLANE,
    m: stubMap(cells ?? {}),
    ext: { x0: 0, w: 64, h: 64 },
    world: game?.world,
    colonies: [],
    fungus: {},
    smellAll: false,
    strip: false,
    trails: food || home ? [{ food: layer(food), home: layer(home), odour: 0.5 }] : [],
    alarms: alarm ? [layer(alarm)] : [],
    spores: layer(spores),
    sensedLayer: sensed ? layer(sensed) : null,
    sensedNow: NOW,
    ...over,
  } as unknown as FieldCtx;
  const e = env();
  return { k, ground: new Ground(e.env), ...rec, canvases: e.canvases, paths: e.paths };
}

const cell = (x: number, y: number) => y * CHUNK + x;
/** The pixel of cell (x, y) in the chunk's colour buffer. */
const px = (img: ImageData, x: number, y: number): number[] => [...img.data.slice(cell(x, y) * 4, cell(x, y) * 4 + 4)];
const paint = (f: ReturnType<typeof field>, show: GroundShow = SHOW, foodAsSprites = false) => {
  const cc = f.ground.chunkCanvas(0, 0);
  f.ground.paintChunk(f.k, show, 0, 0, cc, f.k.m.rock.chunk(0, 0)!, foodAsSprites);
  return cc.img;
};

test("terrain: rock, soil and sky fill their cells opaque in the ground palette (the page's own in smell vision); a cell past the map's edge is clear", () => {
  const rock = new Uint8Array(CHUNK * CHUNK);
  rock[cell(1, 1)] = ROCK;
  rock[cell(2, 1)] = SOIL;
  rock[cell(3, 1)] = AIR;
  const f = field(null, { cells: { rock, width: 66, height: 3 } });
  const img = paint(f);
  assert.deepEqual(px(img, 1, 1), [...CLOSE_SPRITE_GROUND.rock, 255]);
  assert.deepEqual(px(img, 2, 1), [...CLOSE_SPRITE_GROUND.soil, 255]);
  assert.deepEqual(px(img, 3, 1), [...THEME.sky, 255], "the sky is the page's");
  assert.deepEqual(px(img, 4, 1), [0, 0, 0, 0], "open ground with nothing on it: clear");
  const smell = field(null, { cells: { rock, width: 66, height: 3 }, smellAll: true });
  const simg = paint(smell);
  assert.deepEqual(px(simg, 1, 1), [...THEME.rock, 255], "in smell vision the page's rock");
  assert.deepEqual(px(simg, 2, 1), [...THEME.soil, 255]);
  assert.equal(groundRock(smell.k), THEME.rock);
  assert.equal(groundSoil(smell.k), THEME.soil);
  assert.equal(groundSpoil(smell.k), THEME.spoil);
  assert.equal(groundPaper(smell.k), THEME.paperRgb);
  assert.equal(groundPaper(f.k), CLOSE_SPRITE_GROUND.surface, "the plane's paper");
  assert.equal(groundPaper({ ...f.k, lv: CURTAIN } as FieldCtx), CLOSE_SPRITE_GROUND.back, "and the curtain's back wall");
  assert.equal(groundSpoil(f.k), CLOSE_SPRITE_GROUND.spoil);
});

test("food: an ink wash by amount in the accent colour, sugar and crumbs in their own, none where sprites show the food", () => {
  const food = new Float32Array(CHUNK * CHUNK);
  const quality = new Float32Array(CHUNK * CHUNK).fill(1);
  food[cell(1, 1)] = 1; // plain: accent, alpha 120 + 12
  food[cell(2, 1)] = 50; // plenty: capped at 255
  food[cell(3, 1)] = 2;
  quality[cell(3, 1)] = 1.5; // sugar
  food[cell(4, 1)] = 2;
  quality[cell(4, 1)] = 0.5; // crumbs
  food[cell(5, 1)] = 2;
  quality[cell(5, 1)] = 1.01; // within the plain band
  food[cell(6, 1)] = 2;
  quality[cell(6, 1)] = 0.995; // and below, up to 0.99
  const f = field(null, { cells: { food, quality } });
  const img = paint(f);
  assert.deepEqual(px(img, 1, 1), [...THEME.accentRgb, 132]);
  assert.deepEqual(px(img, 2, 1), [...THEME.accentRgb, 255]);
  assert.deepEqual(px(img, 3, 1), [...SUGAR_RGB, 144]);
  assert.deepEqual(px(img, 4, 1), [...CRUMB_RGB, 144]);
  assert.deepEqual(px(img, 5, 1), [...THEME.accentRgb, 144], "1.01 is still plain food");
  assert.deepEqual(px(img, 6, 1), [...THEME.accentRgb, 144], "and 0.995");
  const sprites = field(null, { cells: { food, quality } });
  assert.deepEqual(px(paint(sprites, SHOW, true), 1, 1), [0, 0, 0, 0], "aerial sprites show the food: no wash");
  const rock = new Uint8Array(CHUNK * CHUNK);
  rock[cell(1, 1)] = ROCK;
  const under = field(null, { cells: { food, quality, rock } });
  assert.deepEqual(px(paint(under), 1, 1), [...CLOSE_SPRITE_GROUND.rock, 255], "rock hides food");
});

test("scent: a trail or alarm shows only where hosts sensed it lately (or in smell vision), as strongly as it is fresh; alarm over spores over the mound over trails", () => {
  const alarm = new Float32Array(CHUNK * CHUNK);
  const spores = new Float32Array(CHUNK * CHUNK);
  const spoil = new Uint16Array(CHUNK * CHUNK);
  const food = new Float32Array(CHUNK * CHUNK);
  const home = new Float32Array(CHUNK * CHUNK);
  const sensed = new Float32Array(CHUNK * CHUNK).fill(-Infinity);
  const at = (x: number) => cell(x, 1);
  // 1: alarm at full, sensed just now
  alarm[at(1)] = ALARM_FULL;
  sensed[at(1)] = FRESH;
  // 2: alarm half-fresh and half-strong, over spores that would show
  alarm[at(2)] = ALARM_FULL / 2;
  sensed[at(2)] = FRESH - SENSED_FADE / 2;
  spores[at(2)] = SPORE_FULL;
  // 3: spores at full; 4: spores under the threshold; 5: spores and the mound together; 6: the mound alone
  spores[at(3)] = SPORE_FULL;
  spores[at(4)] = SPORE_SHOWN / 2;
  spores[at(5)] = SPORE_FULL / 2;
  spoil[at(5)] = 2;
  spoil[at(6)] = 3;
  // 7: a food trail and a home trail on a cell sensed just now: the stronger shows; 8: a home trail alone; 9: sensed long ago
  food[at(7)] = FOOD_FULL;
  home[at(7)] = HOME_FULL;
  sensed[at(7)] = FRESH;
  home[at(8)] = HOME_FULL;
  sensed[at(8)] = FRESH;
  food[at(9)] = FOOD_FULL;
  sensed[at(9)] = FRESH - SENSED_FADE * 2;
  // 10: a trail nobody sensed
  food[at(10)] = FOOD_FULL;
  for (const x of [3, 4, 5, 6]) sensed[at(x)] = FRESH;
  const f = field(null, { cells: { spoil }, sensed, food, home, alarm, spores });
  const img = paint(f);
  assert.deepEqual(px(img, 1, 1), [...THEME.alarm, 190], "alarm: 40 + 150 of full strength");
  assert.deepEqual(px(img, 2, 1), [...THEME.alarm, Math.round(40 + 0.25 * 150)], "half fresh, half strong: a quarter of it");
  assert.deepEqual(px(img, 3, 1), [...THEME.sporeRgb, 165], "spores: 35 + 130 of full");
  assert.deepEqual(px(img, 4, 1), [0, 0, 0, 0], "under the spore threshold: nothing");
  assert.deepEqual(px(img, 5, 1), [...THEME.sporeRgb, Math.round(35 + 0.5 * 130)], "spores over the mound");
  assert.deepEqual(px(img, 6, 1), [...CLOSE_SPRITE_GROUND.spoil, 110 + 3 * 45], "the mound, by its height");
  assert.deepEqual(px(img, 7, 1), [...THEME.trail, 150], "a food trail at full: 150; the home trail's 90 is under it");
  assert.deepEqual(px(img, 8, 1), [...HOME_RGB, 90], "a home trail alone");
  assert.deepEqual(px(img, 9, 1), [0, 0, 0, 0], "sensed twice the fade ago: nothing");
  assert.deepEqual(px(img, 10, 1), [0, 0, 0, 0], "a trail no host sensed: nothing");
  spoil[at(6)] = 10;
  const big = field(null, { cells: { spoil }, sensed, food, home, alarm, spores });
  assert.equal(px(paint(big), 6, 1)[3], 255, "the mound's alpha is at most 255");
  // the settings: no food trail, no home trail
  const noFood = field(null, { sensed, food, home });
  assert.deepEqual(px(paint(noFood, { food: false, home: true }), 7, 1), [...HOME_RGB, 90], "no food trails: the home trail shows");
  const noHome = field(null, { sensed, food, home });
  assert.deepEqual(px(paint(noHome, { food: true, home: false }), 8, 1), [0, 0, 0, 0], "no home trails: none");
  // smell vision: everything, everywhere, each food trail in its colony's tone
  const smell = field(null, { sensed, food, home, smellAll: true });
  const simg = paint(smell, { food: false, home: true });
  assert.deepEqual(
    px(simg, 10, 1),
    [...odourRgb(THEME.inkRgb, THEME.warnRgb, 0.5), 150],
    "smell vision: a trail nobody sensed, in its colony's tone, whatever the setting",
  );
  assert.deepEqual(px(simg, 9, 1), [...odourRgb(THEME.inkRgb, THEME.warnRgb, 0.5), 150]);
});

test("scent edge cases: an alarm past its full strength is capped, a colony with only a home trail still shows it", () => {
  const alarm = new Float32Array(CHUNK * CHUNK);
  const sensed = new Float32Array(CHUNK * CHUNK).fill(-Infinity);
  const home = new Float32Array(CHUNK * CHUNK);
  alarm[cell(1, 1)] = ALARM_FULL * 3;
  sensed[cell(1, 1)] = FRESH;
  home[cell(2, 1)] = HOME_FULL;
  sensed[cell(2, 1)] = FRESH;
  const f = field(null, {
    sensed,
    alarm,
    trails: [{ food: layer(undefined), home: layer(home), odour: 0 }] as unknown as FieldCtx["trails"],
  });
  const img = paint(f);
  assert.deepEqual(px(img, 1, 1), [...THEME.alarm, 190], "capped at full: 40 + 150");
  assert.deepEqual(px(img, 2, 1), [...HOME_RGB, 90], "a home trail of a colony with no food trail here");
});

test("chambers: a faint wash in the room's role colour, the page's chamber colour for a role with none, fainter for none", () => {
  const cellsOf = new Uint8Array(CHUNK * CHUNK);
  cellsOf[cell(1, 1)] = 1; // the first chamber
  cellsOf[cell(2, 1)] = 2;
  cellsOf[cell(3, 1)] = 3; // none listed
  const f = field(null, { cells: { chambers: { cell: cellsOf, roles: ["brood", "none"] } } });
  const img = paint(f);
  assert.deepEqual(px(img, 1, 1), [...(ROLE_RGB.brood ?? THEME.chamber), 70]);
  assert.deepEqual(px(img, 2, 1), [...(ROLE_RGB.none ?? THEME.chamber), 55], "a role of none: fainter");
  assert.deepEqual(px(img, 3, 1), [...THEME.chamber, 55], "an id with no chamber: the page's colour, as none");
});

test("the cache: a chunk is painted again only when its inputs, the settings, the theme or (once sensed) the clock change", () => {
  const rock = new Uint8Array(CHUNK * CHUNK);
  const food = new Float32Array(CHUNK * CHUNK);
  const sensed = new Float32Array(CHUNK * CHUNK).fill(-Infinity);
  const f = field(null, { cells: { rock }, sensed, food });
  const cc = f.ground.chunkCanvas(0, 0);
  const puts = () => (cc.canvas as unknown as RecordedCanvas).rec.log.filter((l) => l.startsWith("putImageData(")).length;
  const again = (k: FieldCtx = f.k, show: GroundShow = SHOW) => f.ground.paintChunk(k, show, 0, 0, cc, rock, false);
  again();
  assert.deepEqual([f.ground.paints, f.ground.hits, puts()], [1, 0, 1], "the first paint");
  again();
  assert.deepEqual([f.ground.paints, f.ground.hits, puts()], [1, 1, 1], "nothing changed: served from the cache, no put");
  rock[5] = ROCK;
  again();
  assert.deepEqual([f.ground.paints, f.ground.hits], [2, 1], "a byte of the terrain changed");
  again();
  assert.equal(f.ground.paints, 2);
  again(f.k, { food: false, home: true });
  assert.equal(f.ground.paints, 3, "a setting changed");
  again(f.k, { food: false, home: true });
  assert.equal(f.ground.paints, 3);
  again({ ...f.k, smellAll: true } as FieldCtx, { food: false, home: true });
  assert.equal(f.ground.paints, 4, "smell vision toggled");
  f.ground.clearTiles();
  again({ ...f.k, smellAll: true } as FieldCtx, { food: false, home: true });
  assert.equal(f.ground.paints, 5, "the theme changed: every chunk again");
  f.ground.beginFrame();
  assert.deepEqual([f.ground.paints, f.ground.hits], [0, 0]);
  const later = { ...f.k, sensedNow: NOW + 1 } as FieldCtx;
  again(later);
  assert.equal(f.ground.paints, 1, "a layer of what hosts sensed is there: the clock matters to the fade");
  again(later);
  assert.equal(f.ground.paints, 1);
  const unsensed = field(null, { cells: { rock } });
  const cu = unsensed.ground.chunkCanvas(0, 0);
  unsensed.ground.paintChunk(unsensed.k, SHOW, 0, 0, cu, rock, false);
  unsensed.ground.paintChunk({ ...unsensed.k, sensedNow: NOW + 50 } as FieldCtx, SHOW, 0, 0, cu, rock, false);
  assert.deepEqual([unsensed.ground.paints, unsensed.ground.hits], [1, 1], "with no one sensing, the clock does not matter");
  unsensed.ground.paintChunk({ ...unsensed.k, smellAll: true } as FieldCtx, SHOW, 0, 0, cu, rock, false);
  assert.equal(unsensed.ground.paints, 2, "smell vision alone repaints a chunk nobody sensed");
  // each chunk is its own: the cache keeps a snapshot for each
  const other = f.ground.chunkCanvas(1, 0);
  f.ground.paintChunk(f.k, SHOW, 0, 0, other, rock, false);
  assert.equal(f.ground.paints, 2, "another chunk's canvas is painted on its own account");
  assert.notEqual(other, cc);
  assert.equal(f.ground.chunkCanvas(1, 0), other, "and made once");
  f.ground.clear();
  assert.notEqual(f.ground.chunkCanvas(0, 0), cc, "a cleared ground makes its chunks again");
});

/** The plane cell under column s of the line (the lookup the strip's layer uses). */
function columnCell(g: Game, s: number): [number, number] {
  assert.ok(cellAt(g.world.line, s), "the column is on the line");
  return [CELL[0], CELL[1]];
}

test("the side view's strip: the plane cell under each column of the line, its ground and the mound's cut, painted in the chunk that holds the strip's row and always afresh", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const { plane, curtain } = g.world;
  const s = g.world.line.sHole[0]! + 3;
  const [rx, ry] = columnCell(g, s);
  const [fx, fy] = columnCell(g, s + 1);
  const [ax, ay] = columnCell(g, s + 2);
  const [mx, my] = columnCell(g, s + 3);
  plane.rock.set(rx, ry, ROCK); // rock
  plane.rock.set(fx, fy, OPEN); // open, no food
  plane.food.set(fx, fy, 0);
  plane.rock.set(ax, ay, OPEN); // food
  plane.food.set(ax, ay, 5);
  plane.rock.set(mx, my, OPEN); // a mound of three
  plane.food.set(mx, my, 0);
  plane.spoil!.set(mx, my, 3);
  const f = field(g, { m: curtain, lv: CURTAIN, strip: true, ext: { x0: curtain.x0, w: curtain.size.w, h: curtain.size.h } });
  const cx = s >> 6;
  const cc = f.ground.chunkCanvas(cx, 0);
  const rc = curtain.rock.chunk(cx, 0) ?? new Uint8Array(CHUNK * CHUNK);
  f.ground.paintChunk(f.k, SHOW, cx, 0, cc, rc, false);
  const lx = (col: number) => col - cx * CHUNK;
  assert.deepEqual(px(cc.img, lx(s), STRIP), [...THEME.rock, 255], "rock under the column: rock on the strip");
  assert.equal(px(cc.img, lx(s + 1), STRIP)[3], 0, "open ground: clear, the paper as the walkway");
  assert.deepEqual(px(cc.img, lx(s + 2), STRIP), [...THEME.accentRgb, 120 + 60], "food: the accent colour, by amount");
  for (let up = 1; up <= 3; up++) assert.deepEqual(px(cc.img, lx(s + 3), STRIP - up), [...THEME.spoil, 255], `the cut's level ${up}`);
  assert.deepEqual(px(cc.img, lx(s + 3), STRIP - 4), [...THEME.sky, 255], "no higher than the mound is: the sky");
  assert.deepEqual([f.ground.paints, f.ground.hits], [1, 0]);
  assert.ok(
    (cc.canvas as unknown as RecordedCanvas).rec.log.includes("putImageData(ImageData(64x64), 0, 0)"),
    "the buffer reaches the canvas",
  );
  f.ground.paintChunk(f.k, SHOW, cx, 0, cc, rc, false);
  assert.deepEqual([f.ground.paints, f.ground.hits], [2, 0], "the strip's chunk is never served from the cache");
  plane.spoil!.set(mx, my, 99);
  f.ground.paintChunk(f.k, SHOW, cx, 0, cc, rc, false);
  assert.deepEqual(px(cc.img, lx(s + 3), 0), [...THEME.spoil, 255], "a tall mound's cut reaches the top of the sky (STRIP levels)");
  // stripAt: the same, one cell at a time
  plane.spoil!.set(mx, my, 3);
  const sk = f.k;
  assert.deepEqual(stripAt(sk, s, STRIP), THEME.rock);
  assert.deepEqual(stripAt(sk, s + 1, STRIP), THEME.paperRgb);
  assert.deepEqual(stripAt(sk, s + 2, STRIP), THEME.accentRgb);
  assert.equal(stripAt(sk, s + 3, STRIP - 3), THEME.spoil);
  assert.equal(stripAt(sk, s + 3, STRIP - 4), null, "above the cut: sky");
  assert.equal(stripAt(sk, s + 3, STRIP + 1), null, "below the strip: not its");
  assert.equal(stripAt(sk, g.world.line.sMax + 40, STRIP), null, "off the line: nothing");
});

const rgb = (c: ArrayLike<number>) => `rgb(${c[0]},${c[1]},${c[2]})`;

test("draw, zoomed out: each chunk in view is a canvas of its own, painted once, laid on as one strip a cell high for each row, odd rows half a cell right; a chunk with no terrain is skipped", () => {
  const rock = new Uint8Array(CHUNK * CHUNK);
  rock[cell(3, 2)] = ROCK;
  const f = field(null, { cells: { rock }, c: { x: 32, y: 32, zoom: 5 } as FieldCtx["c"] });
  const win = { rx0: 0, rx1: 70, ry0: 2, ry1: 4 }; // chunk 1 has no terrain in this map
  f.ground.draw(f.k, SHOW, win, 0, false);
  assert.equal(f.canvases.length, 1, "one canvas: for chunk (0, 0)");
  const chunk = f.canvases[0]!;
  assert.deepEqual(
    chunk.rec.log.filter((l) => !l.startsWith("createImageData")),
    ["putImageData(ImageData(64x64), 0, 0)"],
    "its buffer put once",
  );
  const draws = f.log.filter((l) => l.startsWith("drawImage("));
  assert.equal(draws.length, 3, "rows 2 to 4");
  for (const [n, y] of [2, 3, 4].entries()) {
    const [ax, ay] = toScreen(f.k.c, f.k.v, 0.5 * (y & 1), y * R);
    const [bx, by] = toScreen(f.k.c, f.k.v, CHUNK + 0.5 * (y & 1), (y + 1) * R);
    const dx = Math.round(ax);
    const dy = Math.round(ay);
    assert.equal(draws[n], `drawImage(${chunk}, 0, ${y}, 64, 1, ${dx}, ${dy}, ${Math.round(bx) - dx}, ${Math.round(by) - dy})`);
  }
  assert.equal(f.paths.length, 0, "no hexagon");
  assert.deepEqual([f.ground.paints, f.ground.hits], [1, 0]);
  f.ground.beginFrame();
  f.ground.draw(f.k, SHOW, win, 0, false);
  assert.deepEqual([f.ground.paints, f.ground.hits], [0, 1], "the next frame: from the cache");
  assert.equal(f.canvases.length, 1);
});

/** The colour a wash of the ground palette gets over the paper: its opacity in fifteenths, mixed, as the hexagons are filled. */
function blended(colour: ArrayLike<number>, alpha: number, paper: ArrayLike<number>, fade = 1): number[] {
  const a = (Math.round((alpha / 255) * 15) / 15) * fade;
  return [0, 1, 2].map((j) => Math.round(colour[j]! * a + paper[j]! * (1 - a)));
}

test("draw, up close: the paper, then a hexagon of the ground's colour for each painted cell, one path for each colour, the mound's tint under its pellets", () => {
  const rock = new Uint8Array(CHUNK * CHUNK);
  const food = new Float32Array(CHUNK * CHUNK);
  const spoil = new Uint16Array(CHUNK * CHUNK);
  rock[cell(3, 2)] = ROCK;
  food[cell(4, 2)] = 1;
  food[cell(7, 2)] = 1; // the same wash as (4, 2): the same path
  spoil[cell(6, 2)] = 2;
  const c = { x: 5, y: 2.5, zoom: 16 };
  const f = field(null, { cells: { rock, food, spoil }, c: c as FieldCtx["c"] });
  const win = { rx0: 0, rx1: 10, ry0: 1, ry1: 3 };
  const hexMix = 1;
  f.ground.draw(f.k, SHOW, win, hexMix, false);
  assert.equal(f.log.filter((l) => l.startsWith("drawImage(")).length, 0, "no bricks");
  const paper = CLOSE_SPRITE_GROUND.surface;
  const [ax, ay] = toScreen(c, f.k.v, 0, 0);
  const [bx, by] = toScreen(c, f.k.v, 64, 64);
  assert.ok(f.log.indexOf(`fillStyle = ${rgb(paper)}`) >= 0);
  assert.equal(
    f.log[f.log.indexOf(`fillStyle = ${rgb(paper)}`) + 1],
    `fillRect(${r3(ax)}, ${r3(ay)}, ${r3(bx - ax)}, ${r3(by - ay)})`,
    "the paper over the whole map first",
  );
  // the colours: the rock opaque, the food wash and the mound's tint over the paper
  const rockColour = blended(CLOSE_SPRITE_GROUND.rock, 255, paper);
  const foodColour = blended(THEME.accentRgb, 132, paper);
  const pelletAlpha = (16 - 12) / 8;
  const tintColour = blended(CLOSE_SPRITE_GROUND.spoil, 110 + 2 * 45, paper, 1 - pelletAlpha * pelletAlpha);
  const fills = f.log.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith("fill(path"));
  const fillStyles = (i: number) =>
    f.log
      .slice(0, i)
      .reverse()
      .find((l) => l.startsWith("fillStyle = "));
  assert.equal(fills.length, 3, "the rock, the food, the mound's tint");
  const colours = fills.map(([, i]) => fillStyles(i));
  assert.ok(colours.includes(`fillStyle = ${rgb(rockColour)}`), "rock");
  assert.ok(colours.includes(`fillStyle = ${rgb(foodColour)}`), "the food wash, its alpha in fifteenths");
  // the mound's tint is drawn first, then the pellets, then the rest
  const tintAt = fills[0]!;
  assert.equal(
    fillStyles(tintAt[1]),
    `fillStyle = ${rgb(tintColour)}`,
    "the tint comes before every other path: the heap's colour, faded as the pellets come in",
  );
  const save = f.log.indexOf("save()", tintAt[1]);
  const restore = f.log.indexOf("restore()", save);
  assert.ok(save > tintAt[1] && restore > save && fills[1]![1] > restore, "then the pellets, in a save and restore, then the paths");
  assert.equal(f.log[save + 1], `globalAlpha = ${pelletAlpha}`, "the pellets as opaque as the mound's tint is gone");
  const x = 16 * 0.5 * (1 + 0.04 * hexMix);
  const balls = moundBalls(2, cellKey(6, 2));
  assert.equal(callsOf(f.log.slice(save, restore), "arc").length, balls.length, "a pellet for each ball of the heap");
  // the geometry of the rock's hexagon at (3, 2): the six vertices round its centre, a flat-sided hexagon pointing up
  const shoulder = 16 * (R / 2 + (SIDE * 0.52 - R / 2) * hexMix);
  const tip = 16 * (R / 2 + (SIDE * 1.04 - R / 2) * hexMix);
  const ox = 800 / 2 - c.x * 16;
  const oy = 600 / 2 - c.y * 16;
  const sx = (3 + 0.5 + 0.5 * (2 & 1)) * 16 + ox;
  const sy = (2 + 0.5) * R * 16 + oy;
  const rockPath = f.paths.find((p) => p.cmds.length === 7 && p.cmds[0] === `moveTo(${r3(sx + x)}, ${r3(sy + shoulder)})`)!;
  assert.ok(rockPath, "a path of one hexagon that starts at the first vertex of cell (3, 2)");
  assert.deepEqual(rockPath.cmds, [
    `moveTo(${r3(sx + x)}, ${r3(sy + shoulder)})`,
    `lineTo(${r3(sx)}, ${r3(sy + tip)})`,
    `lineTo(${r3(sx - x)}, ${r3(sy + shoulder)})`,
    `lineTo(${r3(sx - x)}, ${r3(sy - shoulder)})`,
    `lineTo(${r3(sx)}, ${r3(sy - tip)})`,
    `lineTo(${r3(sx + x)}, ${r3(sy - shoulder)})`,
    "closePath()",
  ]);
  const foodPath = f.paths.find((p) => p.cmds.length === 14)!;
  assert.ok(foodPath, "the two food cells are one path of two hexagons");
});

test("the map's edges: a cell outside the map's columns or rows is clear, whatever is under it; the first column is the map's x0", () => {
  const rock = new Uint8Array(CHUNK * CHUNK).fill(ROCK);
  const plain = field(null, { cells: { rock, width: 40, height: 3 } });
  const img = paint(plain);
  assert.equal(px(img, 0, 0)[3], 255);
  assert.equal(px(img, 39, 2)[3], 255, "the last column and row");
  assert.equal(px(img, 40, 0)[3], 0, "one column past the width");
  assert.equal(px(img, 0, 3)[3], 0, "one row past the height");
  const shifted = field(null, { cells: { rock, width: 40, height: 3, x0: 2 } });
  const simg = paint(shifted);
  assert.equal(px(simg, 1, 0)[3], 0, "a column before the map's first");
  assert.equal(px(simg, 2, 0)[3], 255, "the first");
  assert.equal(px(simg, 41, 0)[3], 255, "the last: x0 + width - 1");
  assert.equal(px(simg, 42, 0)[3], 0);
});

test("the cache keeps a snapshot of every input: a change in any layer, setting, tone or the map's own size paints the chunk again", () => {
  const n = CHUNK * CHUNK;
  const arrays = {
    rock: new Uint8Array(n),
    food: new Float32Array(n),
    quality: new Float32Array(n).fill(1),
    spoil: new Uint16Array(n),
    chamber: new Uint8Array(n),
    sensed: new Float32Array(n).fill(-Infinity),
    spores: new Float32Array(n),
    trailFood: new Float32Array(n),
    trailHome: new Float32Array(n),
    alarm: new Float32Array(n),
  };
  const f = field(null, {
    cells: {
      rock: arrays.rock,
      food: arrays.food,
      quality: arrays.quality,
      spoil: arrays.spoil,
      chambers: { cell: arrays.chamber, roles: ["brood"] },
    },
    sensed: arrays.sensed,
    spores: arrays.spores,
    food: arrays.trailFood,
    home: arrays.trailHome,
    alarm: arrays.alarm,
    world: {} as never, // a world is there, and this is not the strip's chunk
  });
  const cc = f.ground.chunkCanvas(0, 0);
  const run = (k: FieldCtx = f.k, show: GroundShow = SHOW, sprites = false) => f.ground.paintChunk(k, show, 0, 0, cc, arrays.rock, sprites);
  run();
  run();
  assert.deepEqual([f.ground.paints, f.ground.hits], [1, 1], "with a world present, a chunk that is not the strip's is kept");
  let expected = 1;
  const changes = (what: string, change: () => void, k: FieldCtx = f.k, show: GroundShow = SHOW, sprites = false) => {
    change();
    run(k, show, sprites);
    expected++;
    assert.equal(f.ground.paints, expected, `${what}: painted again`);
    run(k, show, sprites);
    assert.equal(f.ground.paints, expected, `${what}: and then kept`);
  };
  changes("the terrain", () => (arrays.rock[9] = ROCK));
  changes("the food", () => (arrays.food[9] = 1));
  changes("the food's quality", () => (arrays.quality[9] = 1.5));
  changes("the mound", () => (arrays.spoil[9] = 1));
  changes("a chamber", () => (arrays.chamber[9] = 1));
  changes("what hosts sensed", () => (arrays.sensed[9] = 5));
  changes("the spores", () => (arrays.spores[9] = 1));
  changes("a food trail", () => (arrays.trailFood[9] = 1));
  changes("a home trail", () => (arrays.trailHome[9] = 1));
  changes("an alarm", () => (arrays.alarm[9] = 1));
  changes("the food setting", () => {}, f.k, { food: false, home: true });
  changes("the home setting", () => {}, f.k, { food: false, home: false });
  changes("sprites showing the food", () => {}, f.k, { food: false, home: false }, true);
  changes("smell vision", () => {}, { ...f.k, smellAll: true } as FieldCtx, { food: false, home: false }, true);
  changes(
    "a colony's tone in smell vision",
    () => {},
    { ...f.k, smellAll: true, trails: [{ ...f.k.trails[0]!, odour: 0.9 }] } as FieldCtx,
    { food: false, home: false },
    true,
  );
  changes("the map's size", () => {}, { ...f.k, m: { ...f.k.m, size: { w: 50, h: 64 } } } as FieldCtx, { food: false, home: false }, true);
  changes(
    "the map's first column",
    () => {},
    { ...f.k, m: { ...f.k.m, size: { w: 50, h: 64 }, x0: 3 } } as FieldCtx,
    { food: false, home: false },
    true,
  );
  changes(
    "a chamber's role",
    () => {},
    {
      ...f.k,
      m: { ...f.k.m, size: { w: 50, h: 64 }, x0: 3, chambers: { ...f.k.m.chambers!, list: [{ role: "stores" }] } },
    } as unknown as FieldCtx,
    { food: false, home: false },
    true,
  );
  // the clock matters while hosts sensed anything, not in smell vision (everything shows in full)
  const base = f.k;
  run(base);
  expected = f.ground.paints;
  changes("the sensed clock", () => {}, { ...base, sensedNow: NOW + 3 } as FieldCtx);
  run({ ...base, smellAll: true } as FieldCtx);
  const before = f.ground.paints;
  run({ ...base, smellAll: true, sensedNow: NOW + 9 } as FieldCtx);
  assert.equal(f.ground.paints, before, "in smell vision the clock does not matter");
});

test("trails: where two colonies' trails are equally strong, the first colony's tone shows; the setting hides the food trail, not the home trail", () => {
  const food = new Float32Array(CHUNK * CHUNK);
  const second = new Float32Array(CHUNK * CHUNK);
  food[cell(1, 1)] = FOOD_FULL;
  second[cell(1, 1)] = FOOD_FULL; // as strong
  second[cell(2, 1)] = FOOD_FULL; // alone
  const f = field(null, { smellAll: true });
  const k = {
    ...f.k,
    trails: [
      { food: layer(food), home: layer(undefined), odour: 0.2 },
      { food: layer(second), home: layer(undefined), odour: 0.8 },
    ],
  } as FieldCtx;
  const img = paint({ ...f, k } as typeof f);
  assert.deepEqual(px(img, 1, 1), [...odourRgb(THEME.inkRgb, THEME.warnRgb, 0.2), 150], "a tie: the first");
  assert.deepEqual(px(img, 2, 1), [...odourRgb(THEME.inkRgb, THEME.warnRgb, 0.8), 150], "the second where it is alone");
});

test("isBare: a cell whose pixel is clear, and only where its chunk has been painted", () => {
  const rock = new Uint8Array(CHUNK * CHUNK);
  rock[cell(1, 1)] = ROCK;
  const f = field(null, { cells: { rock } });
  assert.equal(f.ground.isBare(1, 1), false, "no chunk yet: not bare");
  paint(f);
  assert.equal(f.ground.isBare(1, 1), false, "rock is painted");
  assert.equal(f.ground.isBare(2, 1), true, "open ground with nothing on it");
  assert.equal(f.ground.isBare(200, 1), false, "another chunk, not painted");
  const c = f.ground.chunkCanvas(0, 0);
  assert.deepEqual(
    [c.canvas.width, c.canvas.height, c.img.width, c.img.height],
    [CHUNK, CHUNK, CHUNK, CHUNK],
    "a chunk's canvas and buffer are 64 by 64",
  );
});

test("draw, between bricks and hexagons: any blend draws hexagons and no bricks", () => {
  const rock = new Uint8Array(CHUNK * CHUNK);
  rock[cell(3, 2)] = ROCK;
  const f = field(null, { cells: { rock }, c: { x: 5, y: 2.5, zoom: 12 } as FieldCtx["c"] });
  f.ground.draw(f.k, SHOW, { rx0: 0, rx1: 10, ry0: 1, ry1: 3 }, 0.3, false);
  assert.equal(f.log.filter((l) => l.startsWith("drawImage(")).length, 0);
  assert.ok(
    f.paths.some((p) => p.cmds.length === 7),
    "a hexagon",
  );
  const x = 12 * 0.5 * (1 + 0.04 * 0.3);
  const hex = f.paths.find((p) => p.cmds.length === 7)!;
  const first = hex.cmds[0]!.match(/moveTo\(([\d.-]+), ([\d.-]+)\)/)!;
  const second = hex.cmds[1]!.match(/lineTo\(([\d.-]+), ([\d.-]+)\)/)!;
  assert.ok(
    Math.abs(Number(first[1]) - Number(second[1]) - x) < 1e-2,
    "the half-width scales with the blend: wider than a cell by 0.04 of it",
  );
});

test("draw, up close: odd rows are half a cell right of even rows, the pellets are drawn as the oracle says (open ground only), the paths of a frame are not kept for the next", () => {
  const rock = new Uint8Array(CHUNK * CHUNK);
  const spoil = new Uint16Array(CHUNK * CHUNK);
  rock[cell(3, 2)] = ROCK;
  rock[cell(3, 3)] = ROCK;
  spoil[cell(6, 2)] = 6; // open: pellets
  rock[cell(8, 2)] = ROCK;
  spoil[cell(8, 2)] = 6; // under rock: none
  const c = { x: 5, y: 2.5, zoom: 32 };
  const f = field(null, { cells: { rock, spoil }, c: c as FieldCtx["c"], v: { w: 800, h: 600, dpr: 2 } as FieldCtx["v"] });
  const win = { rx0: 0, rx1: 10, ry0: 1, ry1: 3 };
  f.ground.draw(f.k, SHOW, win, 1, false);
  // rows: the rock at (3, 2) and (3, 3): the odd row's hexagon is half a cell (zoom / 2) right of where the even row's would be
  const rockPath = f.paths.find((p) => p.cmds.length === 21)!;
  assert.ok(rockPath, "the three rock cells share a path: (3, 2), (8, 2), then (3, 3)");
  const [x2, x3] = [Number(rockPath.cmds[0]!.match(/moveTo\(([\d.-]+),/)![1]), Number(rockPath.cmds[14]!.match(/moveTo\(([\d.-]+),/)![1])];
  assert.ok(Math.abs(x3 - x2 - 32 / 2) < 1e-2, "the odd row half a cell to the right");
  // the pellets: at dpr 2 the zoom is 16 CSS px a cell: past the 12 where they start
  const pelletAlpha = (32 / 2 - 12) / 8;
  assert.equal(pelletAlpha, 0.5);
  const arcs = f.log.filter((l) => l.startsWith("arc("));
  const ox = 800 / 2 - c.x * 32;
  const oy = 600 / 2 - c.y * 32;
  const shift = 0.5 + 0.5 * (2 & 1);
  const expected = moundBalls(6, cellKey(6, 2))
    .map((b) => ({ ...b, x: b.x + 6 + shift, y: b.y + (2 + 0.5) * R }))
    .sort((a, b) => a.z - b.z)
    .map((b) => `arc(${r3(b.x * 32 + ox)}, ${r3(b.y * 32 + oy)}, ${r3(b.radius * 32)}, 0, 6.283)`);
  assert.deepEqual(arcs, expected, "a pellet for each ball of the open cell's heap, low to high; none for the heap under rock");
  assert.ok(f.log.includes(`globalAlpha = ${pelletAlpha}`));
  // a second frame: the same picture, not the paths of the first added to
  const fillsOf = (log: string[]) => log.filter((l) => l.startsWith("fill(path"));
  const first = fillsOf(f.log);
  const log2 = recordingContext();
  const k2 = { ...f.k, ctx: log2.ctx } as FieldCtx;
  f.ground.draw(k2, SHOW, win, 1, false);
  assert.equal(fillsOf(log2.log).length, first.length);
  assert.deepEqual(
    fillsOf(log2.log).map((l) => l.split("; ").length),
    first.map((l) => l.split("; ").length),
    "a path of the second frame is the second frame's cells only",
  );
});

test("draw, up close: a food wash that happens to be the mound's colour is not the mound's tint (a heap makes it)", () => {
  const food = new Float32Array(CHUNK * CHUNK);
  food[cell(4, 2)] = 1;
  const theme = { ...THEME, accentRgb: CLOSE_SPRITE_GROUND.spoil } as FieldTheme;
  const f = field(null, { cells: { food }, theme, c: { x: 5, y: 2.5, zoom: 24 } as FieldCtx["c"] });
  f.ground.draw(f.k, SHOW, { rx0: 0, rx1: 10, ry0: 1, ry1: 3 }, 1, false);
  const paper = CLOSE_SPRITE_GROUND.surface;
  assert.equal(f.log.filter((l) => l === "save()").length, 0, "no pellets");
  assert.ok(
    f.log.includes(`fillStyle = ${rgb(blended(CLOSE_SPRITE_GROUND.spoil, 132, paper))}`),
    "filled at its own opacity, not the tint's fade",
  );
});

/** Chunk layers for a map of several chunks: arrays by "cx,cy". */
const chunked = (by: Record<string, ArrayLike<number>>) => ({ chunk: (cx: number, cy: number) => by[`${cx},${cy}`] }) as never;

/**
 * A map the shape of one world's curtain: its first column is negative (x0 = -70), 140 wide, and a window over it crosses a chunk column
 * (x = -64) and a chunk row (y = 64). Chunks (-2, 0), (-1, 0), (-2, 1), (-1, 1) hold what the tests put in them.
 */
function curtainish() {
  const chunks = ["-2,0", "-1,0", "-2,1", "-1,1"];
  const rock = Object.fromEntries(chunks.map((c) => [c, new Uint8Array(CHUNK * CHUNK)]));
  const food = Object.fromEntries(chunks.map((c) => [c, new Float32Array(CHUNK * CHUNK)]));
  const spoil = Object.fromEntries(chunks.map((c) => [c, new Uint16Array(CHUNK * CHUNK)]));
  // cell (x, y) is chunk (x >> 6, y >> 6) at index ((y & 63) << 6) | (x & 63)
  const at = (x: number, y: number) => ({ key: `${x >> 6},${y >> 6}`, i: ((y & 63) << 6) | (x & 63) });
  const put = <A extends Record<string, { [i: number]: number }>>(by: A, x: number, y: number, v: number) => {
    const { key, i } = at(x, y);
    by[key]![i] = v;
  };
  const m = {
    x0: -70,
    size: { w: 140, h: 100 },
    rock: chunked(rock),
    food: chunked(food),
    spoil: chunked(spoil),
  } as unknown as WorldMap;
  return { m, rock, food, spoil, put, ext: { x0: -70, w: 140, h: 100 } };
}

/** The hexagon's six vertices round cell (x, y) as drawHexes lays them, at this zoom, blend and camera. */
function hexagon(x: number, y: number, zoom: number, hexMix: number, c: { x: number; y: number }, v: { w: number; h: number }): string[] {
  const hx = zoom * 0.5 * (1 + 0.04 * hexMix);
  const shoulder = zoom * (R / 2 + (SIDE * 0.52 - R / 2) * hexMix);
  const tip = zoom * (R / 2 + (SIDE * 1.04 - R / 2) * hexMix);
  const sx = (x + 0.5 + 0.5 * (y & 1)) * zoom + (v.w / 2 - c.x * zoom);
  const sy = (y + 0.5) * R * zoom + (v.h / 2 - c.y * zoom);
  return [
    `moveTo(${r3(sx + hx)}, ${r3(sy + shoulder)})`,
    `lineTo(${r3(sx)}, ${r3(sy + tip)})`,
    `lineTo(${r3(sx - hx)}, ${r3(sy + shoulder)})`,
    `lineTo(${r3(sx - hx)}, ${r3(sy - shoulder)})`,
    `lineTo(${r3(sx)}, ${r3(sy - tip)})`,
    `lineTo(${r3(sx + hx)}, ${r3(sy - shoulder)})`,
    "closePath()",
  ];
}

test("draw, up close on a curtain-shaped map: across two chunk columns and two chunk rows, from a negative first column, each chunk is its own canvas and every cell lands where it should", () => {
  const w = curtainish();
  w.put(w.rock, -66, 62, ROCK); // chunk (-2, 0)
  w.put(w.rock, -63, 64, ROCK); // chunk (-1, 1)
  w.put(w.food, -64, 63, 1); // chunk (-1, 0): a wash, not opaque
  const c = { x: -64, y: 64, zoom: 20 };
  const f = field(null, { m: w.m, ext: w.ext as FieldCtx["ext"], c: c as FieldCtx["c"] });
  f.ground.draw(f.k, SHOW, { rx0: -66, rx1: -62, ry0: 62, ry1: 66 }, 1, false);
  assert.deepEqual(
    [...f.ground.chunks.keys()].sort(),
    ["-1,0", "-1,1", "-2,0", "-2,1"],
    "a canvas for each chunk in the window, by its own key",
  );
  assert.equal(f.canvases.length, 4);
  const cmds = f.paths.flatMap((p) => p.cmds);
  for (const [x, y] of [
    [-66, 62],
    [-63, 64],
    [-64, 63],
  ] as const)
    assert.ok(cmds.includes(hexagon(x, y, 20, 1, c, f.k.v)[0]!), `a hexagon at (${x}, ${y})`);
  assert.equal(f.paths.length, 2, "two colours: the rock's and the food wash's");
  // the paper covers the map from its own first column
  const [ax, ay] = toScreen(c, f.k.v, -70, 0);
  const [bx, by] = toScreen(c, f.k.v, -70 + 140, 100);
  assert.ok(f.log.includes(`fillRect(${r3(ax)}, ${r3(ay)}, ${r3(bx - ax)}, ${r3(by - ay)})`), "the paper from x0 to x0 + width");
  // isBare: the chunk's canvas by (cx, cy), the pixel's alpha
  assert.equal(f.ground.isBare(-66, 62), false, "rock (opaque)");
  assert.equal(f.ground.isBare(-63, 64), false, "rock in chunk (-1, 1)");
  assert.equal(f.ground.isBare(-64, 63), false, "a wash (translucent) is not bare");
  assert.equal(f.ground.isBare(-65, 63), true, "nothing on it");
  assert.equal(f.ground.isBare(-62, 65), true, "nothing on it, in chunk (-1, 1)");
  // a window that starts in chunk column -1 (the first a curtain has to the left of 0) and in chunk row 1 only
  const w2 = curtainish();
  w2.put(w2.rock, -60, 65, ROCK);
  const c2 = { x: -60, y: 65, zoom: 20 };
  const g = field(null, { m: w2.m, ext: w2.ext as FieldCtx["ext"], c: c2 as FieldCtx["c"] });
  g.ground.draw(g.k, SHOW, { rx0: -62, rx1: -58, ry0: 65, ry1: 66 }, 1, false);
  assert.ok(
    g.paths.flatMap((p) => p.cmds).includes(hexagon(-60, 65, 20, 1, c2, g.k.v)[0]!),
    "a hexagon in chunk column -1, which is not 'no chunk yet'",
  );
  assert.deepEqual([...g.ground.chunks.keys()], ["-1,1"], "only the chunk the window is in: not the rows above it");
});

test("draw, up close: the mound's pellets fade in over the first CSS pixels past a hexagon and not before, in the plane only and never in smell vision", () => {
  const heap = (zoom: number, over: Over = {}) => {
    const w = curtainish();
    w.put(w.spoil, -66, 62, 6);
    const c = { x: -64, y: 64, zoom };
    const f = field(null, { m: w.m, ext: w.ext as FieldCtx["ext"], c: c as FieldCtx["c"], ...over });
    f.ground.draw(f.k, SHOW, { rx0: -66, rx1: -62, ry0: 62, ry1: 66 }, 0.5, false);
    return f;
  };
  const alphaOfPellets = (f: ReturnType<typeof heap>) => {
    const save = f.log.indexOf("save()");
    return save < 0 ? null : f.log[save + 1];
  };
  assert.equal(alphaOfPellets(heap(10)), null, "under 12 px no pellet is drawn at all (not drawn at a negative alpha)");
  assert.equal(alphaOfPellets(heap(12)), null, "nor at exactly 12");
  assert.equal(alphaOfPellets(heap(16)), "globalAlpha = 0.5");
  assert.equal(alphaOfPellets(heap(24)), "globalAlpha = 1", "from 20 px, fully");
  assert.equal(alphaOfPellets(heap(40)), "globalAlpha = 1", "and no more than fully");
  // the tint fades out as they fade in: gone altogether once they are full
  const tinted = (f: ReturnType<typeof heap>) => f.paths.length;
  assert.equal(tinted(heap(10)), 1, "the heap's tint, at full strength while no pellets show");
  assert.equal(tinted(heap(24)), 0, "no tint left once the pellets are full: the wash fades to nothing, and nothing is filled");
  assert.equal(tinted(heap(40)), 0);
  // never in smell vision, never on the curtain
  assert.equal(alphaOfPellets(heap(24, { smellAll: true })), null, "smell vision: the washes only");
  assert.equal(alphaOfPellets(heap(24, { lv: CURTAIN })), null, "the curtain has no pellets");
});

test("draw, between bricks and hexagons: the hexagon's height scales with the blend as its width does", () => {
  const w = curtainish();
  w.put(w.rock, -66, 62, ROCK);
  const c = { x: -64, y: 64, zoom: 12 };
  for (const mix of [0.25, 0.5, 1]) {
    const f = field(null, { m: w.m, ext: w.ext as FieldCtx["ext"], c: c as FieldCtx["c"] });
    f.ground.draw(f.k, SHOW, { rx0: -66, rx1: -62, ry0: 62, ry1: 66 }, mix, false);
    assert.deepEqual(f.paths[0]!.cmds, hexagon(-66, 62, 12, mix, c, f.k.v), `at a blend of ${mix}`);
  }
});

test("draw hands what it is given on to paintChunk: the settings and whether sprites show the food reach the buffer", () => {
  const food = new Float32Array(CHUNK * CHUNK);
  const home = new Float32Array(CHUNK * CHUNK);
  const sensed = new Float32Array(CHUNK * CHUNK).fill(-Infinity);
  food[cell(1, 1)] = 1; // a food wash (or a sprite)
  home[cell(2, 1)] = HOME_FULL; // a home trail, sensed now
  sensed[cell(2, 1)] = FRESH;
  const win = { rx0: 0, rx1: 10, ry0: 0, ry1: 3 };
  const run = (show: GroundShow, sprites: boolean) => {
    const f = field(null, { cells: { food }, sensed, home });
    f.ground.draw(f.k, show, win, 0, sprites);
    return f.ground.chunkCanvas(0, 0).img;
  };
  const both = run(SHOW, false);
  assert.deepEqual(px(both, 1, 1), [...THEME.accentRgb, 132]);
  assert.deepEqual(px(both, 2, 1), [...HOME_RGB, 90]);
  assert.equal(px(run(SHOW, true), 1, 1)[3], 0, "sprites show the food: no wash");
  assert.equal(px(run({ food: true, home: false }, false), 2, 1)[3], 0, "the home setting is off: no home trail");
});

test("draw, zoomed out across chunks: each chunk row's strips are clipped to the window and drawn from that chunk's own canvas", () => {
  const w = curtainish();
  w.put(w.rock, -66, 62, ROCK);
  w.put(w.rock, -63, 64, ROCK);
  const c = { x: -64, y: 64, zoom: 6 };
  const f = field(null, { m: w.m, ext: w.ext as FieldCtx["ext"], c: c as FieldCtx["c"] });
  const win = { rx0: -66, rx1: -62, ry0: 60, ry1: 70 };
  f.ground.draw(f.k, SHOW, win, 0, false);
  const draws = f.log.filter((l) => l.startsWith("drawImage("));
  assert.equal(draws.length, 2 * 11, "eleven rows in each of the two chunk columns");
  const expected: string[] = [];
  for (let cy = 0; cy <= 1; cy++)
    for (let cx = -2; cx <= -1; cx++) {
      const canvas = f.ground.chunks.get(`${cx},${cy}`)!.canvas;
      for (let ly = Math.max(0, 60 - cy * CHUNK); ly <= Math.min(CHUNK - 1, 70 - cy * CHUNK); ly++) {
        const y = cy * CHUNK + ly;
        const [ax, ay] = toScreen(c, f.k.v, cx * CHUNK + 0.5 * (y & 1), y * R);
        const [bx, by] = toScreen(c, f.k.v, (cx + 1) * CHUNK + 0.5 * (y & 1), (y + 1) * R);
        const dx = Math.round(ax);
        const dy = Math.round(ay);
        expected.push(`drawImage(${canvas}, 0, ${ly}, 64, 1, ${dx}, ${dy}, ${Math.round(bx) - dx}, ${Math.round(by) - dy})`);
      }
    }
  assert.deepEqual(draws, expected, "the rows of chunk row 0 (60 to 63), then of chunk row 1 (64 to 70), each chunk its own canvas");
});
