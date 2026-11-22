import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HYPHA_MASS,
  HYPHA_ROOT,
  PLANE,
  CURTAIN,
  cellKey,
  centreX,
  centreY,
  hyphaCell,
  Hyphae,
  nx as neighbourX,
  ny as neighbourY,
  type Colony,
  type Fungus,
} from "../../colony/index.ts";
import type { Camera, Viewport } from "../camera.ts";
import { toScreen } from "../camera.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import type { FieldEnv, SpriteSets } from "../field/env.ts";
import { REBUILD_MAX, REBUILD_MIN, drawFungusGround, drawHyphae, drawStalksRaised, type CellWindow } from "../field/fungus.ts";
import { HYPHA_COLOURS } from "../hyphaVisual.ts";
import { chainsOf, hash, twigsOf, wander } from "../hyphaeLook.ts";
import { workerLod } from "../workerSprites.ts";
import { RecordedPath, callsOf, recordingContext, shape, stateAt } from "./recordingContext.ts";

// The fungus layers on a recording fake context (ja-fnd.6.3.6): the hyphae, cords, twigs, tips, the mass in transit, the knots, the corpses it
// colonised and the stalks raised on them. The hyphae are a hand-built tree (the layer reads only the tree's maps and lists), so the tests are fast and
// every number is chosen. scripts/field-shots.mjs (grown-above, grown-below, above-later) holds that the pixels are what the browser draws.

const V: Viewport = { w: 800, h: 600, dpr: 1 };
const THEME = { paper: "#paper", ink: "#ink" } as unknown as FieldTheme;
const key = (x: number, y: number) => cellKey(x, y);

/**
 * A tree on row 10: a root at x = 10, a thin run to x = 14, a branch off x = 12 that is a cord, and a far run that is out of the view; and
 * small runs on the window's edges (drawn one cell outside it, skipped two). A real Hyphae, filled in by hand, so tsc checks every field.
 */
function tree(): Hyphae {
  const h = new Hyphae();
  const run = (a: [number, number], b: [number, number]) => {
    h.parent.set(key(a[0], a[1]), HYPHA_ROOT);
    h.parent.set(key(b[0], b[1]), key(a[0], a[1]));
  };
  h.parent.set(key(10, 10), HYPHA_ROOT);
  for (let x = 11; x <= 14; x++) h.parent.set(key(x, 10), key(x - 1, 10)); // thin: 10 → 14
  h.parent.set(key(12, 11), key(12, 10)); // a cord: 12,10 → 12,11 → 12,12
  h.parent.set(key(12, 12), key(12, 11));
  run([60, 10], [61, 10]); // far away: out of the window
  run([12, 40], [13, 40]); // in the columns of the window, far below it
  // the window is x 4 … 24, y 4 … 18; a run is drawn when its box is within a cell of it
  run([12, 19], [13, 19]); // a row below: drawn (a longer run, so its twigs are there to see)
  h.parent.set(key(14, 19), key(13, 19));
  h.parent.set(key(15, 19), key(14, 19));
  h.parent.set(key(16, 19), key(15, 19));
  run([12, 20], [13, 20]); // two rows below: skipped
  run([25, 10], [26, 10]); // a column right: drawn
  run([26, 11], [27, 11]); // two columns right: skipped
  run([2, 11], [3, 11]); // box ends a column left: drawn
  run([1, 12], [2, 12]); // ends two left: skipped
  run([12, 3], [13, 3]); // a row above: drawn
  run([12, 2], [13, 2]); // two rows above: skipped
  h.cords = new Set([key(12, 11), key(12, 12)]);
  h.tips = [
    { x: 14, y: 10, heading: 0 },
    { x: 13, y: 10, heading: 3 },
  ] as unknown as Hyphae["tips"];
  h.loads = new Map<number, number>([
    [key(12, 10), HYPHA_MASS * 2], // full: a bright wide glow
    [key(11, 10), HYPHA_MASS * 0.5], // half
    [key(13, 10), HYPHA_MASS * 0.05], // under a tenth: none
    [key(60, 10), HYPHA_MASS * 2], // out of view: none
    [key(14, 10), HYPHA_MASS * 0.15], // just over a tenth: a faint small glow
  ]);
  h.knots = new Map([
    [key(11, 10), { sprouted: false }],
    [key(13, 10), { sprouted: true }],
  ]) as unknown as Hyphae["knots"];
  h.fruits = [key(14, 10), key(62, 10)];
  h.fusions = [key(10, 10), key(14, 10), key(60, 10), key(61, 10), key(14, 10), key(60, 10)]; // in; out; one end in
  return h;
}

