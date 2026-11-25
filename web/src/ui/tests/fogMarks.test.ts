import assert from "node:assert/strict";
import { test } from "node:test";
import { centreX, centreY, cellKey, CURTAIN, INFECTED, PLANE, type Colony, type Game } from "../../colony/index.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import { exploredCull } from "../field/fogCull.ts";
import { drawFungusGround, drawStalksRaised } from "../field/fungus.ts";
import { drawAphids } from "../field/marks.ts";
import { drawRememberedCorpses } from "../field/nests.ts";
import { drawBends, drawHoleNames, drawLine } from "../field/overlays.ts";
import { CorpseMemory } from "../fog/corpses.ts";
import { GRACE, Knowledge, REMEMBERED } from "../fog/knowledge.ts";
import { sensedFor } from "../fog/sources.ts";
import { SensedMap } from "../fungusSight.ts";
import { buildGame } from "../useColony.ts";
import { recordingContext } from "./recordingContext.ts";
import { renderScene, type Scene } from "./sceneHarness.ts";

// The rest of the map's marks under the fog (docs/fog-of-war.md §4.3, §5.1, ja-1ypq.3.3): aphids, chamber labels, hole names, the line and its holes,
// the bends, the fungus's colonised corpses, and the dead the fungus has seen kept as ground items.

const hostAt = (x: number, y: number, n = 1): Colony =>
  ({
    n,
    params: { sensorDistance: 3 },
    alates: [],
    alive: Uint8Array.of(1),
    load: Float32Array.of(INFECTED),
    layer: Uint8Array.of(PLANE),
    x: Float32Array.of(x),
    y: Float32Array.of(y),
  }) as unknown as Colony;
const at = (gx: number, gy: number) => hostAt(centreX(gx, gy), centreY(gy));
const none = () => hostAt(0, 0, 0);

test("the dead are remembered where they lay: kept after the observer leaves and the corpse is gone, forgotten when the place is sensed again without it", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const corpses: { x: number; y: number; held: number; died: number; heading: number }[] = [
    { x: 20, y: 20, held: -1, died: 0, heading: 1 },
  ];
  const game = { layers: [{}], colonies: [{ time: 5, home: PLANE, corpses, remains: [] }] } as unknown as Game;
  const memory = new CorpseMemory();
  const step = (t: number, host: Colony) => {
    sensed.stamp([host], t);
    memory.update(game, fog, () => 2);
  };
  step(1, at(20, 20));
  assert.equal([...memory.on(PLANE)].length, 1, "seen while live");
  step(1 + GRACE + 1, none());
  corpses.length = 0; // carried off, or rotted, while nobody senses the place
  step(1 + GRACE + 2, none());
  assert.equal(fog.state(PLANE, 20, 20), REMEMBERED);
  assert.equal([...memory.on(PLANE)].length, 1, "still remembered: nobody has seen it gone");
  step(1 + GRACE + 3, at(20, 20));
  assert.equal([...memory.on(PLANE)].length, 0, "sensed again and gone: forgotten");
  const never = new CorpseMemory();
  corpses.push({ x: 90, y: 90, held: -1, died: 0, heading: 0 });
  never.update(game, fog, () => 2);
  assert.equal([...never.on(PLANE)].length, 0, "a corpse in a place nothing has sensed is not remembered");
});

function ctxFor(game: Game, sensed: SensedMap, over: Partial<FieldCtx> = {}) {
  const rec = recordingContext();
  const calls: string[] = [];
  const k = {
    ctx: rec.ctx,
    theme: {
      ink: "#i",
      mound: "#m",
      paper: "#p",
      fg3: "#f",
      warn: "#w",
      spore: "#s",
      warnRgb: [1, 2, 3],
      inkRgb: [0, 0, 0],
    } as unknown as FieldTheme,
    c: { x: 50, y: 40, zoom: 20 },
    v: { w: 4000, h: 3000, dpr: 1 },
    d: 1,
    lv: PLANE,
    world: game.world,
    colonies: game.colonies,
    fungus: game.fungus,
    fog: sensed.knowledge,
    corpses: sensed.corpses,
    sprites: {
      cadaver: { draw: (...a: unknown[]) => (calls.push(`cadaver ${a[2]}`), true) },
      fungal: { draw: () => calls.push("fungal") },
    },
    ...over,
  } as unknown as FieldCtx;
  return { k, rec, calls };
}

test("remembered corpses are drawn where nobody senses them now, and not where an observer does (the nest stage draws those)", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  sensed.corpses!.update(game, sensed.knowledge!, () => 2); // nothing sensed: nothing remembered
  const col = game.colonies[0]!;
  col.corpses.push({ x: 30, y: 30, held: -1, died: col.time, heading: 0, load: 0, strain: 0, layer: PLANE });
  sensed.stamp([at(30, 30)], 1);
  sensed.corpses!.update(game, sensed.knowledge!, () => 2);
  const live = ctxFor(game, sensed);
  drawRememberedCorpses(live.k, { len: 6, inView: () => true, resourceLod: "walk", nestImage: null } as never);
  assert.deepEqual(live.calls, [], "live: left to the nest stage");
  sensed.stamp([none()], 1 + GRACE + 1);
  const away = ctxFor(game, sensed);
  drawRememberedCorpses(away.k, { len: 6, inView: () => true, resourceLod: "walk", nestImage: null } as never);
  assert.deepEqual(away.calls, ["cadaver 2"], "remembered: drawn at the stage it had");
});

