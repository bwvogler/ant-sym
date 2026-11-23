import assert from "node:assert/strict";
import { test } from "node:test";
import { CORPSE_ROT, CURTAIN, OPEN, PLANE, centreX, centreY, moundRadius, type Colony, type WorldMap } from "../../colony/index.ts";
import { toScreen, type Camera, type Viewport } from "../camera.ts";
import { decayStage } from "../cadaverVisual.ts";
import { odourColour, odourRgb } from "../field/colour.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import { drawNest, type NestFrame } from "../field/nests.ts";
import { drawNestSprite, type NestSprite } from "../nestSprites.ts";
import { BROOD_RGB } from "../palette.ts";
import { buildGame } from "../useColony.ts";
import { RecordedCanvas, callsOf, recordingContext } from "./recordingContext.ts";

// The nests stage on a recording fake context (ja-fnd.6.3.14): each colony's mound ring, nest disc and entrance, brood, chamber food, dead, queen and
// alates, with their filters, sprites and fallbacks. The same function runs in Chromium; scripts/field-shots.mjs holds that the pixels are what the
// browser drew before it moved (above-nest*, below-nest*, the dark and phone scenes). The stubs are plain objects with only the fields the stage reads.

const THEME: FieldTheme = {
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
};

const V: Viewport = { w: 800, h: 600, dpr: 1 };
const C: Camera = { x: 50, y: 40, zoom: 10 };
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const sc = (wx: number, wy: number, c: Camera = C, v: Viewport = V) => toScreen(c, v, wx, wy).map(r3);
const NEST_COLOUR = odourColour(THEME.inkRgb, THEME.warnRgb, 0.25);

interface Over {
  lv?: number;
  d?: number;
  c?: Camera;
  m?: Record<string, unknown>;
  col?: Record<string, unknown>;
  f?: Partial<NestFrame>;
  /** the cadaver sprite set's answer: true when it drew the corpse itself */
  cadaver?: boolean;
}

function setup(o: Over = {}) {
  const rec = recordingContext();
  const nestImage = new RecordedCanvas(1, 1);
  const gets: string[] = [];
  const cadavers: string[] = [];
  const col = {
    layers: [{ nest: { x: 40, y: 30, r: 3 } }, { nest: { x: 45, y: 35, r: 2, entrance: { x: 47, y: 31 } } }],
    home: PLANE,
    soilOut: 0,
    nestOdour: 0.25,
    brood: { items: [] },
    params: { nest: 7 },
    corpses: [],
    time: 1000,
    queen: null,
    alates: [],
    ...o.col,
  } as unknown as Colony;
  const k = {
    ctx: rec.ctx,
    theme: THEME,
    d: o.d ?? 1,
    v: V,
    c: o.c ?? C,
    lv: o.lv ?? PLANE,
    m: { x0: 0, size: { w: 200, h: 200 }, rock: { get: () => OPEN }, ...o.m } as unknown as WorldMap,
    sprites: {
      nest: {
        get: (lod: string, colour?: readonly number[], dark?: boolean) => {
          gets.push(`${lod}|${colour?.join(",") ?? ""}|${dark ?? false}`);
          return nestImage;
        },
      },
      cadaver: {
        draw: (_ctx: unknown, lod: string, stage: number, x: number, y: number, zoom: number, heading?: number) => {
          cadavers.push(`${lod}|${stage}|${r3(x)},${r3(y)}|${zoom}|${heading}`);
          return o.cadaver ?? false;
        },
      },
    },
  } as unknown as FieldCtx;
  const f: NestFrame = {
    len: 10,
    inView: () => true,
    hexes: false,
    resourceLod: "tiny",
    darkSprites: false,
    nestImage: null,
    resourceImage: null,
    ...o.f,
  };
  return { k, f, col, log: rec.log, state: rec.state, nestImage, gets, cadavers };
}

