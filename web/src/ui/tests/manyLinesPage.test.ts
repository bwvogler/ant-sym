import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CELL,
  CHUNK,
  OPEN,
  PLANE,
  ROCK,
  SIDE,
  STRIP,
  cellAt,
  centreX,
  centreY,
  columnsOver,
  Game,
  generateWorld,
  mulberry32,
  oneWorldOnLines,
  type OneWorld,
} from "../../colony/index.ts";
import type { Camera, Viewport } from "../camera.ts";
import { toScreen } from "../camera.ts";
import { INFECTED } from "../../colony/index.ts";
import { cues } from "../codex.ts";
import type { FieldCtx, FieldInputs, FieldPen, FieldTheme } from "../field/ctx.ts";
import type { FieldEnv } from "../field/env.ts";
import { Ground, stripAt, type GroundShow } from "../field/ground.ts";
import { drawBends, drawHoleNames, drawLine, drawPen, drawStripAnts } from "../field/overlays.ts";
import { hasChamberLabels } from "../fieldGoTo.ts";
import { canTiltMap } from "../mapVoxel.ts";
import { specimenRow } from "../specimens.ts";
import { clampLine, DEFAULT_COLONY_CONTROLS, freshGame } from "../useColony.ts";
import { rigHost, type RigRefs } from "../useCameraRig.ts";
import { RecordedCanvas, RecordedPath, callsOf, recordingContext } from "./recordingContext.ts";

// The canvas and page paths of E5.1 (PRD §66, ja-qpv.4.1) on a game of two lines, layers [plane, curtain 1, curtain 2]: each test fails when the
// site it names reads line 0 (or `=== CURTAIN`) again. On one line the two forms are the same, which is why manyLines.test.ts could not hold them.

const SEED = 3;
const two = (): Game =>
  new Game(oneWorldOnLines(SEED, generateWorld(SEED), [[0], [1]]), {}, mulberry32(5), [
    { antCount: 20, line: 0 },
    { antCount: 20, line: 1 },
  ]);

/**
 * A game of two lines whose curtain 2 line has a bend and curtain 1's has none: line 0 is grown to three holes, then the lines are listed with the bent one second in a copy of the
 * world (`line` and `curtain` follow, as the world's getters do).
 */
function bent(): { g: Game; world: OneWorld } {
  const g = two();
  g.foundBeyond("end");
  g.foundBeyond("end");
  const lines = [...g.world.lines].sort((a, b) => a.line.holes.length - b.line.holes.length);
  assert.deepEqual(
    lines.map((l) => l.line.holes.length),
    [1, 3],
  );
  return { g, world: { ...g.world, lines, line: lines[0]!.line, curtain: lines[0]!.curtain } };
}

const THEME = {
  paper: "#paper",
  ink: "#ink",
  accent: "#accent",
  warn: "#warn",
  line: "#line",
  fg3: "#fg3",
  rock: [1, 1, 1],
  soil: [2, 2, 2],
  sky: [3, 3, 3],
  spoil: [4, 4, 4],
  mound: "#mound",
  trail: [5, 5, 5],
  alarm: [6, 6, 6],
  accentRgb: [7, 7, 7],
  paperRgb: [250, 250, 250],
  inkRgb: [10, 20, 30],
  warnRgb: [200, 100, 50],
  spore: "#spore",
  aphid: "#aphid",
  sporeRgb: [8, 8, 8],
  chamber: [9, 9, 9],
} as unknown as FieldTheme;
const V: Viewport = { w: 800, h: 600, dpr: 1 };
const SHOW = { food: true, home: true };

/** A field context on layer `lv` of `world` (the game's own, or a copy of it), with a recording canvas. */
function field(g: Game, lv: number, c: Camera, o: { world?: OneWorld; over?: Partial<FieldCtx> } = {}) {
  const rec = recordingContext();
  const world = o.world ?? g.world;
  const m = lv === PLANE ? world.plane : world.lines[lv - 1]!.curtain;
  const k = {
    ctx: rec.ctx,
    theme: THEME,
    d: 1,
    v: V,
    c,
    lv,
    m,
    ext: { x0: m.x0, w: m.size.w, h: m.size.h },
    world,
    colonies: g.colonies,
    fungus: g.fungus,
    env: {},
    sprites: {},
    smellAll: false,
    strip: false,
    trails: [],
    alarms: [],
    spores: { chunk: () => undefined },
    sensedLayer: null,
    sensedNow: 0,
    ...o.over,
  } as unknown as FieldCtx;
  return { k, ...rec };
}

