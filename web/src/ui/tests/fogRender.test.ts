import assert from "node:assert/strict";
import { test } from "node:test";
import { CURTAIN } from "../../colony/index.ts";
import { renderScene, type Scene } from "./sceneHarness.ts";

// The fog on the whole frame (docs/fog-of-war.md §5.1, ja-1ypq.3.1): the same real game drawn with no fog, with the fog and nothing sensed, and
// with the fog and every cell sensed. Ants and nests draw as strokes and arcs on the recording context, so what the fog hides is read off its log.

const BASE: Scene = { ticks: 40, size: { w: 800, h: 600 } };
const LIT: Scene["stamp"] = (g, s) => {
  s.stampGame(g);
  s.mark(0, 256, 100, 600); // every cell of the plane
  s.mark(1, 256, 100, 600); // and of the curtain
};
const count = (log: string[], prefix: string) => log.filter((l) => l.startsWith(prefix)).length;

test("the fog hides the ants and the nests' discs; where every cell is sensed the frame is the unfogged one", () => {
  const off = renderScene(BASE).log;
  const dark = renderScene({ ...BASE, fog: true }).log;
  const lit = renderScene({ ...BASE, fog: true, stamp: LIT }).log;
  assert.ok(count(off, "moveTo") > count(dark, "moveTo"), "no ant stroke where nothing is sensed");
  assert.ok(count(off, "arc(") > count(dark, "arc("), "no nest disc where nothing is sensed");
  assert.equal(count(lit, "moveTo"), count(off, "moveTo"), "every ant once all is live");
  assert.equal(count(lit, "arc("), count(off, "arc("), "every nest once all is explored");
});

test("the curtain's strip and the plane's ants over it are not drawn under the fog, and are where the fog is off", () => {
  const off = renderScene({ ...BASE, lv: CURTAIN }).log;
  const dark = renderScene({ ...BASE, lv: CURTAIN, fog: true }).log;
  assert.ok(count(off, "moveTo") > 100, "the strip's ants stroke without the fog");
  assert.equal(count(dark, "moveTo"), 0, "none under it");
});
