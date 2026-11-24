import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cellAt,
  centreX,
  centreY,
  CELL,
  CHUNK,
  CURTAIN,
  INFECTED,
  OPEN,
  PLANE,
  ROCK,
  STRIP,
  type Colony,
  type Game,
} from "../../colony/index.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import { fogRgb, planeGround } from "../field/fogCull.ts";
import { stripAt } from "../field/ground.ts";
import { GRACE, LIVE, REMEMBERED, UNKNOWN } from "../fog/knowledge.ts";
import { sensedFor } from "../fog/sources.ts";
import { buildGame } from "../useColony.ts";
import { drawStripAnts } from "../field/overlays.ts";
import { recordingContext } from "./recordingContext.ts";
import { renderScene, type Scene } from "./sceneHarness.ts";

// The side view's strip and the hexagon pellets under the fog (docs/fog-of-war.md §5.1, ja-1ypq.3.2): what the plane under the line shows is what was
// last sensed there, never what is there now.

const THEME = {
  paperRgb: [240, 240, 240],
  inkRgb: [0, 20, 40],
  rock: [11, 12, 13],
  spoil: [41, 42, 43],
  accentRgb: [71, 72, 73],
  warnRgb: [200, 100, 50],
} as unknown as FieldTheme;

const host = (x: number, y: number, n = 1): Colony =>
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

/** A real game, its fog, and the plane cell under line column `s`. */
function setup() {
  const game: Game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  const fog = sensed.knowledge!;
  const k = { world: game.world, theme: THEME, fog, lv: CURTAIN } as unknown as FieldCtx;
  const column = (s: number): [number, number] | null => (cellAt(game.world.line, s) ? [CELL[0], CELL[1]] : null);
  const cols: number[] = [];
  for (let s = -100; s < 700; s++) if (column(s)) cols.push(s);
  return { game, sensed, fog, k, column, cols };
}
const senseCell = (sensed: ReturnType<typeof setup>["sensed"], q: [number, number], t: number) =>
  sensed.stamp([host(centreX(q[0], q[1]), centreY(q[1]))], t);
const leave = (sensed: ReturnType<typeof setup>["sensed"], t: number) => sensed.stamp([host(0, 0, 0)], t);

test("planeGround: nothing for a cell never sensed, the truth while it is sensed, and the last sensed once it is not (rock, food and spoil each)", () => {
  const { game, sensed, k, column, cols } = setup();
  const plane = game.world.plane;
  const q = column(cols[Math.floor(cols.length / 2)]!)!;
  assert.equal(planeGround(k, q[0], q[1]).state, UNKNOWN);
  assert.deepEqual([planeGround(k, q[0], q[1]).rock, planeGround(k, q[0], q[1]).food, planeGround(k, q[0], q[1]).spoil], [OPEN, 0, 0]);
  plane.rock.set(q[0], q[1], OPEN);
  plane.food.set(q[0], q[1], 0.4);
  plane.spoil!.set(q[0], q[1], 2);
  senseCell(sensed, q, 1);
  const live = planeGround(k, q[0], q[1]);
  assert.deepEqual([live.state, live.rock, live.food, live.spoil], [LIVE, OPEN, Math.fround(0.4), 2]);
  leave(sensed, 1 + GRACE + 1);
  plane.rock.set(q[0], q[1], ROCK); // changed out of sight
  plane.food.set(q[0], q[1], 0.9);
  plane.spoil!.set(q[0], q[1], 5);
  const away = planeGround(k, q[0], q[1]);
  assert.deepEqual(
    [away.state, away.rock, away.food, away.spoil],
    [REMEMBERED, OPEN, Math.fround(0.4), 2],
    "the last sensed, not what is there now",
  );
});

test("stripAt under the fog: fog on the strip row and no cut above it where the plane was never sensed; the cell as it was, dimmed, where it is remembered", () => {
  const { game, sensed, k, column, cols } = setup();
  const plane = game.world.plane;
  const s = cols[Math.floor(cols.length / 2)]!;
  const q = column(s)!;
  plane.rock.set(q[0], q[1], OPEN);
  plane.food.set(q[0], q[1], 0);
  plane.spoil!.set(q[0], q[1], 0);
  const F = fogRgb(THEME);
  assert.deepEqual(stripAt(k, s, STRIP), F, "never sensed: fog on the strip");
  assert.equal(stripAt(k, s, 0), null, "and nothing above it: the curtain's sky is the curtain's");
  senseCell(sensed, q, 1);
  assert.deepEqual(stripAt(k, s, STRIP), THEME.paperRgb, "live: open ground, the paper");
  leave(sensed, 1 + GRACE + 1);
  plane.rock.set(q[0], q[1], ROCK); // rock appears out of sight
  const dim = stripAt(k, s, STRIP)!;
  assert.deepEqual(
    [...dim],
    THEME.paperRgb!.map((c, i) => Math.round(c * 0.6 + F[i]! * 0.4)),
    "remembered: the open ground it was, dimmed towards the fog, not the rock it became",
  );
});

