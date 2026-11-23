import assert from "node:assert/strict";
import { test } from "node:test";
import { CURTAIN, groundHeat, PLANE, R, sunDown, type WorldMap } from "../../colony/index.ts";
import { visible } from "../camera.ts";
import type { FieldCtx, FieldInputs, FieldTheme } from "../field/ctx.ts";
import { groundPaper } from "../field/ground.ts";
import {
  actorsStage,
  beginFrame,
  FieldRenderer,
  type FieldParts,
  type FrameRefs,
  type FrameState,
  foodStage,
  fungusStage,
  groundStage,
  heatStage,
  labelsStage,
  marksStage,
  minimapStage,
  paperStage,
  STAGES,
  type Stage,
  voxelStage,
} from "../field/renderer.ts";
import { BRICK_ZOOM, HEX_ZOOM } from "../field/zoom.ts";
import { foodDensity } from "../resourceSprites.ts";
import { RecordedPath, recordingContext } from "./recordingContext.ts";

// The renderer on a recording fake context (ja-fnd.6.3.8): what a frame derives once (beginFrame), the stage list and its early exit, and the stages the
// frame had inline (the paper, the ground, the food, the heat, the voxel pass, the labels, the minimap). The stages that other files hold (the nests,
// ants and marks) are tested in theirs; scripts/field-shots.mjs holds that the browser draws the same pixels.

const THEME = {
  paper: "#paper",
  ink: "#ink",
  warn: "#warn",
  paperRgb: [240, 240, 240],
} as unknown as FieldTheme;

/** A cell in view of the camera at (50, 40): the rows are 1/R of a world unit apart. */
const FOOD_CELL = `50,${Math.round(40 / R)}`;
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

interface Opts {
  zoom?: number;
  d?: number;
  lv?: number;
  paperRgb?: number[];
  food?: Record<string, number>;
  quality?: Record<string, number>;
  chambers?: unknown[];
  colony?: Record<string, unknown> | null;
  world?: null;
  x0?: number;
  at?: [number, number];
  labelsOn?: boolean;
  voxel?: { alpha: number; renderer: string; angled?: boolean };
  dev?: boolean;
  now?: number;
}

function setup(o: Opts = {}) {
  const rec = recordingContext();
  const calls: string[] = [];
  const table = (t: Record<string, number> | undefined, dflt: number) => ({ get: (x: number, y: number) => t?.[`${x},${y}`] ?? dflt });
  const m = {
    x0: o.x0 ?? 0,
    size: { w: 200, h: 100 },
    rock: { get: () => 0 },
    food: table(o.food, 0),
    quality: o.quality ? table(o.quality, 1) : undefined,
    chambers: o.chambers ? { list: o.chambers } : undefined,
  } as unknown as WorldMap;
  const leaves: unknown[] = [];
  const drawArgs: unknown[][] = [];
  const fc = {
    ctx: rec.ctx,
    theme: { ...THEME, paperRgb: o.paperRgb ?? THEME.paperRgb },
    d: o.d ?? 1,
    v: { w: 800, h: 600, dpr: o.d ?? 1 },
    c: { x: o.at?.[0] ?? 50, y: o.at?.[1] ?? 40, zoom: o.zoom ?? 20 },
    lv: o.lv ?? PLANE,
    m,
    ext: { x0: o.x0 ?? 0, w: 200, h: 100 },
    world: o.world === null ? null : {},
    colonies: o.colony === null ? [] : [{ params: { heatDay: 0 }, time: 0, ...(o.colony ?? {}) }],
    fungus: {},
    strip: false,
    smellAll: false,
    env: { now: () => o.now ?? 1000, reducedMotion: () => false },
    sprites: {
      resource: { get: (lod: string) => (calls.push(`resource.get ${lod}`), { toString: () => "resource" }) },
      nest: { get: (lod: string) => (calls.push(`nest.get ${lod}`), { toString: () => "nest" }) },
      worker: { ready: () => true },
      surfaceLeaves: { get: (x: number, y: number) => (leaves.push([x, y]), `tiles ${x},${y}`) },
      mapLeaves: { draw: (_c: unknown, tiles: string) => calls.push(`leaves ${tiles}`) },
    },
  } as unknown as FieldCtx;
  const inputs: FieldInputs = { hover: null, pen: null, penSeen: { current: null }, show: { food: true, home: false } };
  const dataset: Record<string, string | undefined> = {};
  const sink = {
    orbit: { current: { yaw: 1, tilt: -1 } },
    axes: { current: { hidden: false as boolean | string } },
    angled: { current: false },
  };
  const parts = {
    ground: {
      draw: (...a: unknown[]) => (calls.push(`ground.draw ${a.length}`), drawArgs.push(a)),
      isBare: () => false,
      paints: 3,
      hits: 5,
    },
    minimap: { draw: () => calls.push("minimap.draw") },
    voxelMap: { draw: () => o.voxel ?? { alpha: 0, renderer: "sprites" } },
    sinks: {
      dataset,
      orbit: sink.orbit,
      orbitAxes: sink.axes,
      angled: sink.angled,
      flatOrbit: () => ({ yaw: 0, tilt: 0 }),
      dev: o.dev ?? false,
    },
  } as unknown as FieldParts;
  const refs: FrameRefs = {
    orbit: { yaw: 0, tilt: 0 },
    labelsOn: o.labelsOn ?? false,
    aphids: [],
    traces: null,
    specimens: [],
    sensed: {} as never,
  };
  const fs = beginFrame(fc, inputs, parts, refs, { started: 400, f: null, fcol: null, fHere: false });
  return { fc, fs, rec, calls, dataset, sink, leaves, inputs, parts, drawArgs };
}

