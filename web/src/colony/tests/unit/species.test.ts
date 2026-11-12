import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_GAME, Game } from "../../game.ts";
import { generateWorld, mulberry32 } from "../../world.ts";
import { MODE_WORDS, STANCE_WORDS } from "../../colonyBrain.ts";
import { localResponses } from "../../responses.ts";
import { GENERIC_ANT, SPECIES, speciesById, type Species } from "../../species.ts";

// The generic ant is a species that changes nothing (docs/species.md step 1): a game that names no species plays today's ant.

test("the generic ant overrides no parameter and reuses the local responses themselves", () => {
  assert.deepEqual(GENERIC_ANT.params, {});
  assert.equal(GENERIC_ANT.responses, localResponses, "Colony compares its response functions by identity");
  assert.equal(GENERIC_ANT.lanes.mode, MODE_WORDS, "the generic ant asks under the words the brains have always had");
  assert.equal(GENERIC_ANT.lanes.stance, STANCE_WORDS);
  assert.equal(DEFAULT_GAME.species, GENERIC_ANT, "a game plays the generic ant unless it names another");
});

test("a species' parameters and responses reach every colony of the game, and a game's own settings still win", () => {
  const mine = { ...localResponses, trailRate: () => 0 };
  const quick: Species = { id: "quick", name: "Quick", params: { speed: 9.5, patience: 77 }, responses: mine, lanes: {} };
  const world = generateWorld(1, { size: { w: 120, h: 80 } });
  const g = new Game(world, { antCount: 10, rivalAnts: 10, species: quick }, mulberry32(3));
  for (const c of g.colonies) {
    assert.equal(c.params.speed, 9.5);
    assert.equal(c.params.patience, 77);
    assert.equal(c.responses, mine);
  }
  // An explicit setting (an experiment's override) beats the species', for the rival as for the player.
  const h = new Game(world, { antCount: 10, rivalAnts: 10, species: quick }, mulberry32(3), { colony: { speed: 4 }, rival: { speed: 5 } });
  assert.equal(h.player.params.speed, 4);
  assert.equal(h.player.params.patience, 77);
  assert.equal(h.rival!.params.speed, 5);
  assert.equal(h.rival!.params.patience, 77);
  // The generic game is untouched.
  const d = new Game(world, { antCount: 10, rivalAnts: 10 }, mulberry32(3));
  assert.notEqual(d.player.params.speed, 9.5);
  assert.equal(d.player.responses, localResponses);
  assert.equal(d.rival!.responses, localResponses);
});

test("a colony founded mid-game is of the game's species, and a species' maxAnts sizes it", () => {
  const mine = { ...localResponses, trailRate: () => 0 };
  const small: Species = { id: "small", name: "Small", params: { speed: 9.5, maxAnts: 31 }, responses: mine, lanes: {} };
  const world = generateWorld(1, { size: { w: 160, h: 100 } });
  const g = new Game(world, { antCount: 10, rivalAnts: 10, species: small }, mulberry32(3));
  const at = g.addColony({ x: 80, y: 50, antCount: 5, odour: 0.5 });
  const c = g.colonies[at]!;
  assert.equal(c.responses, mine);
  assert.equal(c.params.speed, 9.5);
  assert.equal(c.params.maxAnts, 31, "the species' own size, not 1.5 x the game's");
  const generic = new Game(world, { antCount: 10, rivalAnts: 10 }, mulberry32(3));
  assert.equal(generic.colonies[generic.addColony({ x: 80, y: 50, antCount: 5, odour: 0.5 })]!.responses, localResponses);
});

test("a loaded game keeps the species it was built with: the save holds no functions, and a colony founded after a load still runs", () => {
  const world = () => generateWorld(1, { size: { w: 160, h: 100 } });
  const a = new Game(world(), { antCount: 10, rivalAnts: 10 }, mulberry32(3));
  for (let k = 0; k < 30; k++) a.tick(1 / 30);
  const saved = JSON.parse(JSON.stringify(a.save())) as ReturnType<Game["save"]>;
  assert.equal((saved.params as { species?: unknown }).species, undefined, "the species is code, not saved");
  const b = new Game(world(), { antCount: 10, rivalAnts: 10 }, mulberry32(3));
  b.load(saved);
  assert.equal(b.params.species, GENERIC_ANT);
  const c = b.colonies[b.addColony({ x: 80, y: 50, antCount: 5, odour: 0.5 })]!;
  assert.equal(c.responses, localResponses);
  for (let k = 0; k < 10; k++) b.tick(1 / 30);
});

test("a save carries the species it was played with, and a game of another species refuses it", () => {
  const quick: Species = { id: "quick", name: "Quick", params: { speed: 9.5 }, responses: localResponses, lanes: {} };
  const world = () => generateWorld(1, { size: { w: 160, h: 100 } });
  const make = (species?: Species) => new Game(world(), { antCount: 10, rivalAnts: 10, ...(species ? { species } : {}) }, mulberry32(3));
  const fast = make(quick);
  for (let k = 0; k < 20; k++) fast.tick(1 / 30);
  const saved = JSON.parse(JSON.stringify(fast.save())) as ReturnType<Game["save"]>;
  assert.equal(saved.species, "quick");
  assert.equal(JSON.parse(JSON.stringify(make().save())).species, "generic");
  // The same species reads it and plays on; another is refused with a reason.
  const again = make(quick);
  again.load(JSON.parse(JSON.stringify(saved)));
  assert.equal(again.params.species, quick);
  for (let k = 0; k < 5; k++) again.tick(1 / 30);
  const before = again.time;
  assert.throws(() => make().load(JSON.parse(JSON.stringify(saved))), /species "quick".*plays "generic"/);
  assert.throws(() => again.load(JSON.parse(JSON.stringify(make().save()))), /species "generic".*plays "quick"/);
  assert.equal(again.time, before, "a refused load leaves the game as it was");
});

test("the species the page names by id: the generic ant is known, an unknown id is an error", () => {
  assert.equal(speciesById("generic"), GENERIC_ANT);
  assert.equal(SPECIES.generic, GENERIC_ANT);
  assert.throws(() => speciesById("nope"), /no "nope"/);
  for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])
    assert.throws(() => speciesById(id), /no ".+" here/, `${id} is not a species`);
});
