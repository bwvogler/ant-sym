import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { mulberry32 } from "../../world.ts";
import { run, smallOne } from "../builders.ts";

// Several colonies at runtime (ja-lo8.8): a colony founded mid-game digs its own nest, has its own queen and takes part in the game
// like the world's own colonies. Where it founds, its hole and shaft, its ants and its save are in oneWorldFounding and oneWorldSave;
// what is left here is the rival-off case and the outcome.

/** A spot on the plane 20 px beyond the line's first hole, V₀: a founding there grows the line at its start. */
function beyondStart(g: Game) {
  const v = g.world!.line.holes[0]!;
  return { x: centreX(v.x, v.y) - 20, y: centreY(v.y) };
}

test("with the rival off, a founded colony takes the nest it dug, not the world's unused second nest", () => {
  const g = new Game(smallOne(), { antCount: 120, rival: false }, mulberry32(11));
  run(g, 5);
  const curtain = g.world!.curtain;
  const at = beyondStart(g);
  const k = g.addColony({ ...at, antCount: 30, odour: 0 });
  assert.equal(k, 1);
  const c = g.colonies[1]!;
  assert.equal(c.params.nest, curtain.nests.length - 1, "its own nest's index");
  assert.notEqual(c.nest, curtain.nests[1], "not the world's second nest");
  const h = c.holeCells[c.params.nest]!;
  cellOf(at.x, at.y);
  assert.deepEqual([h.px, h.py], [CELL[0], CELL[1]], "its hole on the plane where it was founded");
  assert.ok(c.queen && Math.abs(c.queen.x - c.nest.entrance!.x) < 40, "its queen under its own hole");
  const royals = curtain.chambers!.list.filter((r) => r.role === "royal" && r.colony === c.params.nest);
  assert.equal(royals.length, 1, "one royal chamber of its own");
  run(g, 20);
  assert.ok(c.population > 0);
});

test("a founded colony that falls does not end the game; the world's own colonies still do", () => {
  const g = new Game(smallOne(), { antCount: 120, rivalAnts: 120 }, mulberry32(11));
  run(g, 2);
  g.addColony({ ...beyondStart(g), antCount: 30, odour: 0 });
  const c = g.colonies[2]!;
  for (let i = 0; i < c.n; i++) c.alive[i] = 0;
  if (c.queen) c.queen.alive = false;
  assert.ok(Game.beaten(c), "the founded colony is beaten");
  assert.equal(g.fallen(), -1);
  assert.notEqual(g.outcome(), "fallen");
});