/** The drawImage line `drawNestSprite` makes for a sprite: the oracle for which sprite, where and how big (it prints the sheet as canvas#n). */
function spriteCall(kind: NestSprite, image: RecordedCanvas, x: number, y: number, zoom = 10): string {
  const r = recordingContext();
  drawNestSprite(r.ctx, image as unknown as HTMLCanvasElement, "tiny", kind, x, y, zoom);
  return r.log[0]!;
}

/** Run the stage on a setup. */
const run = (s: ReturnType<typeof setup>) => drawNest(s.k, s.f, s.col);

test("a colony with nothing in it: its nest's ring on the shown layer in its odour, then the empty stroke of the dead", () => {
  const s = setup();
  assert.equal(run(s), null, "no alates: nothing to draw again later");
  const [nx, ny] = sc(40, 30);
  assert.deepEqual(s.log, [
    "beginPath()",
    `arc(${nx}, ${ny}, 30, 0, 6.283)`,
    `strokeStyle = ${NEST_COLOUR}`,
    "lineWidth = 2",
    "globalAlpha = 0.7",
    "stroke()",
    "globalAlpha = 1",
    "strokeStyle = #mound",
    "lineWidth = 1",
    "beginPath()",
    "stroke()",
  ]);
});

test("the ring is at least 4 pixels and the dead's lines are as thick as the device ratio; the nest of the shown layer is the one drawn", () => {
  const small = setup({ col: { layers: [{ nest: { x: 40, y: 30, r: 0.1 } }, { nest: { x: 45, y: 35, r: 2 } }] } });
  run(small);
  assert.ok(callsOf(small.log, "arc")[0]!.endsWith(", 4, 0, 6.283"), "r 0.1 at zoom 10 is 1 pixel: 4");
  const thick = setup({ d: 2 });
  run(thick);
  assert.ok(thick.log.includes("lineWidth = 1.6"), "0.8 of a device pixel at two device pixels: 1.6");
  const curtain = setup({ lv: CURTAIN });
  run(curtain);
  const [cx, cy] = sc(45, 35);
  assert.equal(callsOf(curtain.log, "arc")[0], `${cx}, ${cy}, 20, 0, 6.283`, "the curtain's nest, r 2");
  // a layer the colony has no nest on falls back to its first
  const none = setup({ lv: 5 });
  run(none);
  assert.equal(callsOf(none.log, "arc")[0]!.startsWith(`${sc(40, 30)[0]}, ${sc(40, 30)[1]}, `), true);
});

test("the entrance: a small ring on the ground line where the shaft comes up, drawn with the nest's stroke", () => {
  const s = setup({ lv: CURTAIN });
  run(s);
  const arcs = callsOf(s.log, "arc");
  const [ex, ey] = sc(47, 31);
  assert.equal(arcs[1], `${ex}, ${ey}, 15, 0, 6.283`, "1.5 cells at zoom 10");
  const at = s.log.indexOf(`arc(${ex}, ${ey}, 15, 0, 6.283)`);
  assert.deepEqual(s.log.slice(at - 1, at + 3), ["beginPath()", `arc(${ex}, ${ey}, 15, 0, 6.283)`, "stroke()", "globalAlpha = 1"]);
  const tiny = setup({ lv: CURTAIN, c: { x: 50, y: 40, zoom: 1 } });
  run(tiny);
  assert.ok(callsOf(tiny.log, "arc")[1]!.endsWith(", 3, 0, 6.283"), "at least 3 pixels");
});