test("a frame derives the cells in view, whether the zoom is the hexagons', and how far the bricks have turned into them", () => {
  const s = setup({ zoom: 20 });
  const vis = visible(s.fc.c, s.fc.v);
  assert.deepEqual(s.fs.vis, vis);
  assert.deepEqual(s.fs.cellWindow, {
    rx0: Math.max(0, Math.floor(vis.x0) - 1),
    rx1: Math.min(199, Math.ceil(vis.x1) + 1),
    ry0: Math.max(0, Math.floor(vis.y0 / R) - 1),
    ry1: Math.min(99, Math.ceil(vis.y1 / R) + 1),
  });
  assert.equal(setup({ zoom: HEX_ZOOM * 2, d: 2 }).fs.hexes, true, "at the hexagon zoom exactly, in CSS pixels");
  assert.equal(setup({ zoom: HEX_ZOOM * 2 - 0.1, d: 2 }).fs.hexes, false);
  assert.equal(setup({ zoom: BRICK_ZOOM }).fs.hexMix, 0, "bricks");
  assert.equal(setup({ zoom: 16 }).fs.hexMix, 1, "hexagons");
  const mid = (BRICK_ZOOM + 16) / 2;
  assert.equal(fmt(setup({ zoom: mid }).fs.hexMix), fmt(0.5), "halfway: the smoothstep's middle");
  const quarter = BRICK_ZOOM + (16 - BRICK_ZOOM) / 4;
  assert.equal(fmt(setup({ zoom: quarter }).fs.hexMix), fmt(0.25 * 0.25 * (3 - 2 * 0.25)));
});

test("the cells in view are clipped to the map: at its first and last columns and rows the window ends there", () => {
  const top = setup({ zoom: 20, at: [0, 0] });
  assert.equal(top.fs.cellWindow.rx0, 0, "not before the first column");
  assert.equal(top.fs.cellWindow.ry0, 0, "not before the first row");
  const bottom = setup({ zoom: 20, at: [199, 99] });
  assert.equal(bottom.fs.cellWindow.rx1, 199, "not past the last column");
  assert.equal(bottom.fs.cellWindow.ry1, 99, "not past the last row");
  const curtain = setup({ zoom: 20, x0: -30, at: [-30, 50] });
  assert.equal(curtain.fs.cellWindow.rx0, -30, "a map that starts left of zero starts there");
  const far = setup({ zoom: 20, x0: -30, at: [169, 50] });
  assert.equal(far.fs.cellWindow.rx1, 169, "and ends at its width from it");
});

