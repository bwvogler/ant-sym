import assert from "node:assert/strict";
import { test } from "node:test";
import { CELL, CURTAIN, PLANE, STRIP, cellAt, centreX, centreY, turnAt, type Fungus, type Game } from "../../colony/index.ts";
import { badgeParts, nestBadge } from "../badges.ts";
import type { Camera, Viewport } from "../camera.ts";
import { toScreen } from "../camera.ts";
import { odourColour } from "../field/colour.ts";
import type { FieldCtx, FieldInputs, FieldPen, FieldTheme } from "../field/ctx.ts";
import type { FieldEnv, SpriteSets } from "../field/env.ts";
import { drawBends, drawHoleNames, drawLine, drawPen, drawStripAnts, label, pill } from "../field/overlays.ts";
import { buildGame } from "../useColony.ts";
import { callsOf, recordingContext } from "./recordingContext.ts";

// The overlay layers on a recording fake context (ja-fnd.6.3.5): what each draws, in order, with its colours, its filters and its alpha. The same
// functions run in Chromium; scripts/field-shots.mjs holds that the pixels are still what the browser draws (above-nest0, built-bend, built-strip...).

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
const SHOW = { food: true, home: true };

/** The overlays use neither the clock, a path nor a sprite; a layer that does gets a fake from its own test. */
const NO_ENV = {} as FieldEnv;
const NO_SPRITES = {} as SpriteSets;

/** A game of seed 3 with two colonies, stepped a while so ants are out; `third`: a colony beyond the line's far end, so the line has a bend. */
function world(third: boolean): Game {
  const g = buildGame({ species: "generic", seed: 3, antCount: 40, rival: true, generation: 0 });
  if (third) assert.ok(g.tryFoundBeyond("end").ok);
  for (let t = 0; t < 600; t++) g.tick(1 / 30);
  return g;
}

function field(g: Game, lv: number, c: Camera, over: Partial<FieldCtx> = {}) {
  const rec = recordingContext();
  const m = lv === PLANE ? g.world.plane : g.world.curtain;
  const k: FieldCtx = {
    ctx: rec.ctx,
    theme: THEME,
    d: 1,
    v: V,
    c,
    lv,
    m,
    ext: { x0: m.x0, w: m.size.w, h: m.size.h },
    world: g.world,
    colonies: g.colonies,
    fungus: g.fungus,
    env: NO_ENV,
    sprites: NO_SPRITES,
    smellAll: false,
    strip: false,
    trails: [],
    alarms: [],
    spores: {} as FieldCtx["spores"],
    sensedLayer: null,
    sensedNow: 0,
    ...over,
  };
  return { k, ...rec };
}

const here = (g: Game): Camera => {
  const h = g.world.line.holes[0]!;
  return { x: centreX(h.x, h.y), y: centreY(h.y), zoom: 12 };
};

test("pill: parts side by side in a rounded box in the page's paper and line colours, each part in its own fill", () => {
  const { k, log, state } = field(world(false), PLANE, { x: 0, y: 0, zoom: 1 });
  pill(
    k,
    [
      { text: "A", fill: "#a" },
      { text: "BC", fill: "#b" },
    ],
    100,
    50,
    10,
  );
  // widths 5 and 10 (half the font size a character); gap 4.5; width 5 + 10 + 4.5 + 10, height 16
  assert.deepEqual(log, [
    "font = 600 10px ui-sans-serif, system-ui, sans-serif",
    "measureText(A)",
    "measureText(BC)",
    "globalAlpha = 0.92",
    "fillStyle = #paper",
    "strokeStyle = #line",
    "lineWidth = 1",
    "beginPath()",
    "roundRect(85.25, 42, 29.5, 16, 8)",
    "fill()",
    "stroke()",
    "globalAlpha = 1",
    "textBaseline = middle",
    "textAlign = start",
    "fillStyle = #a",
    "fillText(A, 90.25, 50)",
    "fillStyle = #b",
    "fillText(BC, 99.75, 50)",
    "textBaseline = alphabetic",
  ]);
  assert.equal(state.globalAlpha, 1);
});