const WIN: CellWindow = { rx0: 4, rx1: 24, ry0: 4, ry1: 18 };
const CAM: Camera = { x: centreX(12, 10), y: centreY(10), zoom: 20 };

interface Setup {
  hyphae?: Hyphae | null;
  lv?: number;
  zoom?: number;
  d?: number;
  now?: () => number;
  stalks?: number[];
  level?: number;
  corpses?: Map<number, number>;
  cadavers?: { x: number; y: number; layer?: number }[];
}

function field(o: Setup = {}) {
  const rec = recordingContext();
  const paths: RecordedPath[] = [];
  /** the context's alpha at each fungal sprite draw (a real sprite is drawn at it) */
  const alphas: number[] = [];
  const sprites = {
    fungal: {
      draw: (cx: unknown, spec: unknown, seed: number, x: number, y: number, zoom: number, layer = "all") => {
        alphas.push((cx as CanvasRenderingContext2D).globalAlpha);
        rec.log.push(
          `fungal.draw(${JSON.stringify(spec)}, ${seed}, ${Math.round(x * 1000) / 1000}, ${Math.round(y * 1000) / 1000}, ${zoom}, ${layer})`,
        );
      },
    },
    cadaver: {
      draw: (_ctx: unknown, lod: string, stage: number, x: number, y: number, zoom: number) => {
        rec.log.push(`cadaver.draw(${lod}, ${stage}, ${Math.round(x * 1000) / 1000}, ${Math.round(y * 1000) / 1000}, ${zoom})`);
        return true;
      },
    },
  } as unknown as SpriteSets;
  const env: FieldEnv = {
    now: o.now ?? (() => 1000),
    dpr: () => o.d ?? 1,
    dev: false,
    reducedMotion: () => false,
    newPath: () => {
      const p = new RecordedPath();
      paths.push(p);
      return p as unknown as Path2D;
    },
    sprites: () => sprites,
  };
  const h = o.hyphae === undefined ? tree() : o.hyphae;
  const lv = o.lv ?? PLANE;
  const fungus = {
    hyphaeOn: (l: number) => (l === lv ? h : null),
    stalksOn: (l: number) => (l === lv ? (o.stalks ?? []) : []),
    corpsesOn: (l: number) => (l === lv ? (o.corpses ?? new Map<number, number>()) : new Map<number, number>()),
    evolution: { level: () => o.level ?? 0 },
  } as unknown as Fungus;
  const colonies = [
    { time: 100, home: 0, corpses: (o.cadavers ?? []).map((c) => ({ ...c, held: -1, died: 99 })), remains: [] },
  ] as unknown as Colony[];
  const k = {
    ctx: rec.ctx,
    theme: THEME,
    d: o.d ?? 1,
    v: V,
    c: { ...CAM, zoom: o.zoom ?? CAM.zoom },
    lv,
    env,
    sprites,
    colonies,
    fungus,
  } as unknown as FieldCtx;
  return { k, h: h as Hyphae, paths, alphas, ...rec };
}

