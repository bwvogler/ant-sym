import assert from "node:assert/strict";
import { test } from "node:test";
import { type AphidClump, aphidCount, centreX, centreY, type Colony, CURTAIN, PLANE } from "../../colony/index.ts";
import { toScreen } from "../camera.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import { drawAphids, drawFollowed, drawInspection, drawSpecimens, drawTraces, type MarkFrame } from "../field/marks.ts";
import { setMapInspection } from "../mapInspection.ts";
import { APHID_SPOTS, aphidDensity } from "../resourceSprites.ts";
import { specimenLabel } from "../specimens.ts";
import { type AntTraces, traceAlpha } from "../trace.ts";
import { recordingContext } from "./recordingContext.ts";

// The marks stage on a recording fake context (ja-fnd.6.3.16): the aphid clumps, a moved ant's trace, the specimens' rings, the followed ant's ring
// and the inspection overlay, from hand-built clumps, traces and colonies, so each expectation is the arithmetic of the screen point and the
// callee's own maths (aphidDensity, traceAlpha), never the stage's. scripts/field-shots.mjs (the aphid, specimen, trace and builder scenes)
// holds that the browser draws the same pixels.

const THEME = { ink: "#ink", accent: "#accent", aphid: "#aphid", paper: "#paper", line: "#line" } as unknown as FieldTheme;
const V = { w: 800, h: 600, dpr: 1 };
const CAM = { x: 50, y: 40, zoom: 20 };
const screen = (wx: number, wy: number, zoom = CAM.zoom) => toScreen({ ...CAM, zoom }, V, wx, wy);
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

interface Opts {
  lv?: number;
  d?: number;
  zoom?: number;
  now?: number;
  reduced?: boolean;
  colonies?: unknown[];
}

function setup(o: Opts = {}) {
  const rec = recordingContext();
  const fc = {
    ctx: rec.ctx,
    theme: THEME,
    d: o.d ?? 1,
    v: V,
    c: { ...CAM, zoom: o.zoom ?? CAM.zoom },
    lv: o.lv ?? PLANE,
    colonies: o.colonies ?? [],
    env: { now: () => o.now ?? 1000, reducedMotion: () => !!o.reduced },
  } as unknown as FieldCtx;
  return { fc, rec };
}

const frame = (o: Partial<MarkFrame> = {}): MarkFrame => ({
  inView: () => true,
  resourceImage: null,
  resourceLod: "tiny",
  ...o,
});

const clump = (cells: number[], start: number, eaten = 0): AphidClump =>
  ({ layer: PLANE, cells, start, eaten, age: 0, owed: 0 }) as AphidClump;

test("an aphid clump is dots in the aphid green on the plane, a few to a cell by its density and as faint as it is thin, at least a pixel and a tenth of a unit", () => {
  const cl = clump([10, 10, 11, 10], 8);
  const s = setup({ zoom: 20 });
  drawAphids(s.fc, frame(), [cl], 0);
  const n = aphidCount(cl);
  const density = aphidDensity(n, 2);
  const r = Math.max(1.2, 0.13 * 20);
  const want: string[] = ["fillStyle = #aphid", `globalAlpha = ${fmt(density.alpha)}`];
  for (let k = 0; k < 4; k += 2)
    for (let j = 0; j < density.marks; j++) {
      const [ox, oy] = APHID_SPOTS[j]!;
      const [x, y] = screen(centreX(cl.cells[k]!, cl.cells[k + 1]!) + ox, centreY(cl.cells[k + 1]!) + oy);
      want.push("beginPath()", `arc(${fmt(x)}, ${fmt(y)}, ${fmt(r)}, 0, 6.283)`, "fill()");
    }
  want.push("globalAlpha = 1");
  assert.deepEqual(s.rec.log, want);
  const small = setup({ zoom: 2, d: 2 });
  drawAphids(small.fc, frame(), [cl], 0);
  assert.ok(
    small.rec.log.some((l) => l.endsWith(`, ${fmt(Math.max(2.4, 0.26))}, 0, 6.283)`)),
    "a pixel's worth first, at two device pixels",
  );
});

test("aphids are not drawn on the curtain, under the voxel pass's full cover, for a clump that is gone, or out of view; none draws nothing", () => {
  const cl = clump([10, 10], 8);
  const on = (o: Opts, f: MarkFrame, clumps: AphidClump[], voxel: number) => {
    const s = setup(o);
    drawAphids(s.fc, f, clumps, voxel);
    return s.rec.log.filter((l) => l.startsWith("arc(")).length;
  };
  assert.ok(on({}, frame(), [cl], 0) > 0);
  assert.ok(on({}, frame(), [cl], 0.99) > 0, "just under full cover");
  assert.equal(on({}, frame(), [cl], 1), 0, "under the voxel pass's full cover");
  assert.equal(on({ lv: CURTAIN }, frame(), [cl], 0), 0, "the curtain");
  assert.equal(on({}, frame(), [], 0), 0, "no clump");
  assert.equal(on({}, frame(), [clump([10, 10], 8, 100)], 0), 0, "eaten away");
  assert.equal(on({}, frame(), [clump([], 8)], 0), 0, "no cells");
  assert.equal(on({}, frame({ inView: () => false }), [cl], 0), 0, "out of view");
});