test("label: text with a paper halo, then the text; the halo's line width grows with the size; the join it leaves behind is round", () => {
  const { k, log, state } = field(world(false), PLANE, { x: 0, y: 0, zoom: 1 });
  label(k, "hole", 30, 40, 12);
  assert.deepEqual(log, [
    "font = 600 12px ui-sans-serif, system-ui, sans-serif",
    "textAlign = center",
    "textBaseline = middle",
    "lineJoin = round",
    "lineWidth = 3",
    "strokeStyle = #paper",
    "globalAlpha = 0.85",
    "strokeText(hole, 30, 40)",
    "globalAlpha = 1",
    "fillStyle = #ink",
    "fillText(hole, 30, 40)",
    "globalAlpha = 1",
    "textAlign = start",
    "textBaseline = alphabetic",
  ]);
  assert.equal(
    state.lineJoin,
    "round",
    "the join stays set to the end of the stage (the renderer resets it for the next, docs/field-split.md)",
  );
  const faint = field(world(false), PLANE, { x: 0, y: 0, zoom: 1 });
  label(faint.k, "x", 1, 2, 4, 0.5, "#fill");
  assert.ok(
    faint.log.includes("globalAlpha = 0.425") && faint.log.includes("globalAlpha = 0.5") && faint.log.includes("fillStyle = #fill"),
  );
  assert.ok(faint.log.includes("lineWidth = 2"), "never thinner than 2");
});

test("drawLine: the margins faint, the line through the holes stronger, all dashed, then a dot on each hole", () => {
  const g = world(false);
  const line = g.world.line;
  const { k, log, state } = field(g, PLANE, here(g));
  drawLine(k);
  const strokes = log.reduce<number[]>((a, l, i) => (l === "stroke()" ? [...a, i] : a), []);
  assert.equal(strokes.length, 2);
  assert.ok(log.slice(0, strokes[0]).includes("globalAlpha = 0.25"), "the margins are faint");
  assert.ok(log.slice(strokes[0], strokes[1]).includes("globalAlpha = 0.6"), "the line is stronger");
  assert.deepEqual(callsOf(log, "setLineDash"), ["[6, 5]", "[]"]);
  assert.equal(callsOf(log, "moveTo").length, 3, "three runs: two margins and the line");
  const last = line.holes.length - 1;
  const points = line.sHole[0]! - line.sMin + 1 + (line.sMax - line.sHole[last]! + 1) + (line.sHole[last]! - line.sHole[0]! + 1);
  assert.equal(callsOf(log, "moveTo").length + callsOf(log, "lineTo").length, points, "one point a column");
  assert.equal(callsOf(log, "arc").length, line.holes.length, "a dot a hole");
  assert.ok(log.includes("fillStyle = #ink") && log.includes("strokeStyle = #ink"));
  assert.equal(state.globalAlpha, 1);
  const bare = field(g, PLANE, here(g));
  drawLine(bare.k, false);
  assert.equal(callsOf(bare.log, "arc").length, 0, "the pen's view draws no hole dots");
});

