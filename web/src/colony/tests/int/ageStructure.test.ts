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
  // 15 s old is young for a species with a 100 s lifespan (its young band runs to 20 s), and for the generic ant too (its band runs to 540 s).
  g.age[0] = 15;
  s.age[0] = 15;
  assert.equal(g.band(0), 0, "15 s of 3,600 s is young");
  assert.equal(s.band(0), 0, "15 s of 100 s is below the young share (20 s)");
  s.age[0] = 30;
  assert.equal(s.band(0), 1, "30 s is middle-aged for it (20-50 s)");
  g.age[0] = 30;
  assert.equal(g.band(0), 0, "and still young for the generic ant");
  s.age[0] = 40;
  assert.equal(s.band(0), 1, "40 s is still middle-aged for it (0.4 of 100 s is below its 0.5 share; the generic 0.35 would call it old)");
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

test("a queenless colony of a species that says so ages out and is replaced from the larder; the generic ant's workers stay as they were", () => {
  const run = (species?: Species) => {
    const g = new Game(
      generateWorld(1, { size: { w: 120, h: 80 } }),
      { antCount: 20, rivalAnts: 20, rival: false, ...(species ? { species } : {}) },
      mulberry32(3),
    );
    const c = g.player;
    const first = Array.from(c.alive).filter(Boolean).length;
    for (let k = 0; k < 30 * 240; k++) {
      g.tick(1 / 30);
      c.feed(0.05); // food comes in, so the dead can be replaced
    }
    return { c, first };
  };
  const s = run(short);
  assert.ok(s.c.diedOld >= s.first, `its workers aged out (${s.c.diedOld} died of age, ${s.first} at the start)`);
  assert.ok(
    s.c.alive.some((a) => a),
    "and the larder replaced them",
  );
  const g = run();
  assert.equal(g.c.diedOld, 0, "the generic ant's do not age out on the plane");
  for (let i = 0; i < g.c.n; i++) if (g.c.alive[i]) assert.equal(g.c.age[i], 0, "nor age at all");
});
