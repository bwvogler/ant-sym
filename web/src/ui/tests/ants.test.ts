import assert from "node:assert/strict";
import { test } from "node:test";
import { INFECTED, type Colony } from "../../colony/index.ts";
import { decayStage } from "../cadaverVisual.ts";
import { toScreen } from "../camera.ts";
import { odourColour } from "../field/colour.ts";
import { type AntFrame, drawAnts } from "../field/ants.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import { BROOD_RGB } from "../palette.ts";
import { recordingContext } from "./recordingContext.ts";

// The ants stage on a recording fake context (ja-fnd.6.3.15): the strokes by odour band, the spore dots, what each ant carries, from hand-built
// colonies, so each expectation is the arithmetic of the screen point and the ant's own numbers, never the stage's. scripts/field-shots.mjs (the
// `ants` scenes: every kind of ant, as strokes and as sprites) holds that the browser draws the same pixels.

const THEME = {
  ink: "#ink",
  accent: "#accent",
  mound: "#mound",
  spore: "#spore",
  inkRgb: [10, 20, 30],
  warnRgb: [200, 100, 50],
} as unknown as FieldTheme;

const V = { w: 800, h: 600, dpr: 1 };
const CAM = { x: 50, y: 40, zoom: 10 };
const LEN = 6;
const HALF = 3;
const CRUMB = 2.1;
const DOT = Math.max(1.5, LEN * 0.45);
const screen = (wx: number, wy: number) => toScreen(CAM, V, wx, wy);
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

interface Ant {
  x: number;
  y: number;
  heading?: number;
  odour?: number;
  load?: number;
  carrying?: number;
  quality?: number;
  pellet?: number;
  corpse?: number;
  broodStage?: 0 | 1 | 2;
  /** when the corpse it carries died (default: the run's `died`) */
  died?: number;
  alive?: boolean;
  layer?: number;
}

interface Opts {
  lv?: number;
  inView?: (x: number, y: number) => boolean;
  zoom?: number;
  d?: number;
  hexes?: boolean;
  workerImage?: boolean;
  resourceImage?: boolean;
  nestImage?: boolean;
  cadaverDraws?: boolean;
  died?: number;
  reduced?: boolean;
  /** the game has frozen this colony (ja-qpv.4.5) */
  asleep?: boolean;
}

function setup(ants: Ant[], o: Opts = {}) {
  const get = <T>(f: (a: Ant) => T | undefined, dflt: T) => ants.map((a) => f(a) ?? dflt);
  const corpse = get((a) => a.corpse, 0);
  const brood = ants.flatMap((a, i) => (a.broodStage === undefined ? [] : [{ held: i, stage: a.broodStage }]));
  const col = {
    n: ants.length,
    time: 100,
    alive: get((a) => (a.alive === false ? 0 : 1), 1),
    layer: get((a) => a.layer, 1),
    x: ants.map((a) => a.x),
    y: ants.map((a) => a.y),
    heading: get((a) => a.heading, 0),
    odour: get((a) => a.odour, 0),
    load: get((a) => a.load, 0),
    carrying: get((a) => a.carrying, 0),
    quality: get((a) => a.quality, 1),
    pellet: get((a) => a.pellet, 0),
    corpse,
    carriesCorpse: (i: number) => corpse[i] === 1,
    corpses: ants.flatMap((a, i) => (a.corpse ? [{ held: i, died: a.died ?? o.died ?? 90 }] : [])),
    brood: { items: brood },
    item: (i: number) => (brood.some((b) => b.held === i) ? "brood" : "none"),
  } as unknown as Colony;
  const rec = recordingContext();
  const gaitCalls: string[] = [];
  const tints: number[][] = [];
  const cadavers: { stage: number; x: number; y: number }[] = [];
  const fc = {
    ctx: rec.ctx,
    theme: THEME,
    d: o.d ?? 1,
    v: V,
    c: { ...CAM, zoom: o.zoom ?? CAM.zoom },
    lv: o.lv ?? 1,
    env: { reducedMotion: () => !!o.reduced },
    colonies: [col],
    asleep: o.asleep ? new Set([0]) : new Set<number>(),
    sprites: {
      worker: { get: (_lod: string, tint: number[]) => (tints.push(tint), o.workerImage ? { toString: () => "worker" } : null) },
      gait: { update: () => gaitCalls.push("update"), pose: (_c: unknown, i: number) => (gaitCalls.push(`pose ${i}`), i + 1) },
      cadaver: {
        draw: (_c: unknown, _lod: string, stage: number, x: number, y: number) => (cadavers.push({ stage, x, y }), !!o.cadaverDraws),
      },
    },
  } as unknown as FieldCtx;
  const f: AntFrame = {
    len: LEN,
    half: HALF,
    crumb: CRUMB,
    inView: o.inView ?? (() => true),
    hexes: o.hexes ?? false,
    resourceLod: "tiny",
    darkSprites: false,
    nestImage: o.nestImage ? ({ toString: () => "nest" } as unknown as CanvasImageSource) : null,
    resourceImage: o.resourceImage ? ({ toString: () => "resource" } as unknown as HTMLImageElement) : null,
  };
  return { col, fc, f, rec, gaitCalls, tints, cadavers };
}