test("drawHoleNames: each hole is named by the colony it belongs to in a pill, 'empty hole' where none; a hole out of view is skipped", () => {
  const g = world(false);
  const holes = g.world.line.holes;
  const { k, log } = field(g, PLANE, here(g));
  drawHoleNames(k, () => true);
  assert.equal(callsOf(log, "roundRect").length, holes.length, "a pill for each hole that has a colony");
  for (const [n, col] of g.colonies.entries()) {
    const parts = badgeParts(nestBadge(col, n, g.fungus));
    for (const p of parts)
      assert.ok(
        callsOf(log, "fillText").some((a) => a.startsWith(`${p.text}, `)),
        `${p.text} drawn`,
      );
  }
  const first = callsOf(log, "roundRect")[0]!.split(", ");
  const [sx, sy] = toScreen(k.c, V, centreX(holes[0]!.x, holes[0]!.y), centreY(holes[0]!.y));
  const px = Math.round(Math.max(10, Math.min(14, k.c.zoom * 0.9)));
  const above = sy - Math.max(12, 4.5 * k.c.zoom);
  assert.ok(Math.abs(Number(first[1]) + Number(first[3]) / 2 - (above - px * 0.2)) < 1e-3, "the pill sits above its hole");
  assert.ok(Math.abs(Number(first[0]) + Number(first[2]) / 2 - sx) < 1e-3, "and centred on it");
  // the badge's parts take their tones: the name in ink, the infected share in the spore colour
  const sick = field(g, PLANE, here(g), { fungus: { census: () => ({ infected: 3, living: 10 }) } as unknown as Fungus });
  drawHoleNames(sick.k, () => true);
  const at = sick.log.findIndex((l) => l.startsWith("fillText(30%, "));
  assert.ok(at > 0 && sick.log[at - 1] === "fillStyle = #spore", "the infected share is in the spore colour");
  const nameAt = sick.log.findIndex((l) => l.startsWith(`fillText(${badgeParts(nestBadge(g.colonies[0]!, 0, sick.k.fungus))[0]!.text}, `));
  assert.equal(sick.log[nameAt - 1], "fillStyle = #ink", "and the name in ink");
  // a colony missing: its hole is empty
  const alone = field(g, PLANE, here(g), { colonies: [g.colonies[0]!] });
  drawHoleNames(alone.k, () => true);
  assert.ok(
    callsOf(alone.log, "fillText").some((a) => a.startsWith("empty hole, ")),
    "empty hole",
  );
  assert.equal(callsOf(alone.log, "roundRect").length, 1);
  // nothing in view
  const none = field(g, PLANE, here(g));
  drawHoleNames(none.k, () => false);
  assert.deepEqual(none.log, []);
});

test("drawBends: a faint rule at each interior hole of the line, labelled with its turn; none on a line with two holes", () => {
  const two = world(false);
  const bare = field(two, CURTAIN, { x: 100, y: 20, zoom: 4 });
  drawBends(bare.k);
  assert.deepEqual(bare.log, [], "a line of two holes has no bend");
  const g = world(true);
  const line = g.world.line;
  assert.equal(line.holes.length, 3);
  const s = line.sHole[1]!;
  const { k, log, state } = field(g, CURTAIN, { x: centreX(s, STRIP), y: 20, zoom: 4 });
  drawBends(k);
  const [x] = toScreen(k.c, V, centreX(s, STRIP), 0);
  assert.deepEqual(
    callsOf(log, "lineTo")[0]!.split(", ").map(Number).slice(0, 1),
    [Math.round(x * 1000) / 1000],
    "the rule is at the bend's column",
  );
  assert.ok(log.includes("strokeStyle = #ink") && log.includes("globalAlpha = 0.18"));
  const turn = turnAt(line, 1);
  assert.ok(
    callsOf(log, "fillText").some((a) => a.startsWith(`${turn >= 0 ? "↱" : "↰"} ${Math.round(Math.abs(turn))}°, `)),
    "the turn, with its arrow",
  );
  assert.equal(state.globalAlpha, 1);
  // a bend off to the side of the view is skipped
  const away = field(g, CURTAIN, { x: centreX(s, STRIP) + 500, y: 20, zoom: 4 });
  drawBends(away.k);
  assert.deepEqual(away.log, []);
  const left = field(g, CURTAIN, { x: centreX(s, STRIP) - 500, y: 20, zoom: 4 });
  drawBends(left.k);
  assert.deepEqual(left.log, [], "and one off the other side");
});