const at = (x: number, y: number, zoom = 12): Camera => ({ x, y, zoom });

test("drawLine draws every line of the top view: a dashed run and a dot for each, not line 0's alone", () => {
  const g = two();
  const holes = g.world.lines.flatMap((l) => l.line.holes);
  assert.equal(holes.length, 2);
  const h = holes[0]!;
  const { k, log } = field(g, PLANE, at(centreX(h.x, h.y), centreY(h.y), 1));
  drawLine(k);
  assert.equal(callsOf(log, "arc").length, 2, "a dot on each line's hole");
  assert.equal(log.filter((l) => l === "stroke()").length, 4, "two strokes (margins, then the line through the holes) for each line");
  assert.equal(callsOf(log, "moveTo").length, 6, "three runs for each line");
});

test("drawHoleNames names the holes of every line", () => {
  const g = two();
  const h = g.world.lines[0]!.line.holes[0]!;
  const { k, log } = field(g, PLANE, at(centreX(h.x, h.y), centreY(h.y), 1));
  drawHoleNames(k, () => true);
  assert.equal(callsOf(log, "roundRect").length, 2, "a pill for each line's hole, each named by its own colony");
});

test("drawBends reads the bends of the line under the layer shown: curtain 2's, and none on curtain 1", () => {
  const { g, world } = bent();
  const line = world.lines[1]!.line;
  const s = line.sHole[1]!;
  const cam = at(centreX(s, STRIP), 20, 4);
  const below2 = field(g, 2, cam, { world });
  drawBends(below2.k);
  assert.equal(callsOf(below2.log, "lineTo").length, 1, "one rule, at curtain 2's interior hole");
  assert.ok(callsOf(below2.log, "fillText")[0]!.includes("°"), "labelled with its turn");
  const below1 = field(g, 1, cam, { world });
  drawBends(below1.k);
  assert.deepEqual(below1.log, [], "curtain 1's line has two holes at most: no bend");
});

test("drawStripAnts draws the plane ants over the line under the layer shown", () => {
  const g = two();
  const [l0, l1] = g.world.lines.map((l) => l.line) as [OneWorld["lines"][0]["line"], OneWorld["lines"][0]["line"]];
  // A column of line 2 whose plane cell line 1 does not lie over
  let s = NaN;
  for (let col = l1.sHole[0]! + 2; col < l1.sMax; col++) {
    if (!cellAt(l1, col)) continue;
    if (columnsOver(l0, CELL[0]!, CELL[1]!).length === 0) {
      s = col;
      break;
    }
  }
  assert.ok(Number.isFinite(s), "line 2 lies over a cell line 1 does not");
  cellAt(l1, s);
  for (const col of g.colonies) col.alive.fill(0);
  const ant = g.colonies[1]!;
  ant.alive[0] = 1;
  ant.layer[0] = PLANE;
  ant.x[0] = centreX(CELL[0]!, CELL[1]!);
  ant.y[0] = centreY(CELL[1]!);
  const cam = at(centreX(s, STRIP), centreY(STRIP), 20);
  const on2 = field(g, 2, cam);
  drawStripAnts(on2.k, 8, 3, () => true);
  assert.equal(callsOf(on2.log, "moveTo").length, 1, "the ant is drawn on curtain 2's strip, over line 2's column");
  const on1 = field(g, 1, cam);
  drawStripAnts(on1.k, 8, 3, () => true);
  assert.equal(callsOf(on1.log, "moveTo").length, 0, "and not on curtain 1's, whose line is not over its cell");
});

/** A pen whose preview answers `settle`. */
function penOf(
  g: Game,
  settle: ReturnType<FieldPen["preview"]>,
): { pen: FieldPen; inp: FieldInputs; h: { x: number; y: number }; cam: Camera } {
  const h = g.world.lines[1]!.line.holes[0]!;
  const pen: FieldPen = { x: centreX(h.x, h.y), y: centreY(h.y), r: 5, preview: () => settle, onPick: () => {} };
  const inp: FieldInputs = { hover: [420, 310], pen, penSeen: { current: null }, show: SHOW };
  return { pen, inp, h, cam: at(pen.x, pen.y) };
}