/** The screen place of cell (x, y) as the hyphae are drawn: bent by the warp. */
function bentAt(k: FieldCtx, x: number, y: number): [number, number] {
  const p = [0, 0];
  wander(centreX(x, y), centreY(y), p);
  return toScreen(k.c, V, p[0]!, p[1]!);
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The twigs the layer should draw for `h` at this camera and window, found again here from the helpers' own rules (chain runs, twigs of one cell). */
function expectedTwigs(k: FieldCtx, h: Hyphae, win: CellWindow): string[] {
  const out = new RecordedPath();
  const inView = (x: number, y: number) => x >= win.rx0 - 1 && x <= win.rx1 + 1 && y >= win.ry0 - 1 && y <= win.ry1 + 1;
  for (const ch of chainsOf(h.parent, h.cords, HYPHA_ROOT)) {
    if (ch.cord) continue;
    const cells = ch.cells.map((c) => hyphaCell(c));
    const box = {
      x0: Math.min(...cells.map((c) => c[0])),
      x1: Math.max(...cells.map((c) => c[0])),
      y0: Math.min(...cells.map((c) => c[1])),
      y1: Math.max(...cells.map((c) => c[1])),
    };
    if (box.x1 < win.rx0 - 1 || box.x0 > win.rx1 + 1 || box.y1 < win.ry0 - 1 || box.y0 > win.ry1 + 1) continue;
    const world: number[] = [];
    for (const [cx, cy] of cells) {
      const p = [0, 0];
      wander(centreX(cx, cy), centreY(cy), p);
      world.push(p[0]!, p[1]!);
    }
    for (let i = 1; i < cells.length; i++) {
      if (!inView(cells[i]![0], cells[i]![1])) continue;
      const [sx, sy] = toScreen(k.c, V, world[2 * i]!, world[2 * i + 1]!);
      const angle = Math.atan2(world[2 * i + 1]! - world[2 * i - 1]!, world[2 * i]! - world[2 * i - 2]!);
      twigsOf(out, ch.cells[i]!, sx, sy, angle, k.c.zoom * 0.12, 0.65);
    }
  }
  return out.cmds;
}

test("drawHyphae: the thin runs and the cords are two strokes, the cords thicker; on the plane faint, in the curtain plainer", () => {
  const f = field();
  drawHyphae(f.k, f.h, true, WIN);
  const s = shape(f.log);
  // the strokes, in order: thin path then cord path (each inside a save/restore), then the twigs
  const strokes = f.log.reduce<number[]>((a, l, i) => (l.startsWith("stroke(") ? [...a, i] : a), []);
  assert.equal(strokes.length, 3, "hyphae, cords, twigs");
  assert.equal(stateAt(f.log, strokes[0]!, "globalAlpha"), 0.45, "faint on the plane");
  assert.equal(stateAt(f.log, strokes[0]!, "strokeStyle"), HYPHA_COLOURS.body);
  assert.equal(stateAt(f.log, strokes[0]!, "lineWidth"), 2.4, "thin: 0.12 of a 20 px cell");
  assert.equal(stateAt(f.log, strokes[1]!, "lineWidth"), 6.4, "cords: 0.32 of a cell, at most 8");
  assert.equal(stateAt(f.log, strokes[0]!, "lineCap"), "round");
  assert.equal(stateAt(f.log, strokes[0]!, "lineJoin"), "round");
  assert.equal(stateAt(f.log, strokes[2]!, "strokeStyle"), HYPHA_COLOURS.core, "the twigs in the core colour");
  assert.equal(stateAt(f.log, strokes[2]!, "lineWidth"), 1, "twigs: max(d, 0.025 of a cell): a device pixel at this zoom");
  // the paths: the thin one holds the chains that are not cords (10 → 14, 12,10 → ..., and the far one is out of the window), the fusion's bow
  assert.equal(f.paths.length, 3);
  const thin = f.paths[0]!.cmds;
  const cords = f.paths[1]!.cmds;
  assert.equal(
    thin.filter((c) => c.startsWith("moveTo")).length,
    2 + 4 + 2,
    "two thin runs, four small ones at the window's edge, and two fusions' bows (one has an end in view); the far runs and fusion are out",
  );
  const [fx, fy] = bentAt(f.k, 10, 10);
  assert.equal(thin[0], `moveTo(${r3(fx)}, ${r3(fy)})`, "the first run starts at its first cell's bent place on the screen");
  const [cx0, cy0] = bentAt(f.k, 12, 10);
  assert.equal(cords[0], `moveTo(${r3(cx0)}, ${r3(cy0)})`, "and the cord at its first cell's");
  assert.equal(cords.filter((c) => c.startsWith("moveTo")).length, 1, "one cord run");
  const [sx, sy] = bentAt(f.k, 10, 10);
  const [tx, ty] = bentAt(f.k, 14, 10);
  const bow = (hash(key(10, 10), key(14, 10), 3) - 0.5) * 0.7;
  assert.ok(
    thin.includes(`quadraticCurveTo(${r3((sx + tx) / 2 - (ty - sy) * bow)}, ${r3((sy + ty) / 2 + (tx - sx) * bow)}, ${r3(tx)}, ${r3(ty)})`),
    "the fusion is a gently bowed curve from one cell to the other",
  );
  assert.deepEqual(
    f.paths[2]!.cmds,
    expectedTwigs(f.k, f.h, WIN),
    "the twigs of the thin runs only (a cord's cells have none), along each run, at their density",
  );
  assert.ok(f.paths[2]!.cmds.length > 0);
  assert.equal(shape(f.log)[0], "save()");
  assert.ok(s.includes("restore()"));
  assert.equal(callsOf(f.log, "save").length, callsOf(f.log, "restore").length, "every save is restored");
  const deep = field({ lv: CURTAIN });
  drawHyphae(deep.k, deep.h, false, WIN);
  const st = deep.log.findIndex((l) => l.startsWith("stroke("));
  assert.equal(stateAt(deep.log, st, "globalAlpha"), 0.9, "plainer in the curtain");
});

test("drawHyphae: line widths follow the zoom and the device ratio, within their clamps; twigs only once the cells are drawn as hexagons", () => {
  const close = field({ zoom: 60 });
  drawHyphae(close.k, close.h, true, WIN);
  const strokes = close.log.reduce<number[]>((a, l, i) => (l.startsWith("stroke(") ? [...a, i] : a), []);
  assert.equal(stateAt(close.log, strokes[0]!, "lineWidth"), 3, "thin at most 3 px a device pixel");
  assert.equal(stateAt(close.log, strokes[1]!, "lineWidth"), 8, "cords at most 8");
  assert.equal(stateAt(close.log, strokes[2]!, "lineWidth"), 1.5, "twigs 0.025 of the cell");
  const far = field({ zoom: 6 });
  drawHyphae(far.k, far.h, true, WIN);
  assert.equal(far.log.filter((l) => l.startsWith("stroke(")).length, 2, "zoomed out (under 12): no twigs");
  assert.equal(far.paths.length, 2);
  const farStrokes = far.log.reduce<number[]>((a, l, i) => (l.startsWith("stroke(") ? [...a, i] : a), []);
  assert.equal(stateAt(far.log, farStrokes[1]!, "lineWidth"), 2.5, "cords at least 2.5 device pixels");
  const s1 = far.log.findIndex((l) => l.startsWith("stroke("));
  assert.equal(stateAt(far.log, s1, "lineWidth"), 1, "thin at least a device pixel");
  const retina = field({ zoom: 20, d: 2 });
  drawHyphae(retina.k, retina.h, true, WIN);
  assert.equal(retina.log.filter((l) => l.startsWith("stroke(")).length, 2, "at two device pixels, 20 is still under a hexagon's 12 × 2");
  const s2 = retina.log.findIndex((l) => l.startsWith("stroke("));
  assert.equal(stateAt(retina.log, s2, "lineWidth"), 2.4);
  const hexes = field({ zoom: 30, d: 2 });
  drawHyphae(hexes.k, hexes.h, true, WIN);
  const hs = hexes.log.reduce<number[]>((a, l, i) => (l.startsWith("stroke(") ? [...a, i] : a), []);
  assert.equal(hs.length, 3, "30 is past a hexagon's 12 × 2: twigs");
  assert.equal(stateAt(hexes.log, hs[2]!, "lineWidth"), 2, "twigs at least a device pixel, which is 2 CSS-scaled px");
});

test("drawHyphae: a tip is a sprite along its heading, mass in transit a glow, knots and fruits sprites; each only in the window", () => {
  const f = field();
  drawHyphae(f.k, f.h, true, WIN);
  const sprites = f.log.filter((l) => l.startsWith("fungal.draw("));
  const [tx, ty] = bentAt(f.k, 14, 10);
  const along = (x: number, y: number, heading: number) => [
    centreX(neighbourX(x, y, heading), neighbourY(y, heading)) - centreX(x, y),
    centreY(neighbourY(y, heading)) - centreY(y),
  ];
  assert.ok(sprites[0]!.startsWith(`fungal.draw({"tips":[${JSON.stringify(along(14, 10, 0))}]}, 0, `), "a tip points along its heading");
  assert.ok(sprites[1]!.startsWith(`fungal.draw({"tips":[${JSON.stringify(along(13, 10, 3))}]}, 0, `), "and another along its own");
  assert.notDeepEqual(along(14, 10, 0), along(13, 10, 3));
  assert.ok(sprites[0]!.includes(`, ${r3(tx)}, ${r3(ty)}, 20, all)`), "at the tip's bent place");
  // glow: two cells carry at least a tenth; each its own alpha and radius; fill after the arc
  assert.equal(callsOf(f.log, "arc").length, 3);
  const arcs = f.log.reduce<number[]>((a, l, i) => (l.startsWith("arc(") ? [...a, i] : a), []);
  assert.equal(stateAt(f.log, arcs[0]!, "globalAlpha"), 0.3, "the full one: 0.3 on the plane");
  assert.equal(stateAt(f.log, arcs[1]!, "globalAlpha"), 0.075, "the quarter-full one");
  assert.equal(stateAt(f.log, arcs[2]!, "globalAlpha"), 0.023, "a hair over a tenth of the mass: faint");
  const [lx, ly] = bentAt(f.k, 12, 10);
  assert.ok(f.log[arcs[0]!]!.startsWith(`arc(${r3(lx)}, ${r3(ly)}, 7.2, `), "radius 3.6 × (1 + full)");
  assert.equal(f.log[arcs[0]! + 1], "fill()");
  assert.equal(callsOf(f.log, "beginPath").length, 3, "each glow is a path of its own: else each fill() paints the earlier ones again");
  assert.equal(stateAt(f.log, arcs[0]!, "fillStyle"), HYPHA_COLOURS.body);
  // knots (two, one sprouted) and fruits (one in the window)
  const knots = sprites.filter((l) => l.includes('"knot":true'));
  assert.equal(knots.length, 2);
  assert.ok(
    knots[0]!.includes('"knot":true,"knotSprouted":false,"fruit":false') &&
      knots[1]!.includes('"knot":true,"knotSprouted":true,"fruit":false'),
  );
  const spriteAt = (line: string) => f.alphas[f.log.filter((l) => l.startsWith("fungal.draw(")).indexOf(line)];
  assert.ok(
    knots.every((l) => spriteAt(l) === 1),
    "knots are drawn opaque, not at the last glow's alpha",
  );
  assert.ok(
    sprites.filter((l) => l.includes('"tips"')).every((l) => spriteAt(l) === 1),
    "and the tips",
  );
  const fruit = sprites.filter((l) => l.includes('"fruit":true'));
  assert.equal(fruit.length, 1, "the far fruit is out of the window");
  assert.ok(fruit[0]!.includes('"knot":false'));
  assert.ok(fruit[0]!.includes(`, ${key(14, 10)}, `), "seeded by its cell");
  const deep = field({ lv: CURTAIN });
  drawHyphae(deep.k, deep.h, false, WIN);
  const a0 = deep.log.findIndex((l) => l.startsWith("arc("));
  assert.equal(stateAt(deep.log, a0, "globalAlpha"), 0.5, "brighter in the curtain");
  assert.equal(stateAt(deep.log, deep.log.length, "globalAlpha"), 1, "and back to opaque after");
});

test("drawHyphae: only the cells in the window (and a cell's margin) are drawn; an empty window draws no run", () => {
  const f = field();
  drawHyphae(f.k, f.h, true, { rx0: 40, rx1: 50, ry0: 40, ry1: 50 });
  assert.equal(f.paths[0]!.cmds.length, 0);
  assert.equal(f.paths[1]!.cmds.length, 0);
  assert.equal(callsOf(f.log, "arc").length, 0);
  assert.equal(f.log.filter((l) => l.startsWith("fungal.draw(")).length, 0);
  // a margin of one cell: a tip at x = 15 is in a window that ends at 14
  const edge = field();
  (edge.h as unknown as { tips: unknown[] }).tips = [
    { x: 15, y: 10, heading: 0 },
    { x: 16, y: 10, heading: 0 },
  ];
  drawHyphae(edge.k, edge.h, true, { rx0: 4, rx1: 14, ry0: 4, ry1: 18 });
  assert.equal(
    edge.log.filter((l) => l.startsWith('fungal.draw({"tips"')).length,
    1,
    "x = 15 is within a cell of the window, x = 16 is not",
  );
});

test("drawHyphae: the runs are found again only when the tree changes or in time (the chain cache, read from the env's clock)", () => {
  let now = 1000;
  const f = field({ now: () => now });
  drawHyphae(f.k, f.h, true, WIN);
  const first = f.paths[0]!.cmds.join(";");
  // a cell added at once: inside REBUILD_MIN the old runs are kept
  f.h.parent.set(key(15, 10), key(14, 10));
  now += REBUILD_MIN - 1;
  const quick = field({ now: () => now, hyphae: f.h });
  drawHyphae(quick.k, f.h, true, WIN);
  assert.equal(quick.paths[0]!.cmds.join(";"), first, "a growing tree is not searched again within the minimum");
  // after the minimum, a changed size is found again
  now += 2;
  const later = field({ now: () => now, hyphae: f.h });
  drawHyphae(later.k, f.h, true, WIN);
  assert.notEqual(later.paths[0]!.cmds.join(";"), first, "the new cell is in the run");
  // a tree of the same size but another set of cords is found again after the minimum
  const h3 = { ...(f.h as object), parent: new Map(f.h.parent), cords: new Set(f.h.cords) } as unknown as Hyphae;
  const t0 = field({ now: () => now, hyphae: h3 });
  drawHyphae(t0.k, h3, true, WIN);
  h3.cords.add(key(13, 10));
  now += REBUILD_MIN + 1;
  const t1 = field({ now: () => now, hyphae: h3 });
  drawHyphae(t1.k, h3, true, WIN);
  assert.notEqual(t1.paths[0]!.cmds.join(";"), t0.paths[0]!.cmds.join(";"), "a cell that became a cord changes the runs");
  // a tree of the same size is kept until the maximum
  const same = new Map(f.h.parent);
  const h2 = { ...(f.h as object), parent: same } as unknown as Hyphae;
  const a = field({ now: () => now, hyphae: h2 });
  drawHyphae(a.k, h2, true, WIN);
  const kept = a.paths[0]!.cmds.join(";");
  same.delete(key(15, 10));
  same.set(key(16, 10), key(14, 10)); // same size, other shape
  now += REBUILD_MAX - 1;
  const b = field({ now: () => now, hyphae: h2 });
  drawHyphae(b.k, h2, true, WIN);
  assert.equal(b.paths[0]!.cmds.join(";"), kept, "same size: kept");
  now += 2;
  const c = field({ now: () => now, hyphae: h2 });
  drawHyphae(c.k, h2, true, WIN);
  assert.notEqual(c.paths[0]!.cmds.join(";"), kept, "found again at the maximum");
});

test("drawFungusGround: the hyphae of this layer, then each colonised corpse as a ground mark, a stalk's level only where it has one, the cadaver under a stalk with none visible", () => {
  const corpses = new Map<number, number>([
    [key(8, 8), 3], // spores left: sporulating, no stalk
    [key(9, 9), 0], // spent
    [key(10, 8), 2], // a stalk, and a cadaver lies there: no cadaver drawn
    [key(11, 8), 2], // a stalk, no cadaver: drawn
    [key(70, 8), 2], // out of the window
    [key(9, 50), 2], // in the columns of the window, far below it
    // the window's edge: a cell outside it is still drawn (a mark's size reaches in), two outside is not
    [key(25, 8), 1],
    [key(26, 8), 1],
    [key(3, 8), 1],
    [key(2, 8), 1],
    [key(8, 19), 1],
    [key(8, 20), 1],
    [key(8, 3), 1],
    [key(8, 2), 1],
  ]);
  const f = field({ corpses, stalks: [key(10, 8), key(11, 8)], level: 2, cadavers: [{ x: 10, y: 8 }] });
  const out = drawFungusGround(f.k, WIN);
  assert.deepEqual([...out.stalks], [key(10, 8), key(11, 8)]);
  assert.equal(out.stalkLevel, 2);
  const marks = f.log.filter((l) => l.startsWith("fungal.draw(") && l.includes("colonised"));
  assert.equal(marks.length, 4 + 4, "four in the window and four a cell outside its edges");
  assert.ok(marks[0]!.includes('{"colonised":true,"sporulating":true,"stalkLevel":0}'));
  assert.ok(marks[1]!.includes('{"colonised":true,"sporulating":false,"stalkLevel":0}'), "spent: not sporulating");
  assert.ok(marks[2]!.includes('"stalkLevel":2') && marks[3]!.includes('"stalkLevel":2'));
  assert.ok(marks.every((m) => m.endsWith(", ground)")));
  const cad = f.log.filter((l) => l.startsWith("cadaver.draw("));
  assert.equal(cad.length, 1, "a cadaver under the stalk that has none visible");
  const [sx, sy] = toScreen(f.k.c, V, centreX(11, 8), centreY(8));
  assert.equal(cad[0], `cadaver.draw(${workerLod(20, 1)}, 1, ${r3(sx)}, ${r3(sy)}, 20)`);
  const stroke0 = f.log.findIndex((l) => l.startsWith("stroke("));
  assert.equal(stateAt(f.log, stroke0, "globalAlpha"), 0.45, "the plane's hyphae are faint");
  const deepGround = field({ lv: CURTAIN });
  drawFungusGround(deepGround.k, WIN);
  assert.equal(
    stateAt(
      deepGround.log,
      deepGround.log.findIndex((l) => l.startsWith("stroke(")),
      "globalAlpha",
    ),
    0.9,
    "the curtain's are plainer",
  );
  // at two device pixels the lod is the other one
  const retina = field({ d: 2, corpses: new Map([[key(11, 8), 2]]), stalks: [key(11, 8)], level: 2 });
  drawFungusGround(retina.k, WIN);
  assert.equal(workerLod(20, 2), "tiny");
  assert.notEqual(workerLod(20, 2), workerLod(20, 1));
  assert.ok(
    retina.log.some((l) => l.startsWith("cadaver.draw(tiny, ")),
    "the cadaver's lod is by the device ratio",
  );
  // hyphae come first
  assert.ok(f.log.findIndex((l) => l.startsWith("stroke(")) < f.log.findIndex((l) => l.includes("colonised")));
  // another layer: no hyphae there, the corpses of that layer
  const curtain = field({
    lv: CURTAIN,
    hyphae: null,
    corpses: new Map([
      [key(8, 8), 1],
      [key(9, 8), 1],
    ]),
    stalks: [key(8, 8), key(9, 8)],
    level: 1,
    cadavers: [{ x: 8, y: 8, layer: CURTAIN }], // a visible cadaver of this layer under the first stalk; none under the second
  });
  const outCurtain = drawFungusGround(curtain.k, WIN);
  assert.equal(callsOf(curtain.log, "stroke").length, 0, "no hyphae on this layer");
  assert.deepEqual([...outCurtain.stalks], [key(8, 8), key(9, 8)], "the stalks of this layer");
  assert.equal(curtain.log.filter((l) => l.includes("colonised")).length, 2, "the corpses of this layer");
  assert.equal(
    curtain.log.filter((l) => l.startsWith("cadaver.draw(")).length,
    1,
    "a cadaver only under the stalk that has none visible on this layer",
  );
});

test("drawStalksRaised: each stalk again, raised, in the window only, at the level the ground stage found", () => {
  const f = field();
  const edges = [key(25, 8), key(3, 8), key(8, 19), key(8, 3)]; // a cell outside the window: drawn
  const beyond = [key(26, 8), key(2, 8), key(8, 20), key(8, 2)]; // two outside: not
  drawStalksRaised(f.k, WIN, { stalks: new Set([key(10, 8), key(70, 8), key(12, 12), ...edges, ...beyond]), stalkLevel: 2 });
  const lines = f.log.filter((l) => l.startsWith("fungal.draw("));
  assert.equal(lines.length, 2 + 4, "the far one and those two cells outside are out of the window");
  const [x, y] = toScreen(f.k.c, V, centreX(10, 8), centreY(8));
  assert.equal(lines[0], `fungal.draw({"stalkLevel":2}, ${key(10, 8)}, ${r3(x)}, ${r3(y)}, 20, raised)`);
  assert.ok(lines[1]!.includes(`${key(12, 12)}`));
  const none = field();
  drawStalksRaised(none.k, WIN, { stalks: new Set(), stalkLevel: 2 });
  assert.deepEqual(none.log, []);
});