test("a frame asks for the sprite sheets only at the hexagon zoom, and says what it drew with", () => {
  const near = setup({ zoom: 40 });
  assert.equal(near.fs.resourceImage !== null && near.fs.nestImage !== null, true);
  assert.deepEqual(near.calls, [`resource.get ${near.fs.resourceLod}`, `nest.get ${near.fs.resourceLod}`], "resource first, then nest");
  assert.equal(near.fs.nestStyle, "voxel");
  assert.equal(near.fs.workerStyle, "voxel");
  const far = setup({ zoom: 2 });
  assert.deepEqual(far.calls, []);
  assert.equal(far.fs.resourceImage, null);
  assert.equal(far.fs.nestImage, null);
  assert.equal(far.fs.nestStyle, "symbols");
  assert.equal(far.fs.workerStyle, "ink");
  assert.equal(near.fs.cssHex, "40.00");
  assert.equal(setup({ zoom: 40, d: 2 }).fs.cssHex, "20.00", "CSS pixels, not device ones");
  assert.equal(setup({ paperRgb: [10, 10, 10] }).fs.darkSprites, true, "a dark paper takes the dark-ground tints");
  assert.equal(setup({ paperRgb: [240, 240, 240] }).fs.darkSprites, false);
  assert.equal(setup({ paperRgb: [99, 99, 99] }).fs.darkSprites, true, "luminance under 100");
  assert.equal(setup({ paperRgb: [101, 101, 101] }).fs.darkSprites, false);
  // each channel weighs as luminance does: red and blue are dark, green is light, and exactly 100 is not under 100
  assert.equal(setup({ paperRgb: [255, 0, 0] }).fs.darkSprites, true, "red");
  assert.equal(setup({ paperRgb: [0, 255, 0] }).fs.darkSprites, false, "green");
  assert.equal(setup({ paperRgb: [0, 0, 255] }).fs.darkSprites, true, "blue");
  assert.equal(setup({ paperRgb: [0, 139.82102908277406, 0] }).fs.darkSprites, false, "a luminance of exactly 100");
});

test("an ant's length, half of it and a crumb follow the zoom, within bounds; a point is in view a little beyond the edge", () => {
  const sizes = (zoom: number) => {
    const { fs } = setup({ zoom });
    return [fs.len, fs.half, fs.crumb].map(fmt);
  };
  assert.deepEqual(sizes(2), ["3", "1.5", "1.5"], "no shorter than 3");
  assert.deepEqual(sizes(10), ["9", "4.5", "3.15"]);
  assert.deepEqual(sizes(40), ["22", "11", "7.7"], "no longer than 22");
  const { fs } = setup();
  const { vis } = fs;
  assert.equal(fs.inView(vis.x0 - 2, vis.y0 - 2), true);
  assert.equal(fs.inView(vis.x1 + 2, vis.y1 + 2), true);
  assert.equal(fs.inView(vis.x0 - 2.01, vis.y0), false);
  assert.equal(fs.inView(vis.x0, vis.y1 + 2.01), false);
});

test("the stage list is the frame's order, and a stage that returns false ends the frame there", () => {
  assert.deepEqual(STAGES, [
    paperStage,
    groundStage,
    foodStage,
    heatStage,
    fungusStage,
    actorsStage,
    voxelStage,
    labelsStage,
    marksStage,
    minimapStage,
  ]);
  const s = setup();
  const seen: string[] = [];
  const mk =
    (name: string, end = false): Stage =>
    (fs) => {
      assert.equal(fs, s.fs, "every stage gets the one frame");
      seen.push(name);
      return end ? false : undefined;
    };
  new FieldRenderer([mk("a"), mk("b"), mk("c")]).frame(s.fs);
  assert.deepEqual(seen, ["a", "b", "c"]);
  seen.length = 0;
  new FieldRenderer([mk("a"), mk("b", true), mk("c")]).frame(s.fs);
  assert.deepEqual(seen, ["a", "b"], "ended at b");
  assert.equal(new FieldRenderer().stages, STAGES, "the default list");
});

test("the paper fills the canvas, then the ground's own paper the map's rectangle, with smoothing off", () => {
  const s = setup({ zoom: 20 });
  paperStage(s.fs);
  const [w, h] = [800, 600];
  const left = (0 - 50) * 20 + w / 2;
  const top = (0 - 40) * 20 + h / 2;
  const right = (200 - 50) * 20 + w / 2;
  const bottom = (100 - 40) * 20 + h / 2;
  assert.deepEqual(s.rec.log, [
    "fillStyle = #paper",
    "fillRect(0, 0, 800, 600)",
    "imageSmoothingEnabled = false",
    `fillStyle = rgb(${groundPaper(s.fc).join(",")})`,
    `fillRect(${fmt(left)}, ${fmt(top)}, ${fmt(right - left)}, ${fmt(bottom - top)})`,
  ]);
});