const run = (ants: Ant[], o: Opts = {}) => {
  const s = setup(ants, o);
  drawAnts(s.fc, s.f, s.col);
  return s;
};

test("each ant is a stroke along its heading, half an ant each way, in one pass a band of odour, with a tail mark across it in the band's tone", () => {
  const s = run([
    { x: 50, y: 40, heading: 0, odour: 0 },
    { x: 52, y: 40, heading: Math.PI / 2, odour: 0.95 },
  ]);
  const [a1, a2] = [screen(50, 40), screen(52, 40)];
  const t0 = odourColour([10, 20, 30], [200, 100, 50], 0);
  const t9 = odourColour([10, 20, 30], [200, 100, 50], 1);
  assert.deepEqual(s.rec.log.slice(0, 3), ["lineCap = round", `lineWidth = ${fmt(Math.max(1, LEN * 0.3))}`, "globalAlpha = 0.85"]);
  // band 0 then band 9: a body stroke, then the tail marks, each pass
  const strokes = s.rec.log.filter((l) => /^(beginPath|moveTo|lineTo|stroke|strokeStyle|globalAlpha)/.test(l)).join("|");
  const body = (x: number, y: number, h: number) =>
    `moveTo(${fmt(x - Math.cos(h) * HALF)}, ${fmt(y - Math.sin(h) * HALF)})|lineTo(${fmt(x + Math.cos(h) * HALF)}, ${fmt(y + Math.sin(h) * HALF)})`;
  const tail = (x: number, y: number, h: number) => {
    const co = Math.cos(h),
      si = Math.sin(h),
      ax = x - co * HALF * 0.45,
      ay = y - si * HALF * 0.45,
      w = Math.max(1, HALF * 0.35);
    return `moveTo(${fmt(ax - si * w)}, ${fmt(ay + co * w)})|lineTo(${fmt(ax + si * w)}, ${fmt(ay - co * w)})`;
  };
  const pass = (x: number, y: number, h: number, tone: string) =>
    `beginPath()|${body(x, y, h)}|globalAlpha = 1|strokeStyle = #ink|stroke()|beginPath()|${tail(x, y, h)}|strokeStyle = ${tone}|stroke()`;
  assert.ok(strokes.includes(`${pass(a1[0], a1[1], 0, t0)}|${pass(a2[0], a2[1], Math.PI / 2, t9)}`), strokes);
});

test("the dead, the other layer's and the out of view are left out; with no ant to show nothing is stroked", () => {
  const ants: Ant[] = [
    { x: 50, y: 40 },
    { x: 51, y: 40, alive: false },
    { x: 52, y: 40, layer: 0 },
    { x: 53, y: 40 },
  ];
  const s = run(ants, { inView: (wx) => wx < 52.5 });
  assert.equal(s.rec.log.filter((l) => l.startsWith("moveTo(")).length, 2, "one body stroke and its tail mark: one ant");
  const none = run([{ x: 50, y: 40, layer: 0 }]);
  assert.equal(none.rec.log.filter((l) => l === "stroke()").length, 1, "only the empty pellet stroke at the end");
});