test("the fungus's colonised corpses show only where the place has been sensed", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  const fungus = { hyphaeOn: () => null, corpsesOn: () => [[cellKey(30, 30), 1]], stalksOn: () => [], evolution: null };
  const win = { rx0: 0, rx1: 100, ry0: 0, ry1: 100 };
  const dark = ctxFor(game, sensed, { fungus: fungus as never, colonies: [] });
  drawFungusGround(dark.k, win);
  assert.deepEqual(dark.calls, [], "never sensed: not shown");
  sensed.stamp([at(30, 30)], 1);
  const lit = ctxFor(game, sensed, { fungus: fungus as never, colonies: [] });
  drawFungusGround(lit.k, win);
  assert.deepEqual(lit.calls, ["fungal"], "sensed: shown");
});

test("the line and its holes under the fog: only holes the fungus has sensed, and the stretches between two of them", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  const holes = game.world.line.holes;
  const arcs = (g: ReturnType<typeof ctxFor>) => g.rec.log.filter((l) => l.startsWith("arc(")).length;
  const dark = ctxFor(game, sensed);
  drawLine(dark.k);
  assert.equal(arcs(dark), 0, "no hole dot before anyone has been there");
  assert.equal(dark.rec.log.filter((l) => l === "stroke()").length, 0, "and no line");
  sensed.stamp([at(holes[0]!.x, holes[0]!.y)], 1);
  const one = ctxFor(game, sensed);
  drawLine(one.k);
  assert.equal(arcs(one), 1, "the sensed hole's dot");
  const off = ctxFor(game, sensed, { fog: null });
  drawLine(off.k);
  assert.equal(arcs(off), holes.length, "without the fog every hole has one");
});

test("the bends under the fog: a rule and label only at an interior hole the fungus has sensed", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  // A line of three holes with a bend at the middle one (drawBends reads only the holes' places and their columns).
  const line = {
    holes: [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
    ],
    sHole: [0, 20, 40],
  };
  const bend = (over: Partial<FieldCtx> = {}) => {
    const g = ctxFor(game, sensed, {
      lv: CURTAIN,
      ext: { x0: 0, w: 512, h: 368 } as never,
      world: { line, lines: [{ line }] } as never,
      ...over,
    });
    drawBends(g.k);
    return g.rec.log.filter((l) => l === "stroke()").length;
  };
  assert.equal(bend(), 0, "no bend before its hole is sensed");
  sensed.stamp([at(30, 10)], 1);
  assert.equal(bend(), 1, "the sensed interior hole's rule");
  assert.equal(bend({ fog: null }), 1, "without the fog the one interior hole has it");
});

const BASE: Scene = { ticks: 40, size: { w: 800, h: 600 }, fog: true };
const LIT: Scene["stamp"] = (g, s) => {
  s.stampGame(g);
  s.mark(PLANE, 256, 100, 600);
  s.mark(CURTAIN, 256, 100, 600);
};
const texts = (log: string[]) => log.filter((l) => l.startsWith("fillText(")).length;

test("hole names and chamber labels draw only where the place is sensed (labels, where live)", () => {
  const plane = (s: Scene) => texts(renderScene({ ...BASE, ...s }).log);
  assert.equal(plane({}), 0, "no hole name before anyone has been there");
  assert.ok(plane({ stamp: LIT }) > 0, "named once sensed");
  const labels = (s: Scene) => texts(renderScene({ ...BASE, lv: CURTAIN, labels: true, ...s }).log);
  assert.equal(labels({}), 0, "no chamber label unsensed");
  assert.ok(labels({ stamp: LIT }) > 0, "labelled once live");
});

test("aphids draw only where an observer senses them now", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  const clump = { layer: PLANE, cells: [30, 30], start: 10, eaten: 0, age: 1, owed: 0 };
  const draws = () => {
    const g = ctxFor(game, sensed);
    drawAphids(g.k, { inView: () => true, resourceImage: null, resourceLod: "walk" } as never, [clump], 0);
    return g.rec.log.filter((l) => l.startsWith("arc(")).length;
  };
  assert.equal(draws(), 0, "unsensed");
  sensed.stamp([at(30, 30)], 1);
  assert.ok(draws() > 0, "live");
  sensed.stamp([none()], 1 + GRACE + 1);
  assert.equal(draws(), 0, "remembered: a clump's size changes, so it is not drawn from memory");
});