test("drawPen grows the line the flight settles on: the segment starts at that line's end hole", () => {
  const g = two();
  const h1 = g.world.lines[1]!.line.holes[0]!;
  const { inp, cam } = penOf(g, { ok: true, cell: { x: h1.x + 3, y: h1.y }, end: "end", line: 1 });
  const { k, log } = field(g, PLANE, cam);
  drawPen(k, inp);
  const [ex, ey] = toScreen(cam, V, centreX(h1.x, h1.y), centreY(h1.y));
  const first = callsOf(log, "moveTo")[0]!.split(", ").map(Number);
  assert.ok(Math.abs(first[0]! - ex) < 1e-3 && Math.abs(first[1]! - ey) < 1e-3, "from line 2's hole, not line 1's");
});

test("drawPen on a settle that begins a new line draws no segment (that line does not exist yet), only the ring and her hole", () => {
  const g = two();
  const h = g.world.lines[1]!.line.holes[0]!;
  const next = g.world.lines.length;
  const { inp, cam } = penOf(g, { ok: true, cell: { x: h.x + 3, y: h.y }, end: "end", line: next, newLine: { heading: 0 } });
  assert.equal(g.world.lines[next], undefined, "the settle's line is the world's next");
  const { k, log } = field(g, PLANE, cam);
  drawPen(k, inp);
  assert.ok(!callsOf(log, "setLineDash").includes("[6, 5]"), "no dashed segment");
  assert.equal(callsOf(log, "moveTo").length, 1, "only the line from the pointer to where she settles");
  assert.equal(callsOf(log, "arc").length, 3, "the circle, the ring and the dot");
  assert.ok(callsOf(log, "fillText").some((a) => a.startsWith("her hole, ")));
});

/** The plane's Ground on a recording canvas. */
function groundEnv(): FieldEnv {
  return {
    now: () => 0,
    dpr: () => 1,
    dev: false,
    reducedMotion: () => false,
    newPath: () => new RecordedPath() as unknown as Path2D,
    newCanvas: (w, h) => new RecordedCanvas(w, h) as unknown as HTMLCanvasElement,
    sprites: () => {
      throw new Error("the ground uses no sprite");
    },
  } as FieldEnv;
}

/** A column of line 2 over a plane cell that line 1 does not lie over (or lies over elsewhere): its two cells, and the column. */
function column(g: Game): { s: number; a: [number, number]; b: [number, number] } {
  const [l0, l1] = g.world.lines.map((l) => l.line) as [OneWorld["lines"][0]["line"], OneWorld["lines"][0]["line"]];
  for (let s = l1.sMin; s <= l1.sMax; s++) {
    if (!cellAt(l1, s)) continue;
    const b: [number, number] = [CELL[0]!, CELL[1]!];
    if (!cellAt(l0, s)) continue;
    const a: [number, number] = [CELL[0]!, CELL[1]!];
    if (a[0] !== b[0] || a[1] !== b[1]) return { s, a, b };
  }
  throw new Error("no column");
}

test("the ground strip and stripAt read the plane under the line of the layer shown", () => {
  const g = two();
  const { s, a, b } = column(g);
  const { plane, lines } = g.world;
  plane.rock.set(a[0], a[1], OPEN); // under line 1: open
  plane.food.set(a[0], a[1], 0);
  plane.rock.set(b[0], b[1], ROCK); // under line 2: rock
  const curtain = lines[1]!.curtain;
  const below = (lv: number): FieldCtx => field(g, lv, at(centreX(s, STRIP), 20), { over: { strip: true } }).k;
  assert.deepEqual(stripAt(below(2), s, STRIP), THEME.rock, "layer 2 shows the plane under line 2");
  assert.deepEqual(stripAt(below(1), s, STRIP), THEME.paperRgb, "layer 1 the plane under line 1");
  // the chunk's buffer, painted
  const ground = new Ground(groundEnv());
  const cx = s >> 6;
  const cc = ground.chunkCanvas(cx, 0);
  ground.paintChunk(below(2), SHOW as GroundShow, cx, 0, cc, curtain.rock.chunk(cx, 0) ?? new Uint8Array(CHUNK * CHUNK), false);
  const lx = s - cx * CHUNK;
  const pixel = [...cc.img.data.slice((STRIP * CHUNK + lx) * 4, (STRIP * CHUNK + lx) * 4 + 4)];
  assert.deepEqual(pixel, [...(THEME.rock as unknown as number[]), 255], "curtain 2's strip is the rock under its line");
});