test("an infected ant has a spore dot, faint for a light load and full for a heavy one; none under the threshold or from 2 up", () => {
  const s = run([
    { x: 50, y: 40, load: 0.03 },
    { x: 51, y: 40, load: 0.3 },
    { x: 52, y: 40, load: 1 },
    { x: 53, y: 40, load: 2 },
  ]);
  const dots = (alpha: number) => {
    const log = s.rec.log;
    const at = log.indexOf(`globalAlpha = ${alpha}`, log.indexOf("fillStyle = #spore"));
    return log.slice(
      at + 1,
      log.findIndex((l, k) => k > at && l.startsWith("globalAlpha")),
    );
  };
  const [x1, y1] = screen(51, 40);
  const [x2, y2] = screen(52, 40);
  assert.ok(s.rec.log.includes("fillStyle = #spore"));
  assert.deepEqual(dots(0.55), [`fillRect(${fmt(x1 - DOT / 2)}, ${fmt(y1 - DOT / 2)}, ${fmt(DOT)}, ${fmt(DOT)})`]);
  assert.deepEqual(dots(1), [`fillRect(${fmt(x2 - DOT / 2)}, ${fmt(y2 - DOT / 2)}, ${fmt(DOT)}, ${fmt(DOT)})`]);
});

test("a carrier has a crumb at its head, in the accent; food's sprite replaces it when the resource sheet is ready, by the food's quality", () => {
  const s = run([{ x: 50, y: 40, heading: 0, carrying: 1 }]);
  const [x, y] = screen(50, 40);
  assert.ok(s.rec.log.includes("fillStyle = #accent"));
  assert.ok(s.rec.log.includes(`fillRect(${fmt(x + HALF - CRUMB / 2)}, ${fmt(y - CRUMB / 2)}, ${fmt(CRUMB)}, ${fmt(CRUMB)})`));
  const turned = run([{ x: 50, y: 40, heading: Math.PI, carrying: 1 }]);
  assert.ok(
    turned.rec.log.includes(`fillRect(${fmt(x - HALF - CRUMB / 2)}, ${fmt(y - CRUMB / 2)}, ${fmt(CRUMB)}, ${fmt(CRUMB)})`),
    "at its head",
  );
  const sprite = (q: number) => run([{ x: 50, y: 40, heading: 0, carrying: 1, quality: q }], { resourceImage: true, hexes: true }).rec.log;
  const draws = (log: string[]) => log.filter((l) => l.startsWith("drawImage(resource"));
  const [plain, sweet, crumb] = [sprite(1), sprite(2), sprite(0.5)].map(draws);
  assert.equal(plain!.length, 1);
  assert.notEqual(plain![0], sweet![0], "a sweet food has its own sprite");
  assert.notEqual(plain![0], crumb![0], "and a crumb its own");
  assert.equal(plain!.length + sweet!.length + crumb!.length, 3, "one sprite a carrier");
});

