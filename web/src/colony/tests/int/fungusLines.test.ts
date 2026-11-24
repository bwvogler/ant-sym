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