test("the ground's paper starts at the map's first column, which is left of zero on a curtain", () => {
  const s = setup({ zoom: 20, x0: -30, at: [-30, 50] });
  paperStage(s.fs);
  const left = (-30 - -30) * 20 + 400;
  const right = (-30 + 200 - -30) * 20 + 400;
  const rect = s.rec.log.at(-1)!;
  assert.ok(rect.startsWith(`fillRect(${fmt(left)}, `), rect);
  assert.ok(rect.includes(`, ${fmt(right - left)}, `), rect);
});

test("the ground stage draws the chunks, and lays the terrain's grain over them only where hexagons show", () => {
  const withPath2D = <T>(f: () => T): T => {
    const had = (globalThis as { Path2D?: unknown }).Path2D;
    (globalThis as { Path2D?: unknown }).Path2D = RecordedPath;
    try {
      return f();
    } finally {
      (globalThis as { Path2D?: unknown }).Path2D = had;
    }
  };
  const bricks = setup({ zoom: BRICK_ZOOM });
  groundStage(bricks.fs);
  assert.deepEqual(
    bricks.calls.filter((c) => c.startsWith("ground.draw")),
    ["ground.draw 5"],
    "fc, the layers, the window, the mix, whether a sheet is ready",
  );
  assert.deepEqual(
    bricks.drawArgs[0]!.slice(1),
    [bricks.inputs.show, bricks.fs.cellWindow, bricks.fs.hexMix, false],
    "no sheet below the hexagon zoom",
  );
  assert.equal(bricks.rec.log.includes("save()"), false, "no grain over bricks");
  const sheet = setup({ zoom: 40 });
  withPath2D(() => groundStage(sheet.fs));
  assert.equal(sheet.drawArgs[0]![4], true, "a sheet at the hexagon zoom");
  const hexes = setup({ zoom: 14 });
  assert.ok(hexes.fs.hexMix > 0 && hexes.fs.hexMix < 1, "between bricks and hexagons");
  withPath2D(() => groundStage(hexes.fs));
  assert.ok(hexes.rec.log.includes("save()"));
  assert.equal(
    hexes.rec.log.filter((l) => l === "save()").length,
    hexes.rec.log.filter((l) => l === "restore()").length,
    "every save has its restore: the state is put back after the grain",
  );
  assert.ok(hexes.rec.log.includes(`globalAlpha = ${fmt(hexes.fs.hexMix)}`), "faded in with the hexagons");
});

test("surface food: nothing without the resource sheet; plain food on the plane joins into tissue, any other is marks, a cell with none or rock is left out", () => {
  const none = setup({ zoom: 2, food: { [FOOD_CELL]: 0.5 } });
  foodStage(none.fs);
  assert.deepEqual(none.rec.log, [], "no sheet below the hexagon zoom");
  const plane = setup({ zoom: 30, food: { [FOOD_CELL]: 0.5 }, lv: PLANE });
  foodStage(plane.fs);
  assert.deepEqual(
    plane.calls.filter((c) => c.startsWith("leaves")),
    [`leaves tiles ${FOOD_CELL}`],
    "plain food on the plane is tissue",
  );
  assert.equal(plane.rec.log.filter((l) => l.startsWith("drawImage(")).length, 0);
  const below = setup({ zoom: 30, food: { [FOOD_CELL]: 0.5 }, lv: CURTAIN });
  foodStage(below.fs);
  const d = foodDensity(0.5);
  assert.ok(d.alpha < 1, "a thin patch is faint");
  assert.equal(below.rec.log.filter((l) => l.startsWith("drawImage(resource")).length, d.marks, "a mark each");
  assert.ok(below.rec.log.includes(`globalAlpha = ${fmt(d.alpha)}`));
  assert.equal(below.rec.log.at(-1), "globalAlpha = 1");
  const sweet = setup({ zoom: 30, food: { [FOOD_CELL]: 0.5 }, quality: { [FOOD_CELL]: 2 }, lv: PLANE });
  foodStage(sweet.fs);
  assert.deepEqual(
    sweet.calls.filter((c) => c.startsWith("leaves")),
    [],
    "sweet food is marks, even on the plane",
  );
  assert.equal(sweet.rec.log.filter((l) => l.startsWith("drawImage(resource")).length, d.marks);
  const rock = setup({ zoom: 30, food: { [FOOD_CELL]: 0.5 } });
  (rock.fc.m as unknown as { rock: { get: () => number } }).rock = { get: () => 1 };
  foodStage(rock.fs);
  assert.deepEqual(rock.rec.log, ["globalAlpha = 1"], "under rock: nothing drawn, the alpha put back");
  assert.deepEqual(
    rock.calls.filter((c) => c.startsWith("leaves")),
    [],
  );
});

