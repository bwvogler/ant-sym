import assert from "node:assert/strict";
import { test } from "node:test";
import { CURTAIN, OPEN, PLANE, centreX, centreY, type Colony, type WorldMap } from "../../colony/index.ts";
import { toScreen } from "../camera.ts";
import { odourColour } from "../field/colour.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import { drawNest, type NestFrame } from "../field/nests.ts";
import { BROOD_RGB } from "../palette.ts";
import { recordingContext } from "./recordingContext.ts";

// The nests stage on a recording fake context (ja-fnd.6.3.14): what a colony's nest draws on the shown layer, from hand-built colonies, so each
// expectation is the arithmetic of the screen point and the colony's own numbers, never the stage's. scripts/field-shots.mjs (the nest scenes) holds
// that the browser draws the same pixels.

const THEME = {
  paper: "#paper",
  ink: "#ink",
  accent: "#accent",
  warn: "#warn",
  mound: "#mound",
  spore: "#spore",
  inkRgb: [10, 20, 30],
  warnRgb: [200, 100, 50],
} as unknown as FieldTheme;

const V = { w: 800, h: 600, dpr: 1 };
const CAM = { x: 50, y: 40, zoom: 20 };
const LEN = 6;
const BD = Math.max(1.5, LEN * 0.4);
const screen = (wx: number, wy: number) => toScreen(CAM, V, wx, wy);
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

interface Opts {
  home?: number;
  soilOut?: number;
  entrance?: { x: number; y: number } | null;
  odour?: number;
  brood?: { x: number; y: number; stage: number; held?: number }[];
  corpses?: { x: number; y: number; held?: number; died?: number; layer?: number; heading?: number }[];
  queen?: { x: number; y: number; alive: boolean } | null;
  alates?: { x: number; y: number; load: number }[];
  chambers?: { colony: number; food: number; cells: number; floorRow: number; x0: number; x1: number; id: number }[];
  lv?: number;
  spoil?: boolean;
  inView?: (x: number, y: number) => boolean;
  cadaverDraws?: boolean;
  zoom?: number;
}

function setup(o: Opts = {}) {
  const nest = { x: 52, y: 41, r: 1.5, ...(o.entrance === undefined ? {} : { entrance: o.entrance }) };
  const col = {
    layers: [{ nest }, { nest }],
    home: o.home ?? CURTAIN,
    soilOut: o.soilOut ?? 0,
    nestOdour: o.odour ?? 0.25,
    time: 100,
    params: { nest: 0 },
    brood: { items: (o.brood ?? []).map((b) => ({ held: -1, ...b })) },
    corpses: (o.corpses ?? []).map((k) => ({ held: -1, died: 99, ...k })),
    queen: o.queen === undefined ? null : o.queen,
    alates: o.alates ?? [],
  } as unknown as Colony;
  const rec = recordingContext();
  const chambers = o.chambers ? { list: o.chambers, at: () => (o.chambers ?? [])[0]!.id } : undefined;
  const m = {
    x0: 0,
    size: { w: 200, h: 200 },
    rock: { get: () => OPEN },
    chambers,
    spoil: o.spoil ? {} : undefined,
  } as unknown as WorldMap;
  const drawn: string[] = [];
  const fc = {
    ctx: rec.ctx,
    theme: THEME,
    d: 1,
    v: V,
    c: { ...CAM, zoom: o.zoom ?? CAM.zoom },
    lv: o.lv ?? CURTAIN,
    m,
    sprites: {
      cadaver: { draw: () => !!o.cadaverDraws && (drawn.push("cadaver"), true) },
      nest: { get: () => null },
    },
  } as unknown as FieldCtx;
  const f: NestFrame = {
    len: LEN,
    inView: o.inView ?? (() => true),
    hexes: false,
    resourceLod: "tiny",
    darkSprites: false,
    nestImage: null,
    resourceImage: null,
  };
  return { col, fc, f, rec, drawn };
}