test("the mound ring: on the side view's top-down mound only (soil out, no entrance, no plane spoil), a faint fill and an outline", () => {
  const s = setup({ col: { soilOut: 400 } });
  run(s);
  const [nx, ny] = sc(40, 30);
  const outer = r3(Math.max(30, moundRadius(400, 3) * 10));
  assert.ok(outer > 30);
  assert.deepEqual(s.log.slice(0, 15), [
    "beginPath()",
    `arc(${nx}, ${ny}, ${outer}, 0, 6.283)`,
    `arc(${nx}, ${ny}, 30, 0, 6.283, true)`,
    "fillStyle = #mound",
    "globalAlpha = 0.12",
    "fill()",
    "globalAlpha = 0.8",
    "beginPath()",
    `arc(${nx}, ${ny}, ${outer}, 0, 6.283)`,
    "strokeStyle = #mound",
    "lineWidth = 1.2",
    "stroke()",
    "globalAlpha = 1",
    "beginPath()",
    `arc(${nx}, ${ny}, 30, 0, 6.283)`,
  ]);
  const thick = setup({ col: { soilOut: 400 }, d: 2 });
  run(thick);
  assert.ok(thick.log.includes("lineWidth = 2.4"));
  for (const [what, over] of [
    ["no soil out", { col: { soilOut: 0 } }],
    ["the plane's spoil paints it as ground", { col: { soilOut: 400 }, m: { spoil: {} } }],
    ["an entrance: the one world's nest", { col: { soilOut: 400 }, lv: CURTAIN }],
  ] as const) {
    const n = setup(over);
    run(n);
    assert.equal(callsOf(n.log, "fill").length, 0, what);
  }
  // a pile no wider than the nest's disc (at least 4 pixels): the outer ring is the disc
  const flat = setup({ col: { soilOut: 1 }, c: { x: 50, y: 40, zoom: 1 } });
  run(flat);
  assert.deepEqual(callsOf(flat.log, "arc").slice(0, 2), [
    `${sc(40, 30, { x: 50, y: 40, zoom: 1 })[0]}, ${sc(40, 30, { x: 50, y: 40, zoom: 1 })[1]}, 4, 0, 6.283`,
    `${sc(40, 30, { x: 50, y: 40, zoom: 1 })[0]}, ${sc(40, 30, { x: 50, y: 40, zoom: 1 })[1]}, 4, 0, 6.283, true`,
  ]);
});

test("the brood: a sprite each by stage, or a square in the stage's colour; held, away from home and out of view are not drawn", () => {
  const items = [
    { x: 44, y: 30, stage: 0, held: -1 },
    { x: 45, y: 31, stage: 1, held: -1 },
    { x: 46, y: 32, stage: 2, held: -1 },
    { x: 47, y: 33, stage: 0, held: 3 },
    { x: 49, y: 31, stage: 2, held: 0 },
    { x: 48, y: 34, stage: 1, held: -1 },
  ];
  const col = { brood: { items } };
  const inView = (_wx: number, wy: number) => wy < centreY(34) - 0.01;
  const sq = setup({ col, f: { inView } });
  run(sq);
  const fills = sq.log.filter((l) => l.startsWith("fillRect("));
  const bd = 4; // len 10 * 0.4
  const expected = items
    .filter((b) => b.held < 0 && b.y < 34)
    .map((b) => {
      const [x, y] = sc(centreX(b.x, b.y), centreY(b.y));
      return { colour: BROOD_RGB[b.stage], rect: `fillRect(${r3(x - bd / 2)}, ${r3(y - bd / 2)}, ${bd}, ${bd})` };
    });
  assert.deepEqual(
    fills,
    expected.map((e) => e.rect),
  );
  for (const [i, e] of expected.entries()) {
    const at = sq.log.indexOf(e.rect, i === 0 ? 0 : sq.log.indexOf(expected[i - 1]!.rect) + 1);
    assert.equal(sq.log[at - 1], `fillStyle = ${e.colour}`);
  }
  const sheet = new RecordedCanvas(1, 1);
  const sp = setup({ col, f: { inView, nestImage: sheet as unknown as HTMLCanvasElement } });
  run(sp);
  assert.equal(callsOf(sp.log, "fillRect").length, 0);
  assert.deepEqual(
    sp.log.filter((l) => l.startsWith("drawImage(")),
    items
      .filter((b) => b.held < 0 && b.y < 34)
      .map((b) => {
        const [x, y] = sc(centreX(b.x, b.y), centreY(b.y));
        return spriteCall(`brood-${b.stage}` as NestSprite, sheet, x!, y!);
      }),
    "the sprite of each one's stage, where it lies",
  );
  // a small worker: the squares are at least a pixel and a half
  const tiny = setup({ col, f: { inView, len: 2 } });
  run(tiny);
  assert.ok(callsOf(tiny.log, "fillRect")[0]!.endsWith(", 1.5, 1.5)".slice(0, -1)), "1.5 wide");
  const away = setup({ col: { ...col, home: CURTAIN }, f: { inView } });
  run(away);
  assert.equal(callsOf(away.log, "fillRect").length, 0, "the brood lies in the nest's home layer only");
  const none = setup({ col, f: { inView: () => false } });
  run(none);
  assert.equal(callsOf(none.log, "fillRect").length, 0);
});

