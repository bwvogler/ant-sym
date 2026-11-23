import assert from "node:assert/strict";
import { test } from "node:test";
import { CURTAIN, PLANE } from "../../colony/index.ts";
import { defaultTheme, FieldBinding, rgb, themeFromCss } from "../field/binding.ts";
import type { FieldCtx } from "../field/ctx.ts";

// The field's binding (ja-fnd.6.3.8, part 2): the shown layer and its map, the colonies' scent on it, the theme read from the CSS, and the sprite sets.

const map = (x0: number, w: number) => ({ x0, size: { w, h: 50 }, rock: { get: () => 0 } });

function setup(shown = PLANE) {
  const log: string[] = [];
  const plane = map(0, 100) as ReturnType<typeof map>;
  const curtain = map(-10, 120);
  const world = { plane, curtain };
  const layer = (name: string) => ({ name });
  const col = (id: string, has: boolean) => ({
    map: plane,
    nestOdour: id.length,
    layers: [
      has ? { ph: { fields: { alarm: layer(`${id}.alarm`), food: layer(`${id}.food`), home: layer(`${id}.home`) } } } : undefined,
      undefined,
    ],
  });
  const colonies = [col("a", true), col("bb", false), col("ccc", true)];
  const spore = { spores: layer("spores") };
  const fungus = { spores: layer("own"), sporesOn: (lv: number) => (lv === PLANE ? spore : undefined) };
  const sensed = { layer: (lv: number) => layer(`sensed${lv}`), now: 7 };
  const sprite = (n: string) => ({
    clearTints: () => log.push(`${n}.clearTints`),
    load: (cb: () => void) => (log.push(`${n}.load`), (redraw = cb)),
    dispose: () => log.push(`${n}.dispose`),
  });
  let redraw: (() => void) | null = null;
  const sprites = { worker: sprite("worker"), nest: sprite("nest"), cadaver: sprite("cadaver"), resource: sprite("resource") };
  const ground = { clear: () => log.push("ground.clear"), clearTiles: () => log.push("ground.clearTiles") };
  const minimap = {
    resize: (e: unknown) => log.push(`minimap.resize ${(e as { w: number }).w}`),
    invalidate: () => log.push("minimap.invalidate"),
  };
  const st = { shown, smell: false };
  const b = new FieldBinding(
    { sprites: () => sprites } as never,
    world as never,
    colonies as never,
    fungus as never,
    sensed as never,
    ground as never,
    minimap as never,
    { shown: () => st.shown, smell: () => st.smell },
    (n) => (n === "--heat" ? "10 20 30" : n.startsWith("--") ? "#102030" : ""),
    colonies[0] as never,
  );
  return { b, st, log, plane, curtain, colonies, spore, fungus, getRedraw: () => redraw };
}

test("a new binding binds the shown layer and reads the theme once, in that order", () => {
  const { b, log, plane } = setup();
  assert.equal(b.lv, PLANE);
  assert.equal(b.m, plane);
  assert.deepEqual(log.slice(0, 2), ["ground.clear", "minimap.resize 100.5"], "the map is built first");
  assert.deepEqual(log.slice(2), ["ground.clearTiles", "worker.clearTints", "nest.clearTints", "minimap.invalidate"]);
  assert.deepEqual(b.theme.trail, [10, 20, 30]);
});

test("bind: the shown map, the spores and the scent of the colonies that have the layer", () => {
  const { b, st, spore, fungus, curtain } = setup();
  assert.equal(b.spores, spore.spores);
  assert.equal(b.strip, false);
  assert.equal(b.sensedLayer && (b.sensedLayer as never as { name: string }).name, "sensed0");
  assert.deepEqual(
    b.trails.map((t) => t.odour),
    [1, 3],
    "a colony with no layer there is skipped",
  );
  assert.deepEqual(
    b.alarms.map((a) => (a as never as { name: string }).name),
    ["a.alarm", "ccc.alarm"],
  );
  st.shown = CURTAIN;
  st.smell = true;
  b.bind();
  assert.equal(b.m, curtain);
  assert.equal(b.strip, true);
  assert.equal(b.smellAll, true);
  assert.equal(b.spores, fungus.spores, "no spores of its own on the curtain: the fungus's default");
  assert.deepEqual(b.trails, [], "no colony has the curtain layer");
});

test("rebuild only when the map is another or has changed size", () => {
  const { b, st, log, plane } = setup();
  log.length = 0;
  b.bind();
  assert.deepEqual(log, [], "same map, same size: nothing is rebuilt");
  plane.size.w = 130;
  b.bind();
  assert.deepEqual(log, ["ground.clear", "minimap.resize 130.5"], "it grew");
  assert.equal(b.gw, 130);
  log.length = 0;
  plane.x0 = -5;
  b.bind();
  assert.deepEqual(log, ["ground.clear", "minimap.resize 130.5"], "its first column moved");
  assert.equal(b.gx0, -5);
  log.length = 0;
  plane.size.h = 60;
  b.bind();
  assert.deepEqual(log.slice(0, 1), ["ground.clear"], "it got taller");
  assert.equal(b.gh, 60);
  st.shown = CURTAIN;
  log.length = 0;
  b.bind();
  assert.equal(log[0], "ground.clear", "another map");
});

test("fill copies the bound view and the sensed clock into the frame's context", () => {
  const { b } = setup();
  const fc = {} as FieldCtx;
  b.fill(fc);
  assert.equal(fc.lv, b.lv);
  assert.equal(fc.m, b.m);
  assert.equal(fc.theme, b.theme);
  assert.equal(fc.trails, b.trails);
  assert.equal(fc.spores, b.spores);
  assert.equal(fc.sensedNow, 7);
});

test("retheme reads the CSS again and drops the tints, the tiles and the minimap's picture", () => {
  const { b, log } = setup();
  const before = b.theme;
  log.length = 0;
  b.retheme();
  assert.notEqual(b.theme, before);
  assert.deepEqual(log, ["ground.clearTiles", "worker.clearTints", "nest.clearTints", "minimap.invalidate"]);
});

test("load starts the four sets with the redraw, dispose ends them", () => {
  const { b, log, getRedraw } = setup();
  log.length = 0;
  const redraw = () => {};
  b.load(redraw);
  assert.deepEqual(log, ["cadaver.load", "worker.load", "nest.load", "resource.load"]);
  assert.equal(getRedraw(), redraw);
  log.length = 0;
  b.dispose();
  assert.deepEqual(log, ["cadaver.dispose", "worker.dispose", "nest.dispose", "resource.dispose"]);
});

test("rgb, defaultTheme and themeFromCss", () => {
  assert.deepEqual(rgb("#0a0b0c"), [10, 11, 12]);
  assert.deepEqual(rgb("not a colour"), [128, 128, 128]);
  assert.deepEqual(defaultTheme().trail, [31, 111, 92]);
  const t = themeFromCss((n) => `v${n}`);
  assert.equal(t.paper, "v--paper");
  assert.equal(t.mound, "v--mound");
  assert.equal(t.line, "v--line-strong");
});