test("drawStripAnts: the plane's live ants over the line are drawn level on the strip in their colony's colour, a crumb at the head of a carrier", () => {
  const g = world(false);
  const line = g.world.line;
  g.colonies[1]!.nestOdour = 0.5; // two colonies of different tones
  // Ants put on known cells over the line: s1, s2, s3 are columns of the line, and each is one cell of the plane.
  const [s1, s2, s3] = [line.sHole[0]! + 3, line.sHole[0]! + 5, line.sHole[0]! + 7] as [number, number, number];
  const put = (col: (typeof g.colonies)[number], i: number, s: number, o: { alive?: boolean; layer?: number; carry?: boolean }) => {
    cellAt(line, s);
    col.x[i] = centreX(CELL[0], CELL[1]);
    col.y[i] = centreY(CELL[1]);
    col.alive[i] = o.alive === false ? 0 : 1;
    col.layer[i] = o.layer ?? PLANE;
    col.carrying[i] = o.carry ? 1 : 0;
  };
  const [c0, c1] = g.colonies as [(typeof g.colonies)[number], (typeof g.colonies)[number]];
  for (const col of g.colonies) col.alive.fill(0);
  put(c0, 0, s1, { carry: true }); // drawn, with a crumb
  put(c0, 1, s2, {}); // drawn, no crumb
  put(c0, 2, s2, { alive: false, carry: true }); // dead, on a column of a live one: not drawn, no crumb
  put(c0, 3, s1, { layer: CURTAIN, carry: true }); // underground: not on the strip
  put(c1, 0, s2, { carry: true }); // the other colony's
  put(c1, 1, s3, { carry: true }); // the view rejects this column
  const c: Camera = { x: centreX(s2, STRIP), y: centreY(STRIP), zoom: 20 };
  const x = (s: number) => toScreen(c, V, centreX(s, STRIP), centreY(STRIP))[0];
  const y = toScreen(c, V, 0, centreY(STRIP))[1];
  const tone = (col: typeof c0) => odourColour(THEME.inkRgb, THEME.warnRgb, col.nestOdour);
  const rejects3 = (wx: number) => wx !== centreX(s3, STRIP);
  const { k, log, state } = field(g, CURTAIN, c);
  drawStripAnts(k, 8, 3, rejects3);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  assert.deepEqual(log, [
    "lineCap = round",
    "lineWidth = 2.4",
    // colony 0: ants 0 (s1) and 1 (s2)
    "beginPath()",
    `moveTo(${r(x(s1) - 4)}, ${r(y)})`,
    `lineTo(${r(x(s1) + 4)}, ${r(y)})`,
    `moveTo(${r(x(s2) - 4)}, ${r(y)})`,
    `lineTo(${r(x(s2) + 4)}, ${r(y)})`,
    `strokeStyle = ${tone(c0)}`,
    "globalAlpha = 0.85",
    "stroke()",
    "globalAlpha = 1",
    "fillStyle = #accent",
    `fillRect(${r(x(s1) + 4 - 1.5)}, ${r(y - 1.5)}, 3, 3)`,
    // colony 1: ant 0 (s2); ant 1 (s3) is out of the view's sight
    "beginPath()",
    `moveTo(${r(x(s2) - 4)}, ${r(y)})`,
    `lineTo(${r(x(s2) + 4)}, ${r(y)})`,
    `strokeStyle = ${tone(c1)}`,
    "globalAlpha = 0.85",
    "stroke()",
    "globalAlpha = 1",
    "fillStyle = #accent",
    `fillRect(${r(x(s2) + 4 - 1.5)}, ${r(y - 1.5)}, 3, 3)`,
  ]);
  assert.equal(state.lineCap, "round", "the cap stays set to the end of the stage (the renderer resets it for the next)");
  assert.notEqual(tone(c0), tone(c1));
  // nobody carries: the ants are drawn and no crumb is
  for (const col of g.colonies) col.carrying.fill(0);
  const empty = field(g, CURTAIN, c);
  drawStripAnts(empty.k, 8, 3, rejects3);
  assert.equal(callsOf(empty.log, "moveTo").length, 3);
  assert.equal(callsOf(empty.log, "fillRect").length, 0);
  assert.ok(!empty.log.includes("fillStyle = #accent"));
  // at the bend two columns lie over one cell: both are drawn (columnsOver)
  const wide = field(g, CURTAIN, c, { d: 2 });
  drawStripAnts(wide.k, 8, 3, () => false);
  assert.deepEqual(callsOf(wide.log, "moveTo"), [], "nothing is stroked into the path when nothing is in view");
});