test("canTiltMap: any curtain layer's strip stays flat, the plane's never does", () => {
  const near: Camera = { x: 0, y: centreY(STRIP), zoom: 200 };
  const deep: Camera = { x: 0, y: centreY(STRIP) + SIDE + 100, zoom: 200 };
  for (const layer of [1, 2]) {
    assert.equal(canTiltMap(layer, true, near, V, 1, true), false, `layer ${layer}, strip in view`);
    assert.equal(canTiltMap(layer, true, deep, V, 1, true), true, `layer ${layer}, below the strip`);
  }
  assert.equal(canTiltMap(PLANE, true, near, V, 1, true), true);
});

test("the Go to menu offers chamber labels by the map of the layer shown", () => {
  const g = two();
  const w = g.world;
  assert.ok(w.lines[0]!.curtain.chambers && w.lines[1]!.curtain.chambers);
  (w.lines[1]!.curtain as { chambers?: unknown }).chambers = undefined;
  assert.equal(hasChamberLabels(w, 1), true);
  assert.equal(hasChamberLabels(w, 2), false, "curtain 2 has none, whatever curtain 1 has");
  assert.equal(hasChamberLabels(w, PLANE), !!w.plane.chambers);
});

test("the camera rig's host reads each layer's own map", () => {
  const w = two().world;
  const refs = {
    shown: { current: 2 },
    worldRef: { current: w },
    canvasRef: { current: null },
    follow: { current: null },
    followCb: { current: () => {} },
    sensed: { current: { knowledge: null } },
  } as unknown as RigRefs;
  const host = rigHost(refs);
  assert.equal(host.view(), 2);
  assert.equal(host.map(PLANE), w.plane);
  assert.equal(host.map(1), w.lines[0]!.curtain);
  assert.equal(host.map(2), w.lines[1]!.curtain);
});

test("the codex and the specimen row place an ant on curtain 2 below ground", () => {
  const g = two();
  const c = g.colonies[1]!;
  const i = c.alive.indexOf(1);
  assert.equal(c.layer[i], 2, "colony 1 starts on its own line's curtain");
  c.load[i] = INFECTED;
  const seen = cues(g.colonies, { deaths: 0, unityGap: 1, mutations: 0 });
  assert.ok(seen.has("hostBelow") && !seen.has("hostOut"));
  assert.equal(specimenRow(g.colonies, { k: 1, i, gen: c.gen[i]!, no: 1 })!.below, true);
});

test("a new game begins on line 0 (Restart, New world, Start and a load), and the page clamps what it reads", () => {
  const ended = { ...DEFAULT_COLONY_CONTROLS, line: 3 };
  assert.equal(freshGame(ended).line, 0);
  assert.deepEqual({ ...freshGame(ended), line: 3 }, ended, "and changes nothing else");
  assert.deepEqual([clampLine(3, 2), clampLine(1, 2), clampLine(0, 1), clampLine(-1, 2), clampLine(5, 0)], [1, 1, 0, 0, 0]);
  // The four hooks' callbacks go through freshGame (React is not run here: the hook source is what holds that)
  const src = readFileSync(new URL("../useColony.ts", import.meta.url), "utf8");
  for (const name of ["loadSave", "start", "restart", "newWorld"]) {
    const from = src.indexOf(`const ${name} = useCallback(`);
    assert.ok(from >= 0, name);
    const body = src.slice(from, src.indexOf("useCallback(", from + 30) > 0 ? src.indexOf("useCallback(", from + 30) : undefined);
    assert.ok(/freshGame/.test(body), `${name} starts the new game on line 0`);
  }
});