test("the chamber stores: seeds along each floor of this colony's chambers, a sprite or a square, only at home, only where a chamber has food", () => {
  const ch = (o: Record<string, unknown>) => ({ id: 1, colony: 7, food: 3, cells: 10, floorRow: 5, x0: 20, x1: 21, ...o });
  // chamber 1's floor is row 5 (row 4 is not in it); the others' floors are on rows 7 and 9: seeds of theirs would show
  const list = [
    ch({}),
    ch({ id: 2, colony: 8, floorRow: 7 }),
    ch({ id: 3, food: 0.5, floorRow: 9 }),
    ch({ id: 4, cells: 0, floorRow: 11 }),
    ch({ id: 5, food: 1, floorRow: 13 }),
  ];
  const chambers = { list, at: (_x: number, y: number) => ({ 5: 1, 4: 1, 7: 2, 9: 3, 11: 4, 13: 5 })[y] ?? 0 };
  const bd = 4;
  const square = ([x, y]: number[]) => {
    const [sx, sy] = sc(centreX(x!, y!), centreY(y!));
    return `fillRect(${r3(sx! - bd / 2)}, ${r3(sy! - bd / 2)}, ${bd}, ${bd})`;
  };
  // chamber 1's seeds go over its floor and the row above it, where it owns the cell; here the row above is nobody's, so it is skipped
  const floorOnly = { ...chambers, at: (x: number, y: number) => (y === 4 ? 0 : chambers.at(x, y)) };
  const sq = setup({ m: { chambers: floorOnly } });
  run(sq);
  assert.deepEqual(
    sq.log.filter((l) => l.startsWith("fillRect(")),
    [
      [20, 5],
      [21, 5],
      [20, 5],
      [20, 13],
    ].map(square),
    "three seeds of food 3 along the floor (not the row above it), one of food 1; not the other colony's, the 0.5, the empty",
  );
  const at = sq.log.indexOf(square([20, 5]));
  assert.equal(sq.log[at - 1], "fillStyle = #accent");
  const sheet = new RecordedCanvas(1, 1);
  const sp = setup({ m: { chambers: floorOnly }, f: { resourceImage: sheet as unknown as HTMLCanvasElement } });
  run(sp);
  assert.equal(callsOf(sp.log, "fillRect").length, 0);
  assert.equal(callsOf(sp.log, "drawImage").length, 4, "a resource sprite each");
  assert.ok(callsOf(sp.log, "drawImage").every((a) => a.startsWith(`${sheet}, `)));
  // a cell that is rock holds no seed
  const rocky = setup({ m: { chambers: floorOnly, rock: { get: (x: number) => (x === 20 ? 1 : OPEN) } } });
  run(rocky);
  assert.deepEqual(
    callsOf(rocky.log, "fillRect"),
    [
      [21, 5],
      [21, 5],
      [21, 5],
      [21, 13],
    ].map((c) => square(c as [number, number]).slice(9, -1)),
    "only the open column",
  );
  const away = setup({ col: { home: CURTAIN }, m: { chambers } });
  run(away);
  assert.equal(callsOf(away.log, "fillRect").length, 0);
  const none = setup({ m: { chambers }, f: { inView: () => false } });
  run(none);
  assert.equal(callsOf(none.log, "fillRect").length, 0);
});