test("drawPen: the flight's circle, and under the pointer the settle preview or why not; the preview is asked once a cell", () => {
  const g = world(false);
  const h = g.world.line.holes[0]!;
  const c = here(g);
  const asked: { x: number; y: number }[] = [];
  const pen: FieldPen = {
    x: centreX(h.x, h.y),
    y: centreY(h.y),
    r: 5,
    preview: (p) => {
      asked.push(p);
      return p.x > c.x + 30 ? { ok: false, reason: "too far" } : { ok: true, cell: { x: h.x + 3, y: h.y }, end: "end" };
    },
    onPick: () => {},
  };
  const [ax, ay] = toScreen(c, V, pen.x + 5 - 0.02, pen.y);
  const [bx] = toScreen(c, V, pen.x + 5 + 0.02, pen.y);
  const inputs = (hover: [number, number] | null): FieldInputs => ({ hover, pen, penSeen: { current: null }, show: SHOW });
  // no pointer: the circle only
  const bare = field(g, PLANE, c);
  drawPen(bare.k, inputs(null));
  assert.deepEqual(callsOf(bare.log, "arc"), [`400, 300, 60, 0, 6.283`], "the circle, a radius of r cells");
  assert.deepEqual(callsOf(bare.log, "setLineDash"), ["[8, 6]", "[]"]);
  assert.ok(bare.log.includes("strokeStyle = #accent") && bare.log.includes("globalAlpha = 0.06"));
  assert.deepEqual(asked, []);
  // a pointer where she can settle: the new segment dashed, a ring, a dot and "her hole"
  const ok = field(g, PLANE, c);
  const seen = inputs([420, 310]);
  drawPen(ok.k, seen);
  assert.equal(asked.length, 1);
  assert.equal(callsOf(ok.log, "arc").length, 3, "the circle, the ring and the dot");
  assert.ok(callsOf(ok.log, "fillText").some((a) => a.startsWith("her hole, ")));
  assert.ok(callsOf(ok.log, "setLineDash").includes("[6, 5]"), "the segment is dashed");
  const arcs = callsOf(ok.log, "arc");
  assert.equal(arcs[1]!.split(", ")[2], "14.4", "the ring is 1.2 cells");
  assert.ok(ok.log.includes("globalAlpha = 0.5"), "a faint line from the pointer to where she would settle");
  // the segment starts at the end of the line it grows (the preview says the far end)
  const [ex, ey] = toScreen(
    c,
    V,
    centreX(g.world.line.holes.at(-1)!.x, g.world.line.holes.at(-1)!.y),
    centreY(g.world.line.holes.at(-1)!.y),
  );
  const firstMove = callsOf(ok.log, "moveTo")[0]!.split(", ").map(Number);
  assert.ok(Math.abs(firstMove[0]! - ex) < 1e-3 && Math.abs(firstMove[1]! - ey) < 1e-3, "from the far hole");
  // the same cell again: not asked again
  drawPen(field(g, PLANE, c).k, seen);
  assert.equal(asked.length, 1, "asked once a cell");
  // another cell: asked again
  drawPen(field(g, PLANE, c).k, { ...seen, hover: [600, 310] });
  assert.equal(asked.length, 2);
  // the same cell, but across the circle's edge: asked again (the answer can differ)
  const edge = { ...seen, penSeen: { current: null }, hover: [ax, ay] as [number, number] };
  drawPen(field(g, PLANE, c).k, edge);
  const before = asked.length;
  drawPen(field(g, PLANE, c).k, { ...edge, hover: [bx, ay] });
  assert.equal(asked.length, before + 1, "inside and outside the circle are not the same answer");
  // she can't: the reason, kept inside the field and in the warn colour
  const no = field(g, PLANE, c);
  drawPen(no.k, inputs([790, 310]));
  const reason = callsOf(no.log, "fillText").find((a) => a.startsWith("too far, "))!;
  assert.ok(reason, "the reason is drawn");
  assert.equal(
    Number(reason.split(", ")[1]),
    V.w - (7 * 12 * 0.5) / 2 - 6,
    "kept inside the field: its half-width and a margin from the edge",
  );
  assert.ok(no.log.includes("fillStyle = #warn"));
  assert.equal(callsOf(no.log, "arc").length, 1, "no ring for a refusal");
});