test("a nest is a ring at its screen point, at least 4 px, in its odour's tone, faint; an entrance (the side view) adds a small ring", () => {
  const s = setup({ odour: 0.25 });
  const out = drawNest(s.fc, s.f, s.col);
  const [x, y] = screen(52, 41);
  const tone = odourColour([10, 20, 30], [200, 100, 50], 0.25);
  assert.deepEqual(s.rec.log, [
    "beginPath()",
    `arc(${fmt(x)}, ${fmt(y)}, ${fmt(1.5 * CAM.zoom)}, 0, 6.283)`,
    `strokeStyle = ${tone}`,
    "lineWidth = 2",
    "globalAlpha = 0.7",
    "stroke()",
    "globalAlpha = 1",
    "strokeStyle = #mound",
    "lineWidth = 1",
    "beginPath()",
    "stroke()",
  ]);
  assert.equal(out, null, "no alates, no overlay");

  const small = setup();
  small.col.layers[CURTAIN]!.nest.r = 0.1;
  drawNest(small.fc, small.f, small.col);
  assert.ok(small.rec.log.includes(`arc(${fmt(x)}, ${fmt(y)}, 4, 0, 6.283)`), "at least 4 px");

  const far = setup({ entrance: { x: 52, y: 30 }, zoom: 1 });
  drawNest(far.fc, far.f, far.col);
  const [fx, fy] = toScreen({ ...CAM, zoom: 1 }, V, 52, 30);
  assert.ok(far.rec.log.includes(`arc(${fmt(fx)}, ${fmt(fy)}, 3, 0, 6.283)`), "the entrance's ring is at least 3 px");

  const e = setup({ entrance: { x: 52, y: 30 } });
  drawNest(e.fc, e.f, e.col);
  const [ex, ey] = screen(52, 30);
  assert.ok(e.rec.log.includes(`arc(${fmt(ex)}, ${fmt(ey)}, ${fmt(Math.max(3, 1.5 * CAM.zoom))}, 0, 6.283)`), "the entrance's ring");
});

test("the mound's ring shows only where soil was brought out, on a map with no spoil of its own and a nest with no entrance", () => {
  const ring = (o: Opts) => {
    const s = setup(o);
    drawNest(s.fc, s.f, s.col);
    return s.rec.log.filter((l) => l.startsWith("arc(")).length;
  };
  assert.equal(ring({ soilOut: 0 }), 1, "nothing out: the nest's ring only");
  assert.equal(ring({ soilOut: 30 }), 4, "the mound's fill (two arcs) and outline, and the nest's ring");
  assert.equal(ring({ soilOut: 30, spoil: true }), 1, "one world's mound is its plane's spoil, painted as ground");
  assert.equal(ring({ soilOut: 30, entrance: { x: 52, y: 30 } }), 2, "the entrance's ring, not the mound's");
});

test("the brood draws where it lies, at home only, a square a stage's colour; the held and the out of view are left out", () => {
  const items = [
    { x: 50, y: 40, stage: 0 },
    { x: 51, y: 40, stage: 1 },
    { x: 52, y: 40, stage: 2 },
    { x: 53, y: 40, stage: 0, held: 3 },
    { x: 54, y: 40, stage: 0 },
  ];
  const s = setup({ brood: items, inView: (wx) => wx < centreX(54, 40) - 0.01 });
  drawNest(s.fc, s.f, s.col);
  const want: string[] = [];
  for (const b of items.slice(0, 3)) {
    const [x, y] = screen(centreX(b.x, b.y), centreY(b.y));
    want.push(`fillStyle = ${BROOD_RGB[b.stage]}`, `fillRect(${fmt(x - BD / 2)}, ${fmt(y - BD / 2)}, ${fmt(BD)}, ${fmt(BD)})`);
  }
  assert.deepEqual(
    s.rec.log.filter((l) => l.startsWith("fillStyle = #") || l.startsWith("fillRect(")),
    want,
  );
  const away = setup({ brood: items, lv: PLANE, home: CURTAIN });
  drawNest(away.fc, away.f, away.col);
  assert.equal(away.rec.log.filter((l) => l.startsWith("fillRect(")).length, 0, "the brood is underground, not on the plane");
});

