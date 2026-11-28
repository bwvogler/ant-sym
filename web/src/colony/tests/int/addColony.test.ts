import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { driftAimVec, driftDirection, odourVector } from "../../recognition.ts";
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
  const g = new Game(smallOne(), {}, mulberry32(11), [{ antCount: 120 }]);
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
  const g = new Game(smallOne(), {}, mulberry32(11), [{ antCount: 120 }, { antCount: 120 }]);
  run(g, 2);
  g.addColony({ ...beyondStart(g), antCount: 30, odour: 0 });
  assert.equal(g.colonies[0]!.others.length, 2, "the other colonies know its nest");
  const c = g.colonies[2]!;
  for (let i = 0; i < c.n; i++) c.alive[i] = 0;
  if (c.queen) c.queen.alive = false;
  assert.ok(Game.beaten(c), "the founded colony is beaten");
  assert.equal(g.fallen(), -1);
  assert.notEqual(g.outcome(), "fallen");
});

test("a daughter founded at four odour axes aims along the hashed direction from her landing, and another site aims another way (S2, ja-zg1u.4)", () => {
  const g = new Game(smallOne(), {}, mulberry32(11), [{ antCount: 120 }]);
  run(g, 3);
  assert.equal(g.recognition.params.odourAxes, 4);
  const from = [0.2, 0.3, 0.4, 0.5];
  const at = beyondStart(g);
  const k = g.addColony({ ...at, antCount: 30, odour: from, mother: 0 });
  const c = g.colonies[k]!;
  const want = driftAimVec(odourVector(from, 4), g.recognition.params.tolerance, driftDirection(g.world!.seed, at.x, at.y, 4));
  assert.deepEqual([...c.aimVec], [...want], "the aim is the helper's, from her landing");
  assert.ok(
    want.some((v, i) => Math.abs(v - from[i]!) > 1e-6),
    "and it is not her mother's odour",
  );
  const other = driftDirection(g.world!.seed, at.x + 60, at.y, 4);
  assert.notDeepEqual([...other], [...driftDirection(g.world!.seed, at.x, at.y, 4)], "another landing, another direction");
});