test("sizes follow the device ratio and the text size: lines, dashes, dots and clamps (a second pass of each helper at d = 2)", () => {
  const g = world(false);
  const two: Partial<FieldCtx> = { d: 2, v: { w: 800, h: 600, dpr: 2 } };
  // pill at 24 px: the line is px / 12 thick
  const p = field(g, PLANE, { x: 0, y: 0, zoom: 1 });
  pill(p.k, [{ text: "A", fill: "#a" }], 100, 50, 24);
  assert.ok(p.log.includes("lineWidth = 2"), "px / 12 once it is over 12 px");
  // drawLine at d = 1 and 2: the dot is the larger of 2.5 d and 0.36 a cell
  const c = here(g);
  const one = field(g, PLANE, c);
  drawLine(one.k);
  assert.ok(
    callsOf(one.log, "arc").every((a) => a.split(", ")[2] === "4.32"),
    "0.36 of a 12 px cell",
  );
  assert.ok(one.log.includes("globalAlpha = 0.9") && one.log.includes("lineWidth = 1.2"));
  const d2 = field(g, PLANE, c, two);
  drawLine(d2.k);
  assert.deepEqual(callsOf(d2.log, "setLineDash"), ["[12, 10]", "[]"]);
  assert.ok(d2.log.includes("lineWidth = 2.4"));
  assert.ok(
    callsOf(d2.log, "arc").every((a) => a.split(", ")[2] === "5"),
    "2.5 d once it is the larger",
  );
  // drawBends: the label is a little faint, sits no higher than its size from the top; the rule is clamped to the view; a bend a few labels
  // outside the view is still drawn (its label may reach in), and one further is not
  const three = world(true);
  const s = three.world.line.sHole[1]!;
  const high: Camera = { x: centreX(s, STRIP), y: 100, zoom: 4 };
  const b = field(three, CURTAIN, high);
  drawBends(b.k);
  assert.ok(
    b.log.includes("globalAlpha = 0.68") && b.log.includes("globalAlpha = 0.8"),
    "the label is 0.8 of opaque, its halo 0.85 of that",
  );
  assert.equal(callsOf(b.log, "moveTo")[0]!.split(", ")[1], "0", "the rule starts at the top of the view, not above it");
  const bottom = toScreen(high, V, 0, b.k.ext.h)[1];
  assert.equal(
    Number(callsOf(b.log, "lineTo")[0]!.split(", ")[1]),
    Math.min(V.h, Math.round(bottom * 1000) / 1000),
    "and ends at the bottom of the view or the map",
  );
  assert.ok(callsOf(b.log, "fillText")[0]!.split(", ")[2] === "12", "the label no higher than its size");
  const edge = (offset: number) => field(three, CURTAIN, { x: centreX(s, STRIP) - (V.w / 2 + offset) / 4, y: 20, zoom: 4 });
  const inside = edge(40);
  drawBends(inside.k);
  assert.ok(callsOf(inside.log, "moveTo").length === 1, "40 px outside: its label reaches in");
  const outside = edge(60);
  drawBends(outside.k);
  assert.equal(callsOf(outside.log, "moveTo").length, 0, "60 px outside: skipped");
  const bd = field(three, CURTAIN, { x: centreX(s, STRIP), y: 20, zoom: 4 }, two);
  drawBends(bd.k);
  assert.ok(bd.log.includes("lineWidth = 2") && bd.log.some((l) => l.startsWith("font = 600 24px")), "twice the line and the text at 2x");
  // drawPen at d = 2: the pen's lines are thicker and their dashes longer
  const h = g.world.line.holes[0]!;
  const pen: FieldPen = {
    x: centreX(h.x, h.y),
    y: centreY(h.y),
    r: 5,
    preview: () => ({ ok: true, cell: { x: h.x + 3, y: h.y }, end: "end" }),
    onPick: () => {},
  };
  const pd = field(g, PLANE, c, two);
  drawPen(pd.k, { hover: [420, 310], pen, penSeen: { current: null }, show: SHOW });
  assert.deepEqual(callsOf(pd.log, "setLineDash"), ["[16, 12]", "[]", "[12, 10]", "[]"]);
  assert.ok(
    pd.log.includes("lineWidth = 4") && pd.log.includes("lineWidth = 3") && pd.log.includes("lineWidth = 2"),
    "the circle, the segment, the walk",
  );
  assert.ok(callsOf(pd.log, "arc")[2]!.split(", ")[2] === "7.2", "the dot is 0.6 of a cell");
  assert.equal(
    pd.log.find((l) => l.startsWith("lineWidth")),
    "lineWidth = 4",
    "the circle's own line is the first",
  );
});