test("the heat wash warms the plane toward noon and darkens it when the sun is down, on the plane of a colony with a day only", () => {
  const params = { heatDay: 100, heatStart: 0, heatDawn: 20, heatNoon: 40, heatNight: 0.3 };
  const wash = (time: number, lv = PLANE) => {
    const s = setup({ colony: { params, time }, lv });
    heatStage(s.fs);
    return s;
  };
  const noon = wash(50);
  const k = Math.max(0, Math.min(1, (groundHeat(params as never, 50) - params.heatDawn) / (params.heatNoon - params.heatDawn)));
  assert.equal(sunDown(params as never, 50), false, "by day");
  assert.deepEqual(noon.rec.log, [`globalAlpha = ${fmt(0.28 * k)}`, "fillStyle = #warn", "fillRect(0, 0, 800, 600)", "globalAlpha = 1"]);
  const night = [...Array(100).keys()].find((t) => sunDown(params as never, t));
  assert.notEqual(night, undefined, "a time when the sun is down");
  const dark = wash(night!);
  assert.ok(dark.rec.log.includes("globalAlpha = 0.3") && dark.rec.log.includes("fillStyle = #000"), "and then the dark wash too");
  assert.deepEqual(wash(50, CURTAIN).rec.log, [], "not below ground");
  const flat = setup({ colony: { params: { heatDay: 0 }, time: 50 } });
  heatStage(flat.fs);
  assert.deepEqual(flat.rec.log, [], "a colony with no day");
  const empty = setup({ colony: null });
  heatStage(empty.fs);
  assert.deepEqual(empty.rec.log, [], "no colony");
});

test("the voxel stage reports what the frame found out, and a tilted map ends the frame after the minimap, with no draw time reported", () => {
  const flat = setup({ voxel: { alpha: 0, renderer: "sprites" }, dev: true });
  assert.equal(voxelStage(flat.fs), undefined);
  assert.equal(flat.dataset.mapRenderer, "sprites");
  assert.equal(flat.dataset.voxelAlpha, "0.000");
  assert.equal(flat.dataset.hexCssPx, "20.00");
  assert.equal(flat.dataset.chunkPaints, "3");
  assert.equal(flat.dataset.chunkCacheHits, "5");
  assert.equal(flat.sink.angled.current, false);
  assert.equal(flat.sink.axes.current.hidden, true, "too far out to tilt: the control is hidden");
  assert.deepEqual(flat.sink.orbit.current, { yaw: 0, tilt: 0 }, "and the tilt put back");
  const close = setup({ zoom: 130, voxel: { alpha: 0, renderer: "sprites" } });
  voxelStage(close.fs);
  assert.equal(close.sink.axes.current.hidden, false, "close enough to tilt: the control shows");
  assert.deepEqual(close.sink.orbit.current, { yaw: 1, tilt: -1 }, "and the tilt is kept");
  assert.equal(flat.fs.voxel?.renderer, "sprites", "left for the stages after it");
  assert.deepEqual(
    flat.calls.filter((c) => c === "minimap.draw"),
    [],
    "the minimap is a stage of its own",
  );
  const tilted = setup({ voxel: { alpha: 1, renderer: "voxel-webgl", angled: true }, dev: true });
  assert.equal(voxelStage(tilted.fs), false, "ends the frame");
  assert.equal(tilted.sink.angled.current, true);
  assert.equal(tilted.dataset.mapRenderer, "voxel-webgl", "the renderer the pass used");
  assert.equal(tilted.dataset.voxelAlpha, "1.000");
  assert.deepEqual(
    tilted.calls.filter((c) => c === "minimap.draw"),
    ["minimap.draw"],
    "after drawing the minimap itself",
  );
  assert.equal(tilted.dataset.fieldDrawMs, undefined, "no draw time for a frame cut short");
});

