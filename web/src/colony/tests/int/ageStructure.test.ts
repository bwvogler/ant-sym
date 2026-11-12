import { test } from "node:test";
import assert from "node:assert/strict";
import { LIFESPAN, MIDDLE, YOUNG } from "../../colony.ts";
import { Game } from "../../game.ts";
import { GENERIC_ANT, type Species } from "../../species.ts";
import { generateSideWorld, generateWorld, mulberry32 } from "../../world.ts";
import { SMALL_SIDE } from "../builders.ts";

// The age structure is a species' to set (docs/species.md step 5, ja-fnd.5.3.6): a worker's mean lifespan, the age bands as shares of it, and whether
// a colony with no queen (a plane colony) ages out. The generic ant's defaults are the constants it always had, so its goldens do not move.

const short: Species = {
  ...GENERIC_ANT,
  id: "short",
  params: { lifespan: 100, youngShare: 0.2, middleShare: 0.5, mortalWithoutQueen: true },
};

test("the age bands are shares of the species' lifespan", () => {
  const side = (species?: Species) =>
    new Game(generateSideWorld(2, SMALL_SIDE), { antCount: 20, rival: false, ...(species ? { species } : {}) }, mulberry32(4)).player;
  const g = side();
  const s = side(short);
  assert.equal(g.params.lifespan, LIFESPAN);
  assert.equal(g.params.youngShare, YOUNG);
  assert.equal(g.params.middleShare, MIDDLE);
  // 15 s old: young for a species whose lifespan is 100 s and whose young band is below 20 s ... and for none of the generic ant's 3,600 s.
  g.age[0] = 15;
  s.age[0] = 15;
  assert.equal(g.band(0), 0, "15 s of 3,600 s is young");
  assert.equal(s.band(0), 0, "15 s of 100 s is below the young share (20 s)");
  s.age[0] = 30;
  assert.equal(s.band(0), 1, "30 s is middle-aged for it (20-50 s)");
  g.age[0] = 30;
  assert.equal(g.band(0), 0, "and still young for the generic ant");
  s.age[0] = 60;
  assert.equal(s.band(0), 2, "60 s is old for it");
  assert.ok(
    s.alive.some((a) => a),
    "there are ants to check",
  );
  // Its workers' own lifespans are 0.7-1.3x the species' mean.
  for (let i = 0; i < s.n; i++) if (s.alive[i]) assert.ok(s.lifespan[i]! >= 70 && s.lifespan[i]! <= 130, `lifespan ${s.lifespan[i]}`);
});

test("a colony with no queen (the plane) does not age out unless its species says so", () => {
  const plane = (species?: Species) =>
    new Game(generateWorld(1, { size: { w: 120, h: 80 } }), { antCount: 20, rivalAnts: 20, ...(species ? { species } : {}) }, mulberry32(3))
      .player;
  const g = plane();
  assert.ok(!g.queen, "a plane colony has no queen");
  for (let i = 0; i < g.n; i++) if (g.alive[i]) assert.equal(g.lifespan[i], Infinity, "the generic ant never ages out there");
  const s = plane(short);
  assert.ok(g.alive.some((a) => a) && s.alive.some((a) => a), "there are ants to check");
  for (let i = 0; i < s.n; i++) if (s.alive[i]) assert.ok(Number.isFinite(s.lifespan[i]!) && s.lifespan[i]! >= 70 && s.lifespan[i]! <= 130);
});