test("the dead of another layer are not remembered on this one, and time going back forgets them", () => {
  const sensed = new SensedMap();
  sensed.knowledge = new Knowledge(sensed, []);
  const memory = (sensed.corpses = new CorpseMemory());
  const corpses = [{ x: 20, y: 20, held: -1, died: 0, heading: 1, layer: CURTAIN }];
  const host = hostAt(centreX(20, 20), centreY(20));
  const colony = { ...host, time: 5, home: PLANE, corpses, remains: [] } as unknown as Colony;
  const game = {
    time: 5,
    colonies: [colony],
    isFrozen: () => false,
    layers: [{}, {}],
    fungus: { evolution: null, patchOn: () => [], hyphaeOn: () => null },
  } as unknown as Game;
  sensed.stampGame(game);
  assert.equal([...memory.on(PLANE)].length, 0, "a curtain corpse is not a plane corpse, though the plane cell is sensed");
  assert.equal([...memory.on(CURTAIN)].length, 0, "and the curtain was not sensed");
  corpses[0]!.layer = PLANE;
  sensed.stampGame(game);
  assert.equal([...memory.on(PLANE)].length, 1, "a plane corpse in a sensed plane cell is remembered");
  (colony as { n: number }).n = 0;
  game.time = 9;
  sensed.stampGame(game);
  assert.equal([...memory.on(PLANE)].length, 1, "kept after the host leaves");
  game.time = 2; // a restart, a load
  sensed.stampGame(game);
  assert.equal([...memory.on(PLANE)].length, 0, "time went back: forgotten");
});

test("remembered corpses are fainter than live ones", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  game.colonies[0]!.corpses.push({ x: 30, y: 30, held: -1, died: game.colonies[0]!.time, heading: 0, load: 0, strain: 0, layer: PLANE });
  sensed.stamp([at(30, 30)], 1);
  sensed.corpses!.update(game, sensed.knowledge!, () => 2);
  sensed.stamp([none()], 1 + GRACE + 1);
  const g = ctxFor(game, sensed);
  drawRememberedCorpses(g.k, { len: 6, inView: () => true, resourceLod: "walk", nestImage: null } as never);
  assert.ok(g.rec.log.includes("globalAlpha = 0.6"), "drawn at 0.6");
  assert.equal(g.rec.log.at(-1), "globalAlpha = 1", "and put back");
});

test("the line under the fog: a stretch only between two sensed holes, and a remembered hole still counts", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  const holes = game.world.line.holes;
  assert.ok(holes.length >= 2, "two holes at least");
  const strokes = () => {
    const g = ctxFor(game, sensed);
    drawLine(g.k);
    return { strokes: g.rec.log.filter((l) => l === "stroke()").length, dots: g.rec.log.filter((l) => l.startsWith("arc(")).length };
  };
  sensed.stamp([at(holes[0]!.x, holes[0]!.y)], 1);
  assert.deepEqual(strokes(), { strokes: 1, dots: 1 }, "one sensed hole: its margin and its dot, no stretch to the unsensed one");
  const both = (host: Colony) => host;
  void both;
  sensed.stamp(
    [at(holes[0]!.x, holes[0]!.y), at(holes[1]!.x, holes[1]!.y)].map(
      (c, i) => ({ ...c, n: 1, x: Float32Array.of(c.x[0]!), y: Float32Array.of(c.y[0]!), i }) as never,
    ),
    2,
  );
  const lit = strokes();
  sensed.stamp([none()], 2 + GRACE + 1);
  assert.deepEqual(strokes(), lit, "remembered holes draw the same stretches and dots as live ones");
  assert.ok(lit.dots >= 2 && lit.strokes >= 2, "both sensed: both dots and a stretch between");
});

test("the hole badge under the fog: the whole badge where live, the colony's name only where remembered; and the raised stalks only where sensed", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  const h = game.world.line.holes.find((x) => game.colonies.some((c) => c.holeCells.some((hc) => hc.px === x.x && hc.py === x.y)))!;
  const texts = () => {
    const g = ctxFor(game, sensed);
    drawHoleNames(
      g.k,
      exploredCull(g.k, () => true),
    ); // as the marks stage calls it
    return g.rec.log.filter((l) => l.startsWith("fillText(")).length;
  };
  sensed.stamp([at(h.x, h.y)], 1);
  const live = texts();
  assert.ok(live >= 2, "live: name and queen at least");
  sensed.stamp([none()], 1 + GRACE + 1);
  assert.equal(texts(), 1, "remembered: the name alone");
  const stalks = () => {
    const g = ctxFor(game, sensed);
    drawStalksRaised(g.k, { rx0: 0, rx1: 100, ry0: 0, ry1: 100 }, { stalks: new Set([cellKey(60, 60)]), stalkLevel: 1 });
    return g.calls.length;
  };
  assert.equal(stalks(), 0, "a stalk in a place nothing has sensed is not drawn");
  sensed.stamp([at(60, 60)], 1 + GRACE + 2);
  assert.equal(stalks(), 1, "sensed: drawn");
});