test("food lying in a colony's chambers shows as seeds along the floor, a seed to a unit up to 40, for this colony's chambers that hold food", () => {
  const chamber = { colony: 0, food: 3, cells: 4, floorRow: 20, x0: 10, x1: 11, id: 1 };
  const seeds = (o: Opts) => {
    const s = setup(o);
    drawNest(s.fc, s.f, s.col);
    return s.rec.log.filter((l) => l.startsWith("fillRect(")).length;
  };
  assert.equal(seeds({ chambers: [chamber] }), 3);
  assert.equal(seeds({ chambers: [{ ...chamber, food: 100 }] }), 40, "40 at most");
  assert.equal(seeds({ chambers: [{ ...chamber, food: 0.5 }] }), 0, "under a unit: none");
  assert.equal(seeds({ chambers: [{ ...chamber, colony: 1 }] }), 0, "another colony's chamber");
  assert.equal(seeds({ chambers: [{ ...chamber, cells: 0 }] }), 0, "a chamber not yet dug");
  assert.equal(seeds({ chambers: [chamber], lv: PLANE, home: CURTAIN }), 0, "not at home");
  const s = setup({ chambers: [chamber] });
  drawNest(s.fc, s.f, s.col);
  assert.ok(s.rec.log.includes("fillStyle = #accent"), "in the accent");
});