test("the dead: a cross each in the mound colour, a cadaver sprite or the nest's rotated one where it can; held, other layers and out of view are not drawn", () => {
  const died = 1000 - 0.6 * CORPSE_ROT;
  const dead = (o: Record<string, unknown>) => ({ x: 44, y: 30, held: -1, died, layer: PLANE, heading: 0.5, ...o });
  const corpses = [dead({}), dead({ x: 45, held: 2 }), dead({ x: 46, layer: CURTAIN }), dead({ x: 47, y: 32, layer: undefined })];
  const sq = setup({ col: { corpses } });
  run(sq);
  const bd = 4;
  const at2 = [sc(centreX(44, 30), centreY(30)), sc(centreX(47, 32), centreY(32))];
  assert.deepEqual(
    callsOf(sq.log, "moveTo"),
    at2.flatMap(([x, y]) => [`${r3(x! - bd)}, ${r3(y! - bd)}`, `${r3(x! + bd)}, ${r3(y! - bd)}`]),
    "a cross for the one on this layer and the one with no layer (home: the plane)",
  );
  assert.deepEqual(
    callsOf(sq.log, "lineTo"),
    at2.flatMap(([x, y]) => [`${r3(x! + bd)}, ${r3(y! + bd)}`, `${r3(x! - bd)}, ${r3(y! + bd)}`]),
  );
  assert.equal(callsOf(sq.log, "stroke").length, 2, "the nest's ring, and one stroke for all the crosses, at the end");
  assert.equal(sq.log.at(-1), "stroke()");
  assert.equal(sq.cadavers.length, 2);
  assert.equal(sq.cadavers[0]!.split("|")[1], "2", "the decay stage from its age: past half the time to rot");
  assert.equal(decayStage(1000, died), 2);
  assert.ok(sq.cadavers[0]!.endsWith("|10|0.5"), "at the zoom, with its heading");
  // the cadaver sprite set draws it: no cross
  const sprite = setup({ col: { corpses }, cadaver: true });
  run(sprite);
  assert.equal(callsOf(sprite.log, "moveTo").length, 0);
  // the nest's own sprite, turned to its heading
  const img = new RecordedCanvas(1, 1);
  const nest = setup({ col: { corpses }, f: { nestImage: img as unknown as HTMLCanvasElement } });
  run(nest);
  const [x, y] = sc(centreX(44, 30), centreY(30));
  const at = nest.log.indexOf("save()");
  assert.deepEqual(nest.log.slice(at, at + 3), ["save()", `translate(${x}, ${y})`, "rotate(0.5)"]);
  assert.ok(nest.log[at + 3]!.startsWith(`drawImage(${img}, `) && nest.log[at + 4] === "restore()");
  assert.equal(callsOf(nest.log, "moveTo").length, 0);
  const unset = setup({ col: { corpses: [dead({ heading: undefined })] }, f: { nestImage: img as unknown as HTMLCanvasElement } });
  run(unset);
  assert.ok(unset.log.includes("rotate(0)"), "no heading: 0");
  // out of view and rotted away
  const none = setup({ col: { corpses }, f: { inView: () => false } });
  run(none);
  assert.equal(none.cadavers.length, 0);
  const rotted = setup({ col: { corpses: [dead({ died: -1e9 })] } });
  run(rotted);
  assert.equal(rotted.cadavers.length, 0, "long gone");
});

