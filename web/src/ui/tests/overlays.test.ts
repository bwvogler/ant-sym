import assert from "node:assert/strict";
import { test } from "node:test";
import { CURTAIN, PLANE, STRIP, centreX, centreY, turnAt, type Fungus, type Game } from "../../colony/index.ts";
import { badgeParts, nestBadge } from "../badges.ts";
import type { Camera, Viewport } from "../camera.ts";
import { toScreen } from "../camera.ts";
import { odourColour } from "../field/colour.ts";
import type { FieldCtx, FieldInputs, FieldPen, FieldTheme } from "../field/ctx.ts";
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
  assert.equal(state.lineJoin, "round", "the canvas-state leak (docs/field-split.md): the join stays set");
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

test("drawStripAnts: the plane's ants over the line are drawn level on the strip in their colony's colour, a crumb on a carrier", () => {
  const g = world(false);
  g.colonies[1]!.nestOdour = 0.5; // two colonies of different tones
  for (const col of g.colonies) for (let i = 0; i < col.n; i++) if (col.alive[i] && col.layer[i] === PLANE) col.carrying[i] = 1; // all carry
  const s = g.world.line.sHole[0]!;
  const c: Camera = { x: centreX(s + 40, STRIP), y: centreY(STRIP), zoom: 6 };
  const { k, log, state } = field(g, CURTAIN, c);
  drawStripAnts(k, 8, 3, () => true);
  const wy = toScreen(c, V, 0, centreY(STRIP))[1];
  const moves = callsOf(log, "moveTo").map((a) => a.split(", ").map(Number));
  const lines = callsOf(log, "lineTo").map((a) => a.split(", ").map(Number));
  assert.ok(moves.length > 0, "ants are drawn");
  assert.equal(moves.length, lines.length);
  for (const [i, m] of moves.entries()) {
    assert.ok(Math.abs(m[1]! - wy) < 1e-6 && Math.abs(lines[i]![1]! - wy) < 1e-6, "level on the strip's row");
    assert.ok(Math.abs(lines[i]![0]! - m[0]! - 8) < 1e-6, "as long as asked");
  }
  for (const col of g.colonies) {
    assert.ok(log.includes(`strokeStyle = ${odourColour(THEME.inkRgb, THEME.warnRgb, col.nestOdour)}`), "in each colony's tone");
  }
  assert.ok(log.includes("globalAlpha = 0.85"), "a little translucent");
  assert.ok(log.includes("lineCap = round") && log.includes("lineWidth = 2.4"));
  assert.equal(state.lineCap, "round", "the canvas-state leak: the cap stays set");
  const carriers = callsOf(log, "fillRect").length;
  assert.ok(carriers > 0, "carriers are drawn");
  assert.equal(log.includes("fillStyle = #accent"), carriers > 0, "the crumb's colour only when something is carried");
  const ends = lines.map((l) => Math.round(l[0]! * 1000) / 1000);
  for (const a of callsOf(log, "fillRect")) {
    assert.ok(a.endsWith(", 3, 3"), "crumb-sized");
    // at the head of the ant: its right end, the crumb centred on it
    assert.ok(ends.includes(Math.round((Number(a.split(", ")[0]) + 1.5) * 1000) / 1000), "at the ant's head");
  }
  // nobody carries: the ants are drawn and no crumb is
  for (const col of g.colonies) col.carrying.fill(0);
  const empty = field(g, CURTAIN, c);
  drawStripAnts(empty.k, 8, 3, () => true);
  assert.ok(callsOf(empty.log, "moveTo").length > 0);
  assert.equal(callsOf(empty.log, "fillRect").length, 0);
  assert.ok(!empty.log.includes("fillStyle = #accent"));
  // out of view: nothing is stroked into the path
  const none = field(g, CURTAIN, c);
  drawStripAnts(none.k, 8, 3, () => false);
  assert.equal(callsOf(none.log, "moveTo").length, 0);
  assert.equal(callsOf(none.log, "fillRect").length, 0);
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
  const inputs = (hover: [number, number] | null): FieldInputs => ({ hover, pen, penSeen: { current: null } });
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