test("the dead lie as grey crosses, where they lie on this layer; a held one, one of the other layer and an out of view one are left out; a sprite takes a corpse's place", () => {
  const dead = [
    { x: 50, y: 40 },
    { x: 51, y: 40, held: 2 },
    { x: 52, y: 40, layer: PLANE },
    { x: 53, y: 40, layer: CURTAIN },
  ];
  const s = setup({ corpses: dead, home: CURTAIN });
  drawNest(s.fc, s.f, s.col);
  const cross = (k: { x: number; y: number }) => {
    const [x, y] = screen(centreX(k.x, k.y), centreY(k.y));
    return [
      `moveTo(${fmt(x - BD)}, ${fmt(y - BD)})`,
      `lineTo(${fmt(x + BD)}, ${fmt(y + BD)})`,
      `moveTo(${fmt(x + BD)}, ${fmt(y - BD)})`,
      `lineTo(${fmt(x - BD)}, ${fmt(y + BD)})`,
    ];
  };
  const strokes = s.rec.log.filter((l) => /^(moveTo|lineTo)\(/.test(l));
  assert.deepEqual(strokes, [...cross(dead[0]!), ...cross(dead[3]!)]);
  assert.ok(s.rec.log.includes("strokeStyle = #mound"));

  const sprite = setup({ corpses: dead, home: CURTAIN, cadaverDraws: true });
  drawNest(sprite.fc, sprite.f, sprite.col);
  assert.deepEqual(sprite.drawn, ["cadaver", "cadaver"], "the sprite set is asked for each visible corpse");
  assert.deepEqual(
    sprite.rec.log.filter((l) => /^(moveTo|lineTo)\(/.test(l)),
    [],
    "and when it draws one, no cross",
  );

  const old = setup({ corpses: [{ x: 50, y: 40, died: -10000 }] });
  drawNest(old.fc, old.f, old.col);
  assert.equal(old.rec.log.filter((l) => l.startsWith("moveTo(")).length, 0, "long rotted away");
});

test("the queen is an ellipse in her colony's tone, filled alive; dead, hollow and crossed out; only at home and in view", () => {
  const alive = setup({ queen: { x: 51, y: 41, alive: true }, odour: 0.5 });
  drawNest(alive.fc, alive.f, alive.col);
  const [x, y] = screen(51, 41);
  const qr = Math.max(3, LEN * 0.9);
  const tone = odourColour([10, 20, 30], [200, 100, 50], 0.5);
  const at = alive.rec.log.findIndex((l) => l.startsWith("ellipse("));
  assert.deepEqual(alive.rec.log.slice(at - 1), [
    "beginPath()",
    `ellipse(${fmt(x)}, ${fmt(y)}, ${fmt(qr * 1.4)}, ${fmt(qr * 0.8)}, 0, 0, 6.283)`,
    "lineWidth = 1",
    `fillStyle = ${tone}`,
    "fill()",
  ]);

  const dead = setup({ queen: { x: 51, y: 41, alive: false }, odour: 0.5 });
  drawNest(dead.fc, dead.f, dead.col);
  const tail = dead.rec.log.slice(dead.rec.log.findIndex((l) => l.startsWith("ellipse(")));
  assert.ok(tail.includes(`strokeStyle = ${tone}`) && tail.includes("globalAlpha = 0.6"), "hollow and faint");
  assert.ok(
    tail.includes(`moveTo(${fmt(x - qr * 1.4)}, ${fmt(y - qr)})`) && tail.includes(`lineTo(${fmt(x + qr * 1.4)}, ${fmt(y + qr)})`),
    "crossed out",
  );
  assert.ok(!tail.includes(`fillStyle = ${tone}`) && !tail.includes("fill()"), "not filled");
  assert.equal(tail.at(-1), "globalAlpha = 1");

  const away = setup({ queen: { x: 51, y: 41, alive: true }, lv: PLANE });
  drawNest(away.fc, away.f, away.col);
  assert.equal(away.rec.log.filter((l) => l.startsWith("ellipse(")).length, 0, "not on the plane");
  const hidden = setup({ queen: { x: 51, y: 41, alive: true }, inView: () => false });
  drawNest(hidden.fc, hidden.f, hidden.col);
  assert.equal(hidden.rec.log.filter((l) => l.startsWith("ellipse(")).length, 0, "not out of view");
});

test("alates draw at once and the stage hands back the drawer to draw them again over the ants; one carrying the fungus has a spore dot; none, no drawer", () => {
  const s = setup({
    alates: [
      { x: 50, y: 40, load: 0 },
      { x: 51, y: 40, load: 2 },
    ],
  });
  const out = drawNest(s.fc, s.f, s.col);
  assert.equal(typeof out, "function");
  const first = [...s.rec.log];
  const ar = Math.max(2.5, LEN * 0.7);
  const bodies = first.filter((l) => l.startsWith("ellipse(") && l.includes(`${fmt(ar * 1.3)}, ${fmt(ar * 0.7)}`));
  assert.equal(bodies.length, 2, "a body each");
  assert.equal(first.filter((l) => l === "fillStyle = #spore").length, 1, "one with the fungus in her");
  assert.equal(first.filter((l) => l === "globalAlpha = 0.5").length, 2, "wings, faint");
  assert.ok(first.includes("fillStyle = #paper"), "the wings are paper");
  const base = setup();
  drawNest(base.fc, base.f, base.col);
  const alatesDrawn = first.slice(base.rec.log.length);
  assert.ok(alatesDrawn.length > 0);
  s.rec.log.length = 0;
  out!();
  assert.deepEqual(s.rec.log, alatesDrawn, "the drawer draws what the first call drew");

  const none = setup();
  assert.equal(drawNest(none.fc, none.f, none.col), null);
  const hidden = setup({ alates: [{ x: 50, y: 40, load: 0 }], inView: () => false });
  drawNest(hidden.fc, hidden.f, hidden.col);
  assert.equal(hidden.rec.log.filter((l) => l.startsWith("ellipse(")).length, 0, "not out of view");
  const away = setup({ alates: [{ x: 50, y: 40, load: 0 }], lv: PLANE });
  drawNest(away.fc, away.f, away.col);
  assert.equal(away.rec.log.filter((l) => l.startsWith("ellipse(")).length, 0, "alates live at home");
});