test("the queen: a sprite in her colony's tint (hexes), alive or dead; else a filled ellipse, or a hollow one crossed out; only at home and in view", () => {
  const queen = (alive: boolean) => ({ queen: { x: 42, y: 31, alive } });
  const [x, y] = sc(42, 31);
  const qr = 9; // len 10 * 0.9
  const alive = setup({ col: queen(true) });
  run(alive);
  assert.deepEqual(alive.log.slice(-5), [
    "beginPath()",
    `ellipse(${x}, ${y}, ${r3(qr * 1.4)}, ${r3(qr * 0.8)}, 0, 0, 6.283)`,
    "lineWidth = 1",
    `fillStyle = ${NEST_COLOUR}`,
    "fill()",
  ]);
  assert.equal(callsOf(alive.log, "ellipse").length, 1);
  const dead = setup({ col: queen(false) });
  run(dead);
  const at = dead.log.indexOf(`ellipse(${x}, ${y}, ${r3(qr * 1.4)}, ${r3(qr * 0.8)}, 0, 0, 6.283)`);
  assert.deepEqual(dead.log.slice(at + 1), [
    "lineWidth = 1",
    `strokeStyle = ${NEST_COLOUR}`,
    "globalAlpha = 0.6",
    "stroke()",
    "beginPath()",
    `moveTo(${r3(x - qr * 1.4)}, ${r3(y - qr)})`,
    `lineTo(${r3(x + qr * 1.4)}, ${r3(y + qr)})`,
    "stroke()",
    "globalAlpha = 1",
  ]);
  const thick = setup({ col: queen(true), d: 2 });
  run(thick);
  assert.ok(thick.log.includes("lineWidth = 2"), "a device pixel wide");
  // sprites: asked for in her colony's odour (and the ground's darkness), at the level of detail
  const img = new RecordedCanvas(1, 1);
  for (const [isAlive, name] of [
    [true, "queen"],
    [false, "queen-dead"],
  ] as const) {
    const sp = setup({ col: queen(isAlive), f: { hexes: true, darkSprites: true, nestImage: img as unknown as HTMLCanvasElement } });
    run(sp);
    const t = odourRgb(THEME.inkRgb, THEME.warnRgb, 0.25);
    assert.deepEqual(sp.gets, [`tiny|${t.join(",")}|true`]);
    assert.equal(callsOf(sp.log, "ellipse").length, 0);
    assert.deepEqual(
      sp.log.filter((l) => l.startsWith("drawImage(")),
      [spriteCall(name, sp.nestImage, x!, y!)],
      `the ${name} sprite, at her place`,
    );
  }
  const lit = setup({ col: queen(true), f: { hexes: true } });
  run(lit);
  assert.ok(lit.gets[0]!.endsWith("|false"));
  // no hexes: the sprite is not asked for
  const flat = setup({ col: queen(true), f: { hexes: false } });
  run(flat);
  assert.deepEqual(flat.gets, []);
  // away from home, out of view, no queen
  for (const over of [
    { col: { ...queen(true), home: CURTAIN } },
    { col: queen(true), f: { inView: () => false } },
    { col: { queen: null } },
  ]) {
    const n = setup(over);
    run(n);
    assert.equal(callsOf(n.log, "ellipse").length, 0);
  }
});