test("with the resource sheet ready a clump's marks are its sprites, one a mark, not dots", () => {
  const cl = clump([10, 10], 8);
  const s = setup();
  drawAphids(s.fc, frame({ resourceImage: { toString: () => "resource" } as unknown as HTMLImageElement }), [cl], 0);
  const density = aphidDensity(aphidCount(cl), 1);
  assert.equal(s.rec.log.filter((l) => l.startsWith("drawImage(resource")).length, density.marks);
  assert.equal(s.rec.log.filter((l) => l.startsWith("arc(")).length, 0);
});

type T = { xs: number[]; ys: number[]; search: number[]; end: string | null; done: number | null };
const fakeTraces = (traces: T[]) => {
  const updates: number[] = [];
  return { traces, update: (now: number) => updates.push(now), updates } as unknown as AntTraces & { updates: number[] };
};

test("a moved ant's trace is its way in solid and its search loops dotted, a ring where it was set down, a dot where it went home, faded by its age", () => {
  const t: T = { xs: [50, 51, 52, 53], ys: [40, 40, 41, 42], search: [0, 0, 1, 1], end: "home", done: null };
  const tr = fakeTraces([t]);
  const s = setup({ now: 5000 });
  drawTraces(s.fc, tr);
  assert.deepEqual(tr.updates, [5000], "advanced to now");
  const p = (k: number) => screen(t.xs[k]!, t.ys[k]!);
  const log = s.rec.log;
  assert.equal(log[0], "globalAlpha = 0.85");
  assert.ok(log.includes("strokeStyle = #accent") && log.includes("fillStyle = #accent"));
  assert.ok(log.includes(`lineWidth = ${fmt(Math.max(1.5, 0.25 * 20))}`));
  // the run: from point 0 through points 1 (solid), then 2 and 3 (dotted, a path of its own from point 1)
  const body = log.slice(log.indexOf("setLineDash([])"));
  assert.deepEqual(body.slice(0, 7), [
    "setLineDash([])",
    "beginPath()",
    `moveTo(${fmt(p(0)[0])}, ${fmt(p(0)[1])})`,
    `lineTo(${fmt(p(1)[0])}, ${fmt(p(1)[1])})`,
    "stroke()",
    "setLineDash([2, 4])",
    "beginPath()",
  ]);
  assert.ok(log.includes(`moveTo(${fmt(p(1)[0])}, ${fmt(p(1)[1])})`));
  assert.ok(log.includes(`lineTo(${fmt(p(3)[0])}, ${fmt(p(3)[1])})`));
  // the ring at the start, the dot at the end
  assert.ok(log.includes(`arc(${fmt(p(0)[0])}, ${fmt(p(0)[1])}, ${fmt(Math.max(5, 0.8 * 20))}, 0, 6.283)`), "the ring");
  assert.ok(log.includes(`arc(${fmt(p(3)[0])}, ${fmt(p(3)[1])}, ${fmt(Math.max(4, 0.6 * 20))}, 0, 6.283)`), "the dot");
  assert.equal(log.at(-1), "globalAlpha = 1");
  const lost = setup();
  drawTraces(lost.fc, fakeTraces([{ ...t, end: "lost" }]));
  assert.equal(lost.rec.log.filter((l) => l.startsWith("arc(")).length, 1, "no end dot unless it went home");
});

test("a trace fades with its age, is left out when it has faded or has no points, and is drawn on the plane only", () => {
  const done: T = { xs: [50, 51], ys: [40, 40], search: [0, 0], end: "home", done: 0 };
  const a = traceAlpha(done as never, 1000);
  assert.ok(a > 0 && a < 1);
  const s = setup({ now: 1000 });
  drawTraces(s.fc, fakeTraces([done]));
  assert.ok(s.rec.log.includes(`globalAlpha = ${fmt(0.85 * a)}`), "fainter with age");
  const gone = setup({ now: 1e9 });
  const tr = fakeTraces([done]);
  drawTraces(gone.fc, tr);
  assert.deepEqual(gone.rec.log, [], "faded away");
  assert.deepEqual(tr.updates, [1e9], "but still advanced");
  const empty = setup();
  drawTraces(empty.fc, fakeTraces([{ xs: [], ys: [], search: [], end: null, done: null }]));
  assert.deepEqual(empty.rec.log, []);
  const below = setup({ lv: CURTAIN });
  const tb = fakeTraces([{ xs: [50, 51], ys: [40, 40], search: [0, 0], end: null, done: null }]);
  drawTraces(below.fc, tb);
  assert.deepEqual(below.rec.log, [], "the curtain");
  assert.deepEqual(tb.updates, [1000], "advanced all the same");
  const none = setup();
  drawTraces(none.fc, null);
  assert.deepEqual(none.rec.log, []);
});