const BASE: Scene = { ticks: 40, size: { w: 800, h: 600 }, lv: CURTAIN, fog: true };
const PLANE_ONLY: Scene["stamp"] = (g, s) => {
  s.stampGame(g);
  s.mark(0, 256, 100, 600); // every cell of the plane, none of the curtain
};
const chunks = (pixels: Uint8ClampedArray[]) => pixels.filter((p) => p.length === CHUNK * CHUNK * 4);
const clear = (pixels: Uint8ClampedArray[]) => chunks(pixels).reduce((n, p) => n + p.filter((_, i) => i % 4 === 3 && p[i] === 0).length, 0);

test("the strip's chunk of the curtain paints from the plane even where nothing of the curtain has been sensed", () => {
  const dark = renderScene(BASE);
  assert.equal(clear(dark.pixels), 0, "nothing sensed: every pixel is fog");
  const plane = renderScene({ ...BASE, stamp: PLANE_ONLY });
  assert.ok(clear(plane.pixels) > 0, "the plane under the line is sensed: its open ground shows on the strip (clear pixels), not fog");
});

test("plane ants over the strip, and the crumbs on the carriers, are drawn only where their plane cell is live", () => {
  const { sensed, fog, game, column, cols } = setup();
  const [qa, qb] = [column(cols[0]!)!, column(cols[cols.length - 1]!)!];
  const at = (q: [number, number]) => [centreX(q[0], q[1]), centreY(q[1])] as const;
  const colony = {
    n: 2,
    nestOdour: 0,
    alive: Uint8Array.of(1, 1),
    layer: Uint8Array.of(PLANE, PLANE),
    carrying: Uint8Array.of(1, 1),
    x: Float32Array.of(at(qa)[0], at(qb)[0]),
    y: Float32Array.of(at(qa)[1], at(qb)[1]),
  };
  const draw = () => {
    const rec = recordingContext();
    const k = {
      ctx: rec.ctx,
      theme: { ...THEME, accent: "#a", ink: "#i" },
      c: { x: 0, y: 0, zoom: 10 },
      v: { w: 10000, h: 10000, dpr: 1 },
      d: 1,
      world: game.world,
      colonies: [colony],
      fog,
      lv: CURTAIN,
    } as unknown as FieldCtx;
    drawStripAnts(k, 6, 2, () => true);
    return {
      strokes: rec.log.filter((l) => l.startsWith("moveTo(")).length,
      crumbs: rec.log.filter((l) => l.startsWith("fillRect(")).length,
    };
  };
  assert.deepEqual(draw(), { strokes: 0, crumbs: 0 }, "nothing sensed");
  senseCell(sensed, qa, 1);
  assert.deepEqual(draw(), { strokes: 1, crumbs: 1 }, "only the ant whose cell is live, and its crumb");
});

test("hexagon mode: the pellets of a mound show only once its ground is sensed", () => {
  const at: Scene["at"] = (g) => {
    const n = g.colonies[0]!.layers[0]!.nest;
    return { x: n.x, y: n.y, zoom: 40 };
  };
  const hex: Scene = { ticks: 400, size: { w: 800, h: 600 }, at, fog: true };
  const lit: Scene["stamp"] = (g, s) => {
    s.stampGame(g);
    s.mark(PLANE, 256, 100, 600);
    s.mark(CURTAIN, 256, 100, 600);
  };
  const fills = (s: Scene) => renderScene({ ...hex, ...s }).log.filter((l) => l.startsWith("fill")).length;
  assert.ok(fills({}) * 2 < fills({ stamp: lit }), "nothing sensed: far fewer fills (no mound's pellets) than with every cell sensed");
});

test("the strip of a remembered plane is dimmed: its open ground is a faint wash of fog, not clear", () => {
  const remembered: Scene["stamp"] = (g, s) => {
    PLANE_ONLY(g, s);
    s.stamp([], g.time + 10); // the hosts have left: nothing is live any more
  };
  const washed = (pixels: Uint8ClampedArray[]) =>
    chunks(pixels).reduce((n, p) => n + p.filter((_, i) => i % 4 === 3 && p[i] === 70).length, 0);
  const r = renderScene({ ...BASE, stamp: remembered });
  assert.equal(clear(r.pixels), 0, "no clear pixel: nothing is live");
  assert.ok(washed(r.pixels) > 0, "the strip's open ground is the fog's faint wash");
});
