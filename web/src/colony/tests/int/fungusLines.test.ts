import assert from "node:assert/strict";
import { test } from "node:test";
import { STRAINS } from "../../fungus.ts";
import { Game } from "../../game.ts";
import { oneWorldOnLines } from "../../oneWorld.ts";
import { generateWorld, mulberry32 } from "../../world.ts";

// The fungus's mass flow down a hole, per line (docs/endless-world.md §5, PRD §66 E3.3c): the mass that comes down a line's hole goes to that
// line's curtain, never to another's.

const garden = STRAINS.findIndex((s) => s.id === "garden");

function play(land: number, seconds: number) {
  const w = oneWorldOnLines(3, generateWorld(3), [[0], [1]]);
  const g = new Game(w, { autoFound: false, fungus: { hyphae: true, flow: true } }, mulberry32(5), [
    { antCount: 40, line: 0 },
    { antCount: 40, line: 1 },
  ]);
  g.land(land, garden, { evolve: true });
  const peak = [0, 0, 0];
  for (let t = 0; t < seconds * 30; t++) {
    g.tick(1 / 30);
    if (t % 30 === 0) for (const l of [1, 2]) peak[l] = Math.max(peak[l]!, g.fungus.hyphaeOn(l)?.loaded ?? 0);
  }
  return { g, peak };
}

test("a landing by the second line's colony: the mass that crossed its hole is on layer 2, and none is on layer 1", () => {
  const { g, peak } = play(1, 200);
  assert.ok(g.fungus.hyphaeOn(2), "its hyphae went down its hole");
  assert.equal(g.fungus.hyphaeOn(1), null, "none is on the first line's curtain");
  assert.ok(peak[2]! > 0, `mass flowed down to layer 2 (peak load ${peak[2]})`);
});

test("a landing by the first line's colony: the flow is the first line's, as before, and layer 2 stays empty", () => {
  const { g, peak } = play(0, 200);
  assert.equal(g.fungus.hyphaeOn(2), null);
  assert.ok(g.fungus.hyphaeOn(1), "its hyphae went down its hole");
  assert.ok(peak[1]! > 0, `mass flowed down to layer 1 (peak load ${peak[1]})`);
  assert.equal(peak[2], 0);
});

test("both lines infected at once: each curtain carries its own flow, and the fungus saves and loads its links by line", () => {
  const make = () =>
    new Game(oneWorldOnLines(3, generateWorld(3), [[0], [1]]), { autoFound: false, fungus: { hyphae: true, flow: true } }, mulberry32(5), [
      { antCount: 40, line: 0 },
      { antCount: 40, line: 1 },
    ]);
  const g = make();
  g.land(0, garden, { evolve: true });
  for (let t = 0; t < 30; t++) g.tick(1 / 30);
  // a second patch of the same fungus at the other line's hole, so hyphae cross down both
  const nest = g.colonies[1]!.layers[0]!.nest;
  g.fungus.root(nest.x + nest.r + 1, nest.y, 3, 0, { x: nest.x, y: nest.y });
  const peak = [0, 0, 0];
  for (let t = 0; t < 200 * 30; t++) {
    g.tick(1 / 30);
    if (t % 30 === 0) for (const l of [1, 2]) peak[l] = Math.max(peak[l]!, g.fungus.hyphaeOn(l)?.loaded ?? 0);
  }
  assert.ok(peak[1]! > 0 && peak[2]! > 0, `mass flowed down both curtains (peaks ${peak[1]}, ${peak[2]})`);
  // each curtain's own mass grows its own mat: with every link taken for every curtain, the second line's stays at its 2 shaft hyphae
  const mats = [1, 2].map((l) => g.fungus.hyphaeOn(l)?.length ?? 0);
  assert.ok(mats[0]! > 8 && mats[1]! > 8, `both curtains grew a mat (hyphae ${mats[0]} on layer 1, ${mats[1]} on layer 2)`);
  const saved = JSON.parse(JSON.stringify(g.fungus.saveState())) as { linkLayers?: number[] };
  assert.ok(saved.linkLayers?.includes(1) && saved.linkLayers.includes(2), "the links of both lines are saved with their curtain");
  const fresh = make();
  fresh.land(0, garden, { evolve: true });
  fresh.fungus.loadState(saved as never);
  assert.equal(JSON.stringify(fresh.fungus.saveState()), JSON.stringify(saved), "and load back as they were");
});