const colony = (ants: { x: number; y: number; layer?: number; gen?: number }[]) =>
  ({
    alive: ants.map(() => 1),
    gen: ants.map((a) => a.gen ?? 0),
    layer: ants.map((a) => a.layer ?? 0),
    x: ants.map((a) => a.x),
    y: ants.map((a) => a.y),
    mode: ants.map(() => 0),
  }) as unknown as Colony;

test("a specimen is a dashed ring round its ant and its label above, on the ant's layer; the followed one, one that is gone and one on the other layer are left out", () => {
  const col = colony([
    { x: 50, y: 40 },
    { x: 52, y: 40 },
    { x: 54, y: 40, layer: 1 },
    { x: 56, y: 40, gen: 1 },
  ]);
  const specimens = [
    { k: 0, i: 0, gen: 0, no: 1 },
    { k: 0, i: 1, gen: 0, no: 2 },
    { k: 0, i: 2, gen: 0, no: 3 },
    { k: 0, i: 3, gen: 0, no: 4 },
    { k: 5, i: 0, gen: 0, no: 5 },
  ];
  const s = setup({ colonies: [col] });
  drawSpecimens(s.fc, specimens, { k: 0, i: 1, gen: 0 });
  const [x, y] = screen(50, 40);
  const r = Math.max(7, 20 * 1.3);
  assert.deepEqual(s.rec.log.slice(0, 7), [
    "beginPath()",
    `arc(${fmt(x)}, ${fmt(y)}, ${fmt(r)}, 0, 6.283)`,
    "setLineDash([3, 3])",
    "strokeStyle = #ink",
    "lineWidth = 1.5",
    "stroke()",
    "setLineDash([])",
  ]);
  assert.equal(s.rec.log.filter((l) => l.startsWith("arc(")).length, 1, "only specimen 1: 2 is followed, 3 below, 4 gone, 5 in no colony");
  assert.ok(
    s.rec.log.some((l) => l.startsWith(`fillText(${specimenLabel(1)},`)),
    "its label",
  );
  const small = setup({ colonies: [col], zoom: 2, d: 2 });
  drawSpecimens(small.fc, [specimens[0]!], null);
  assert.ok(
    small.rec.log.includes(`arc(${fmt(screen(50, 40, 2)[0])}, ${fmt(screen(50, 40, 2)[1])}, 14, 0, 6.283)`),
    "a ring of at least 7 device pixels",
  );
  assert.ok(small.rec.log.includes("lineWidth = 3") && small.rec.log.includes("setLineDash([6, 6])"), "scaled by the device ratio");
});

test("the followed ant has a ring in the accent and its tag above it, while it is on this layer, and nothing otherwise", () => {
  const col = colony([{ x: 50, y: 40 }]);
  const f = { k: 0, i: 0, gen: 0 };
  const s = setup();
  drawFollowed(s.fc, f, col, true);
  const [x, y] = screen(50, 40);
  const r = Math.max(9, 20 * 1.6);
  assert.deepEqual(s.rec.log.slice(0, 5), [
    "beginPath()",
    `arc(${fmt(x)}, ${fmt(y)}, ${fmt(r)}, 0, 6.283)`,
    "strokeStyle = #accent",
    "lineWidth = 2",
    "stroke()",
  ]);
  assert.ok(
    s.rec.log.some((l) => l.startsWith("fillText(#0 ·")),
    "its tag",
  );
  for (const [ff, cc, here] of [
    [null, col, true],
    [f, null, true],
    [f, col, false],
  ] as const) {
    const n = setup();
    drawFollowed(n.fc, ff, cc, here);
    assert.deepEqual(n.rec.log, []);
  }
  const small = setup({ zoom: 2, d: 2 });
  drawFollowed(small.fc, f, col, true);
  assert.ok(small.rec.log.includes("lineWidth = 4"), "scaled by the device ratio");
  assert.ok(
    small.rec.log.includes(`arc(${fmt(screen(50, 40, 2)[0])}, ${fmt(screen(50, 40, 2)[1])}, 18, 0, 6.283)`),
    "at least 9 device pixels",
  );
});

test("the inspection overlay is drawn where the map was tapped, on its layer, bobbing with the clock unless motion is reduced", () => {
  setMapInspection({ lv: PLANE, x: 50, y: 40 });
  try {
    const a = setup({ now: 1000 });
    drawInspection(a.fc);
    assert.ok(a.rec.log.length > 0, "something is drawn");
    const b = setup({ now: 2000 });
    drawInspection(b.fc);
    assert.notDeepEqual(a.rec.log, b.rec.log, "it bobs with the clock");
    const r1 = setup({ now: 1000, reduced: true });
    const r2 = setup({ now: 2000, reduced: true });
    drawInspection(r1.fc);
    drawInspection(r2.fc);
    assert.deepEqual(r1.rec.log, r2.rec.log, "still with reduced motion");
    const other = setup({ lv: CURTAIN });
    drawInspection(other.fc);
    assert.deepEqual(other.rec.log, [], "not on the other layer");
  } finally {
    setMapInspection(null);
  }
  const none = setup();
  drawInspection(none.fc);
  assert.deepEqual(none.rec.log, [], "nothing tapped");
});