test("the alates: drawn now and handed back to be drawn again over the fungus; a sprite pair or ellipses with wings, a spore dot when loaded; only at home and in view", () => {
  const alates = [
    { x: 43, y: 31, load: 0 },
    { x: 44, y: 32, load: 2 },
  ];
  const s = setup({ col: { alates } });
  const again = run(s);
  assert.equal(typeof again, "function");
  const [x0, y0] = sc(43, 31);
  const ar = 7; // len 10 * 0.7
  const first = s.log.slice(s.log.indexOf(`ellipse(${x0}, ${y0}, ${r3(ar * 1.3)}, ${r3(ar * 0.7)}, 0, 0, 6.283)`) - 1);
  assert.deepEqual(first.slice(0, 11), [
    "beginPath()",
    `ellipse(${x0}, ${y0}, ${r3(ar * 1.3)}, ${r3(ar * 0.7)}, 0, 0, 6.283)`,
    `fillStyle = ${NEST_COLOUR}`,
    "fill()",
    "beginPath()",
    `ellipse(${r3(x0 - ar * 0.6)}, ${r3(y0 - ar * 0.9)}, ${r3(ar * 0.9)}, ${r3(ar * 0.4)}, -0.5, 0, 6.283)`,
    `ellipse(${r3(x0 + ar * 0.6)}, ${r3(y0 - ar * 0.9)}, ${r3(ar * 0.9)}, ${r3(ar * 0.4)}, 0.5, 0, 6.283)`,
    "globalAlpha = 0.5",
    "fillStyle = #paper",
    "fill()",
    "globalAlpha = 1",
  ]);
  assert.equal(callsOf(s.log, "arc").length, 2, "the nest's ring and one spore dot (the loaded one)");
  const [x1, y1] = sc(44, 32);
  assert.ok(s.log.includes(`arc(${x1}, ${y1}, ${r3(Math.max(1.5, ar * 0.45))}, 0, 6.283)`));
  const at = s.log.indexOf(`arc(${x1}, ${y1}, ${r3(Math.max(1.5, ar * 0.45))}, 0, 6.283)`);
  assert.deepEqual(s.log.slice(at + 1, at + 3), ["fillStyle = #spore", "fill()"]);
  // drawn again: the same calls, the same canvas state
  const mark = s.log.length;
  again!();
  assert.deepEqual(s.log.slice(mark), s.log.slice(mark - (s.log.length - mark), mark), "drawing them again repeats them");
  // sprites: wings, then body, per alate
  const img = new RecordedCanvas(1, 1);
  const sp = setup({ col: { alates }, f: { hexes: true, nestImage: img as unknown as HTMLCanvasElement } });
  run(sp);
  assert.equal(sp.gets.length, 2, "asked for each alate, in her colony's tint");
  assert.equal(callsOf(sp.log, "ellipse").length, 0);
  assert.deepEqual(
    sp.log.filter((l) => l.startsWith("drawImage(")),
    [sc(43, 31), sc(44, 32)].flatMap(([x, y]) => [
      spriteCall("alate-wings", sp.nestImage, x!, y!),
      spriteCall("alate-body", sp.nestImage, x!, y!),
    ]),
    "wings, then body, for each",
  );
  // a small worker: the alate is at least two and a half pixels
  const small = setup({ col: { alates: [alates[0]] }, f: { len: 2 } });
  run(small);
  assert.equal(callsOf(small.log, "ellipse")[0]!.split(", ")[2], "3.25", "2.5 * 1.3");
  const flat = setup({ col: { alates }, f: { hexes: false } });
  run(flat);
  assert.deepEqual(flat.gets, []);
  // none, away from home, out of view
  assert.equal(run(setup({ col: { alates: [] } })), null);
  for (const over of [{ col: { alates, home: CURTAIN } }, { col: { alates }, f: { inView: () => false } }]) {
    const n = setup(over);
    assert.equal(typeof run(n), "function", "the overlay is still handed back (it checks again when drawn)");
    assert.equal(callsOf(n.log, "ellipse").length, 0);
  }
});

test("on a real world: each colony's nest, last colony first, finite numbers throughout, one ring a colony", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 40, rival: true, generation: 0 });
  for (let t = 0; t < 600; t++) g.tick(1 / 30);
  for (const lv of [PLANE, CURTAIN]) {
    const map = lv === PLANE ? g.world.plane : g.world.curtain;
    const rec = recordingContext();
    const k = {
      ctx: rec.ctx,
      theme: THEME,
      d: 1,
      v: V,
      c: { x: g.colonies[0]!.layers[lv]!.nest.x, y: g.colonies[0]!.layers[lv]!.nest.y, zoom: 12 },
      lv,
      m: map,
      sprites: { nest: { get: () => null }, cadaver: { draw: () => false } },
    } as unknown as FieldCtx;
    const f: NestFrame = {
      len: 10,
      inView: () => true,
      hexes: false,
      resourceLod: "tiny",
      darkSprites: false,
      nestImage: null,
      resourceImage: null,
    };
    for (const col of [...g.colonies].reverse()) drawNest(k, f, col);
    assert.ok(callsOf(rec.log, "arc").length >= g.colonies.length, `a ring each on layer ${lv}`);
  }
});