test("soil is a crumb at the head, in the mound's tone; a corpse is a half-size grey cross, or the dead's sprite when one draws", () => {
  const soil = run([{ x: 50, y: 40, heading: 0, pellet: 1 }]);
  const [x, y] = screen(50, 40);
  assert.ok(soil.rec.log.includes("fillStyle = #mound") && soil.rec.log.includes("strokeStyle = #mound"));
  assert.ok(soil.rec.log.includes(`fillRect(${fmt(x + HALF - CRUMB / 2)}, ${fmt(y - CRUMB / 2)}, ${fmt(CRUMB)}, ${fmt(CRUMB)})`));
  const h = CRUMB * 0.75;
  const px = x + HALF;
  const cross = run([{ x: 50, y: 40, heading: 0, pellet: 1, corpse: 1 }]);
  const moves = cross.rec.log.filter((l) => /^(moveTo|lineTo)\(/.test(l)).slice(-4);
  assert.deepEqual(moves, [
    `moveTo(${fmt(px - h)}, ${fmt(y - h)})`,
    `lineTo(${fmt(px + h)}, ${fmt(y + h)})`,
    `moveTo(${fmt(px + h)}, ${fmt(y - h)})`,
    `lineTo(${fmt(px - h)}, ${fmt(y + h)})`,
  ]);
  const sprite = run([{ x: 50, y: 40, heading: 0, pellet: 1, corpse: 1 }], { cadaverDraws: true });
  assert.equal(sprite.rec.log.filter((l) => /^(moveTo|lineTo)\(/.test(l)).length, 4, "the body stroke and its tail mark, and no cross");
  const nest = run([{ x: 50, y: 40, heading: 0, pellet: 1, corpse: 1 }], { nestImage: true, hexes: true });
  assert.equal(nest.rec.log.filter((l) => l.startsWith("drawImage(nest")).length, 1, "the nest sheet's corpse");
});

test("carried brood is a square a stage's colour at the head, or the nest sheet's sprite", () => {
  const [x, y] = screen(50, 40);
  for (const stage of [0, 1, 2] as const) {
    const s = run([{ x: 50, y: 40, heading: 0, broodStage: stage }]);
    const tail = s.rec.log.slice(-2);
    assert.deepEqual(tail, [
      `fillStyle = ${BROOD_RGB[stage]}`,
      `fillRect(${fmt(x + HALF - CRUMB / 2)}, ${fmt(y - CRUMB / 2)}, ${fmt(CRUMB)}, ${fmt(CRUMB)})`,
    ]);
  }
  const sprite = run([{ x: 50, y: 40, heading: 0, broodStage: 1 }], { nestImage: true, hexes: true });
  assert.equal(sprite.rec.log.filter((l) => l.startsWith("drawImage(nest")).length, 1);
  const away = run([{ x: 50, y: 40, broodStage: 1, layer: 0 }]);
  assert.ok(!away.rec.log.includes(`fillStyle = ${BROOD_RGB[1]}`), "not on the other layer");
  const hidden = run([{ x: 50, y: 40, broodStage: 1 }], { inView: () => false });
  assert.ok(!hidden.rec.log.includes(`fillStyle = ${BROOD_RGB[1]}`), "not out of view");
});

test("at the hexagon zoom a worker is its sprite, tinted by band, faded in over two units of zoom, with the gait's pose when walking", () => {
  const near = run([{ x: 50, y: 40, heading: 0, odour: 0.1 }], { hexes: true, workerImage: true, zoom: 40 });
  assert.equal(near.rec.log.filter((l) => l.startsWith("drawImage(worker")).length, 1);
  assert.ok(near.rec.log.includes("globalAlpha = 1"), "fully in");
  assert.equal(near.rec.log.filter((l) => l.startsWith("moveTo(")).length, 0, "no stroke under it");
  assert.deepEqual(near.gaitCalls, ["update", "pose 0"], "the gait advances for the colony and poses the walker");
  const mid = run([{ x: 50, y: 40, heading: 0 }], { hexes: true, workerImage: true, zoom: 13 });
  assert.ok(mid.rec.log.includes("globalAlpha = 0.5"), "half in at 13 (one of two units over 12)");
  assert.equal(mid.rec.log.filter((l) => l.startsWith("drawImage(worker")).length, 1);
  assert.equal(mid.rec.log.filter((l) => l.startsWith("moveTo(")).length > 0, true, "and still a stroke under it");
  const tiny = run([{ x: 50, y: 40, heading: 0 }], { hexes: true, workerImage: true, zoom: 13 });
  assert.deepEqual(tiny.gaitCalls, ["update"], "the tiny sprite has no walking pose");
  const loading = run([{ x: 50, y: 40, heading: 0 }], { hexes: true, workerImage: false, zoom: 40 });
  assert.equal(loading.rec.log.filter((l) => l.startsWith("drawImage(")).length, 0, "no sheet yet: strokes");
  assert.ok(loading.rec.log.filter((l) => l.startsWith("moveTo(")).length > 0);
});

test("a band's sprite is tinted by its odour, from ink to the warn tone over the ten bands", () => {
  const s = run(
    [
      { x: 50, y: 40, odour: 0 },
      { x: 51, y: 40, odour: 0.95 },
    ],
    { hexes: true, workerImage: true, zoom: 40 },
  );
  assert.deepEqual(s.tints, [
    [10, 20, 30],
    [200, 100, 50],
  ]);
  const mid = run([{ x: 50, y: 40, odour: 0.45 }], { hexes: true, workerImage: true, zoom: 40 });
  assert.deepEqual(mid.tints, [[10, 20, 30].map((ink, k) => Math.round(ink + (([200, 100, 50][k] as number) - ink) * (4 / 9)))]);
});

test("what an ant carries sits at its head: a sprite's reach is 0.46 of the zoom, a mark's half an ant", () => {
  const x = (log: string[], kind: string) => Number(log.find((l) => l.startsWith(`drawImage(${kind}`))!.split(", ")[5]);
  const at = (heading: number) => run([{ x: 50, y: 40, heading, carrying: 1 }], { resourceImage: true, hexes: true, zoom: 40 }).rec.log;
  assert.ok(Math.abs(x(at(0), "resource") - x(at(Math.PI), "resource") - 2 * 0.46 * 40) < 0.01, "food");
  const soilAt = (heading: number) => run([{ x: 50, y: 40, heading, pellet: 1 }], { hexes: true, zoom: 40 }).rec.log;
  const fillX = (log: string[]) =>
    Number(
      log
        .filter((l) => l.startsWith("fillRect("))[0]!
        .slice(9)
        .split(", ")[0],
    );
  assert.ok(Math.abs(fillX(soilAt(0)) - fillX(soilAt(Math.PI)) - 2 * 0.46 * 40) < 0.01, "soil, with hexagons but no sheet");
  const broodAt = (heading: number) => run([{ x: 50, y: 40, heading, broodStage: 0 }], { hexes: true, nestImage: true, zoom: 40 }).rec.log;
  assert.ok(Math.abs(x(broodAt(0), "nest") - x(broodAt(Math.PI), "nest") - 2 * 0.46 * 40) < 0.01, "brood");
});

test("a carried corpse asks for the dead's stage of decay at its head; the tail mark's width is at least a device pixel", () => {
  const s = run([{ x: 50, y: 40, heading: 0, pellet: 1, corpse: 1 }], { died: 90 });
  assert.equal(s.cadavers[0]!.stage, decayStage(100, 90));
  const late = run([{ x: 50, y: 40, heading: 0, pellet: 1, corpse: 1 }], { died: -800 });
  assert.equal(late.cadavers[0]!.stage, decayStage(100, -800));
  assert.notEqual(decayStage(100, 90), decayStage(100, -800));
  // at two device pixels to a CSS pixel the tail mark is at least 2 wide: (x - si*w) with heading 0 is the same x, y moves by w
  const wide = run([{ x: 50, y: 40, heading: 0 }], { d: 2 });
  const [, y] = screen(50, 40);
  const tail = wide.rec.log.filter((l) => l.startsWith("moveTo("))[1]!;
  assert.equal(tail, `moveTo(${fmt(screen(50, 40)[0] - HALF * 0.45)}, ${fmt(y + 2)})`);
});

test("a band with only the dead in it is not stroked; a sheet that is ready is not used below the hexagon zoom; reduced motion has no walking pose", () => {
  const dead = run([
    { x: 50, y: 40, odour: 0 },
    { x: 51, y: 40, odour: 0.95, alive: false },
  ]);
  assert.equal(dead.rec.log.filter((l) => l === "stroke()").length, 3, "one band: its body and tail strokes, and the pellets' stroke");
  const flat = run([{ x: 50, y: 40 }], { hexes: false, workerImage: true, zoom: 40 });
  assert.equal(flat.rec.log.filter((l) => l.startsWith("drawImage(")).length, 0, "not hexagon zoom: strokes");
  assert.deepEqual(flat.tints, [], "and the sheet is not even asked for");
  const exact = run([{ x: 50, y: 40 }], { hexes: true, workerImage: true, zoom: 12 });
  assert.equal(exact.rec.log.filter((l) => l.startsWith("drawImage(")).length, 0, "at the hexagon zoom exactly the fade has not begun");
  assert.ok(exact.rec.log.filter((l) => l.startsWith("moveTo(")).length > 0);
  const still = run([{ x: 50, y: 40 }], { hexes: true, workerImage: true, zoom: 40, reduced: true });
  assert.deepEqual(still.gaitCalls, ["update"], "reduced motion: no pose");
  assert.equal(still.rec.log.filter((l) => l.startsWith("drawImage(worker")).length, 1, "but the sprite");
});

test("the sprite fades in as the stroke fades out: a quarter in at 12.5, the stroke at three quarters", () => {
  const s = run([{ x: 50, y: 40 }], { hexes: true, workerImage: true, zoom: 12.5 });
  const log = s.rec.log;
  const sprite = log.indexOf("globalAlpha = 0.25");
  assert.ok(sprite >= 0 && log[sprite + 1]!.startsWith("drawImage(worker"), "the sprite at a quarter");
  assert.ok(log.includes("globalAlpha = 0.75"), "the stroke at three quarters");
});

test("a load exactly at the infection threshold shows its faint dot", () => {
  const s = run([{ x: 50, y: 40, load: INFECTED }]);
  const [x, y] = screen(50, 40);
  assert.ok(s.rec.log.includes(`fillRect(${fmt(x - DOT / 2)}, ${fmt(y - DOT / 2)}, ${fmt(DOT)}, ${fmt(DOT)})`));
});

test("a soil crumb's sprite is the crumb column, as a crumb of food is; the cross and soil stroke at a device pixel's worth, 0.8 of it above 1.25", () => {
  const sx = (log: string[]) => log.find((l) => l.startsWith("drawImage(resource"))!.split(", ")[1];
  const soil = run([{ x: 50, y: 40, pellet: 1 }], { resourceImage: true, hexes: true, zoom: 40 }).rec.log;
  const crumbFood = run([{ x: 50, y: 40, carrying: 1, quality: 0.5 }], { resourceImage: true, hexes: true, zoom: 40 }).rec.log;
  const plainFood = run([{ x: 50, y: 40, carrying: 1, quality: 1 }], { resourceImage: true, hexes: true, zoom: 40 }).rec.log;
  assert.equal(sx(soil), sx(crumbFood));
  assert.notEqual(sx(soil), sx(plainFood));
  const one = run([{ x: 50, y: 40, pellet: 1 }], { d: 1 }).rec.log;
  assert.equal(one[one.indexOf("strokeStyle = #mound") + 1], "lineWidth = 1");
  const two = run([{ x: 50, y: 40, pellet: 1 }], { d: 2 }).rec.log;
  assert.equal(two[two.indexOf("strokeStyle = #mound") + 1], "lineWidth = 1.6");
});

test("each carried corpse has its own decay stage, and the nest sheet's brood sprite is the carried brood's stage", () => {
  const two = run([
    { x: 50, y: 40, pellet: 1, corpse: 1, died: 90 },
    { x: 51, y: 40, pellet: 1, corpse: 1, died: -800 },
  ]);
  assert.deepEqual(
    two.cadavers.map((k) => k.stage),
    [decayStage(100, 90), decayStage(100, -800)],
    "each carrier's own corpse",
  );
  assert.notEqual(decayStage(100, 90), decayStage(100, -800));
  const sheet = (stage: 0 | 1 | 2) =>
    run([{ x: 50, y: 40, heading: 0, broodStage: stage }], { nestImage: true, hexes: true, zoom: 40 }).rec.log.filter((l) =>
      l.startsWith("drawImage(nest"),
    )[0];
  const [egg, larva, pupa] = [sheet(0), sheet(1), sheet(2)];
  assert.notEqual(egg, larva);
  assert.notEqual(larva, pupa);
  assert.notEqual(egg, pupa);
});

test("a colony the game has frozen draws every ant at half strength, and leaves the strength at 1 for the next stage", () => {
  const ants: Ant[] = [
    { x: 50, y: 40, heading: 0, odour: 0 },
    { x: 52, y: 40, heading: 1, odour: 0.9, load: INFECTED },
    { x: 54, y: 40, heading: 2, load: 1, carrying: 1 },
    { x: 56, y: 40, heading: 3, pellet: 1 },
  ];
  const awake = run(ants).rec.log;
  const asleep = run(ants, { asleep: true }).rec.log;
  const halved = awake.map((l) => {
    const m = /^globalAlpha = (.+)$/.exec(l);
    return m ? `globalAlpha = ${fmt(Number(m[1]) * 0.5)}` : l;
  });
  assert.ok(
    awake.some((l) => l === "globalAlpha = 0.85") && awake.some((l) => l === "globalAlpha = 0.55"),
    "the awake log has the alphas to halve",
  );
  assert.deepEqual(asleep, [...halved, "globalAlpha = 1"], "the same strokes, each strength halved, and the strength left at 1");
  const other = setup(ants);
  other.fc.asleep = new Set([1]);
  drawAnts(other.fc, other.f, other.col);
  assert.deepEqual(other.rec.log, awake, "another colony asleep changes nothing here");
});

test("a frozen colony's walkers are still: the gait is not posed, though the sprite is drawn", () => {
  const o = { hexes: true, workerImage: true, zoom: 40 };
  const awake = run([{ x: 50, y: 40, heading: 0, odour: 0.1 }], o);
  assert.deepEqual(awake.gaitCalls, ["update", "pose 0"]);
  const asleep = run([{ x: 50, y: 40, heading: 0, odour: 0.1 }], { ...o, asleep: true });
  assert.deepEqual(asleep.gaitCalls, ["update"], "no walking pose for a sleeper");
  assert.equal(asleep.rec.log.filter((l) => l.startsWith("drawImage(worker")).length, 1, "but it is still drawn");
  assert.ok(asleep.rec.log.includes("globalAlpha = 0.5"), "at half strength");
});