test("over a voxel mesh the alates draw again, and the heat over it is faded with it; under no mesh neither is", () => {
  const params = { heatDay: 100, heatStart: 0, heatDawn: 20, heatNoon: 40, heatNight: 0.3 };
  let drawn = 0;
  const run = (alpha: number) => {
    const s = setup({ voxel: { alpha, renderer: "voxel-webgl" }, colony: { params, time: 50 }, world: null });
    drawn = 0;
    s.fs.alateOverlays.push(() => drawn++);
    voxelStage(s.fs);
    return s;
  };
  const over = run(0.5);
  assert.equal(drawn, 1, "the alates again");
  const k = Math.max(0, Math.min(1, (groundHeat(params as never, 50) - params.heatDawn) / (params.heatNoon - params.heatDawn)));
  assert.ok(over.rec.log.includes(`globalAlpha = ${fmt(0.5 * 0.28 * k)}`), "the heat, faded with the mesh");
  assert.ok(over.rec.log.includes("fillStyle = #warn"));
  const night = [...Array(100).keys()].find((t) => sunDown(params as never, t))!;
  const dark = setup({ voxel: { alpha: 0.5, renderer: "voxel-webgl" }, colony: { params, time: night }, world: null });
  voxelStage(dark.fs);
  assert.ok(
    dark.rec.log.includes("globalAlpha = 0.15") && dark.rec.log.includes("fillStyle = #000"),
    "the night's wash, faded with the mesh",
  );
  const bare = run(0);
  assert.equal(drawn, 0, "no mesh, no second draw");
  assert.equal(bare.rec.log.filter((l) => l.startsWith("fillRect(")).length, 0);
});

test("chamber labels: a role at each chamber's centre in the paper's outline and the ink, where it is wide enough and in view; none when off", () => {
  const chamber = (o: Record<string, unknown> = {}) => ({ cells: 4, role: "royal", sumX: 4 * 50, sumY: 4 * 40, x0: 40, x1: 60, ...o });
  const run = (o: Opts) => {
    const s = setup({ labelsOn: true, chambers: [chamber()], zoom: 20, ...o });
    labelsStage(s.fs);
    return s.rec.log;
  };
  const log = run({});
  assert.ok(log.includes("textAlign = center") && log.includes("textBaseline = middle"));
  assert.ok(log.some((l) => l.startsWith("strokeText(royal,")) && log.some((l) => l.startsWith("fillText(royal,")));
  assert.equal(log.at(-1), "textBaseline = alphabetic");
  assert.ok(log.includes(`font = 600 ${Math.round(Math.max(10, Math.min(14, 20 * 0.9)))}px ui-sans-serif, system-ui, sans-serif`));
  assert.ok(log.includes("strokeStyle = #paper") && log.includes("fillStyle = #ink"));
  assert.ok(log.includes("globalAlpha = 0.85"), "a faint outline");
  assert.ok(
    run({ d: 2 }).includes(`font = 600 ${Math.round(Math.max(10, Math.min(14, 20 * 0.9)) * 2)}px ui-sans-serif, system-ui, sans-serif`),
    "scaled by the device ratio",
  );
  assert.deepEqual(run({ labelsOn: false }), [], "off");
  assert.deepEqual(run({ chambers: undefined }), [], "no chambers");
  assert.equal(run({ chambers: [chamber({ cells: 0 })] }).filter((l) => l.startsWith("fillText(")).length, 0, "no cells");
  assert.equal(run({ chambers: [chamber({ role: "none" })] }).filter((l) => l.startsWith("fillText(")).length, 0, "no role");
  assert.equal(run({ chambers: [chamber({ sumX: 4 * 5000 })] }).filter((l) => l.startsWith("fillText(")).length, 0, "out of view");
  assert.equal(
    run({ chambers: [chamber({ x0: 50, x1: 50 })] }).filter((l) => l.startsWith("fillText(")).length,
    0,
    "too narrow for its name",
  );
});

test("the minimap stage draws the minimap, then reports how long the frame took (dev builds)", () => {
  const dev = setup({ dev: true, now: 1250 });
  Object.defineProperty(dev.dataset, "fieldDrawMs", {
    set: (v: string) => {
      dev.calls.push(`ms ${v}`);
    },
    get: () => undefined,
  });
  minimapStage(dev.fs);
  assert.deepEqual(
    dev.calls.filter((c) => c === "minimap.draw" || c.startsWith("ms ")),
    ["minimap.draw", "ms 850.00"],
    "the minimap first, then the time: now less the start of the frame",
  );
  const prod = setup({ dev: false, now: 1250 });
  minimapStage(prod.fs);
  assert.equal(prod.dataset.fieldDrawMs, undefined);
});

void ({} as FrameState);
