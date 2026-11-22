import { ANT_FIELDS } from "../../ants.ts";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLONY_SKIP, COLONY_STATE, CURTAIN, LAYER_STATE, PLANE, type Layer } from "../../colony.ts";
import { Game, gameRng } from "../../game.ts";
import { STRAINS } from "../../fungus.ts";
import { CRUST, generateOneWorld } from "../../oneWorld.ts";
import { encode } from "../../save.ts";
import { centreX, centreY } from "../../hex.ts";
import { mulberry32 } from "../../world.ts";
import { run, smallOne } from "../builders.ts";

// Saving a game (ja-lo8.6): what each part saves, held to the code's own lists, so a new field cannot be lost on load. That a
// restored game runs on bit-identical to the unbroken one is int/oneWorldSave's (S2.3c: the side and top-down run-on tests went).

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

/** A game on a small one world. That a save runs on exactly as the unbroken game, and on a fight death's tick, is int/oneWorldSave's. */
function build(seed: number): Game {
  return new Game(smallOne(seed), { antCount: 200, rivalAnts: 200, regrow: 600 }, mulberry32(seed * 7919));
}

test("a save of another version is refused", () => {
  const g = build(2);
  const s = g.save();
  assert.throws(() => build(2).load({ ...s, version: s.version + 1 }), /version/);
});

test("what a colony saves: its public properties in `fields`, COLONY_STATE in `private`, and nothing it names as code or rebuilt on load", () => {
  // The colony's former #private fields are plain members now (docs/refactor.md S3.2). A property the colony gains is saved with the public fields by
  // default (so a new field cannot be lost on load, as tired, holdsBrood and cameFrom were in PR #42's review, S1); COLONY_STATE keeps the older
  // state that is written by name in `private` and restored in place; COLONY_SKIP names what is code, wired again by the Game, or the random stream.
  // That the restore is complete is the run-on tests' job (a loaded game runs on as if never saved): this one holds the lists to each other.
  const g = build(2);
  const c0 = g.colonies[0]!;
  const saved = Object.keys(c0.saveState().private as object);
  const fields = Object.keys(c0.saveState().fields as object);
  assert.deepEqual(
    Object.keys(ANT_FIELDS)
      .filter((k) => !fields.includes(k))
      .sort(),
    [],
    "an ants.ts array not saved with the public fields",
  );
  assert.deepEqual([...saved].sort(), [...COLONY_STATE].sort(), "`private` is COLONY_STATE");
  // The public properties a save writes into `fields` by default, pinned: a new property of the colony that holds a reference (a map, a cache, the
  // game) would otherwise be written into every save and poured back on load. Adding one is an edit here, or to COLONY_SKIP when it is code or rebuilt.
  const SAVED_FIELDS = [
    "alates",
    "births",
    "brood",
    "broodKilled",
    "broodStarved",
    "buried",
    "carriedDown",
    "carriedUp",
    "corpses",
    "crossedDown",
    "crossedUp",
    "decisions",
    "diedHot",
    "diedHungry",
    "diedOld",
    "drawSalt",
    "eaten",
    "finds",
    "flights",
    "flown",
    "founding",
    "gateHeld",
    "gynes",
    "gynesCulled",
    "handedOn",
    "inNest",
    "incipient",
    "larder",
    "looseBack",
    "looseDown",
    "looseDropped",
    "looseFilled",
    "looseLost",
    "loosePicked",
    "losses",
    "midden",
    "moundLost",
    "n",
    "nestOdour",
    "odourAim",
    "outside",
    "params",
    "ph",
    "plume", // the food plume (ja-rf5.4): built at fixed times, so a loaded game must have it as built
    "plumeEpoch",
    "plumeFood",
    "portTrips",
    "queen",
    "raidScouts",
    "raidable",
    "recruits",
    "remains",
    "seen",
    "soilDug",
    "soilFilled",
    "soilLost",
    "soilOut",
    "stored",
    "time",
  ];
  assert.deepEqual(
    fields.filter((k) => !(k in ANT_FIELDS)).sort(),
    SAVED_FIELDS,
    "the colony's saved public properties changed: name the new one here, or in COLONY_SKIP",
  );
  // What is code, wired again or the random stream is never saved, whatever a game has in it: `own` is null in this game, so it is held by name.
  for (const k of ["rng", "own"]) assert.ok(COLONY_SKIP.has(k), `${k} is skipped by name`);
  const own = Object.keys(c0);
  assert.ok(own.length > 120, `found the colony's properties (${own.length})`);
  for (const k of COLONY_STATE) assert.ok(own.includes(k), `${k} is a property of the colony`);
  assert.deepEqual(
    fields.filter((k) => COLONY_SKIP.has(k)),
    [],
    "a property named as code or rebuilt is also saved",
  );
  assert.deepEqual(
    own.filter((k) => !fields.includes(k) && !COLONY_SKIP.has(k)),
    [],
    "a property that nothing saves",
  );
});

test("every Layer key is saved per layer (LAYER_STATE) or built again: by the constructor and the world, or wired by the game", () => {
  // A colony keeps the bound layer's state in its own fields and every other layer's in that layer's slots (one world):
  // a key that carries state from tick to tick and is not in LAYER_STATE would be lost on the plane at every load.
  const src = readFileSync(new URL("../../colony.ts", import.meta.url), "utf8");
  const start = src.indexOf("export interface Layer {");
  const body = src.slice(start, src.indexOf("\n}\n", start));
  const declared = [...body.matchAll(/^ {2}(?:readonly )?(\w+):/gm)].map((m) => m[1]!);
  const built = ["map", "nest", "entrance", "entranceCol", "entranceRow"]; // the constructor, from the world
  const wired = ["enemies", "nestmates", "friends", "foreign", "raidMarks", "raidTarget", "raidNest", "others"]; // Game.#wire, #aimAt
  assert.equal(declared.length, 19, `found the declarations (${declared.join(", ")})`);
  assert.deepEqual(
    [...declared].sort(),
    [...LAYER_STATE, ...built, ...wired].sort(),
    "every key is saved or built again, and no key is both",
  );
});

test("a one-world colony's save holds every layer's own state, and the fungus's every map's spores: loaded into a fresh game, each reads as it was", () => {
  const world = () => generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } });
  const g = new Game(world(), { antCount: 40, rivalAnts: 40 }, gameRng(7));
  const h = g.player.holeCells[g.player.params.nest]!;
  g.fungus.paint([], centreX(h.col, CRUST + 3), centreY(CRUST + 3), 2, 3, 0, GARDEN, CURTAIN);
  run(g, 20);
  const fresh = new Game(world(), { antCount: 40, rivalAnts: 40 }, gameRng(7));
  const layerState = (L: Layer) => JSON.stringify(Object.fromEntries(LAYER_STATE.map((k) => [k, encode(L[k])])));
  g.colonies.forEach((c, k) => {
    const s = JSON.parse(JSON.stringify(c.saveState())) as { layers?: unknown[] };
    assert.equal(s.layers?.length, 2, "two layers saved");
    assert.equal(s.layers![CURTAIN], null, "the bound layer's (home) is in its fields");
    assert.ok(c.layers[PLANE]!.ph.total("home") > 0, "the plane has trails (the test's own check)");
    const into = fresh.colonies[k]!;
    assert.notEqual(layerState(into.layers[PLANE]!), layerState(c.layers[PLANE]!), "a fresh game's plane differs (the test's own check)");
    into.loadState(s as Record<string, unknown>);
    for (const l of [PLANE, CURTAIN]) assert.equal(layerState(into.layers[l]!), layerState(c.layers[l]!), `colony ${k}, layer ${l}`);
  });
  const spores = JSON.parse(JSON.stringify(g.fungus.saveState())) as Record<string, unknown>;
  assert.equal((spores.layers as unknown[]).length, 1, "the curtain's spores, past layer 0's");
  assert.ok(g.fungus.sporeCells > 0);
  fresh.fungus.loadState(spores);
  assert.deepEqual(JSON.parse(JSON.stringify(fresh.fungus.saveState())), spores);
  assert.equal(fresh.fungus.sporeCells, g.fungus.sporeCells);
  // A colony saved with another layer bound is another game's: refused, not poured over the wrong layer.
  const s = g.player.saveState();
  assert.throws(() => fresh.player.loadState({ ...s, private: { ...(s.private as object), cur: PLANE } }), /layer 0 bound/);
});

test("the game's save holds every private field it declares, or the field is built again on load", () => {
  // As for Colony and Fungus: a new #field in Game must be saved, or named here as rebuilt on load. Public fields are
  // saved by name in Game.save, and one is left out on purpose: `lastLoss`, the page's notice of the last queen lost,
  // which nothing in play reads (#63's review, N2).
  const src = readFileSync(new URL("../../game.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export class Game "));
  const declared = new Set<string>();
  for (const m of body.matchAll(/^ {2}(?:readonly )?#(\w+)(?!\w|\()/gm)) declared.add(m[1]!);
  const inPrivate = ["fightDeaths", "lastFightDeath", "metBy", "haveMet", "nextRivalCheck", "regrowClock", "rng", "regrowRng"];
  // The occupancy grids and every layer's recognition bands are GameSave.grids (layer 0's recognition is `recognition` too).
  const inGrids = ["grids", "recs"];
  const derived = ["piles"]; // the food piles as the world began: from the fresh world
  const fromPage = ["choice"]; // the Lab's setChoice (ja-nan3): not saved, the page sets it again on every game, a load included
  assert.deepEqual(
    [...declared].sort(),
    [...inPrivate, ...inGrids, ...derived, ...fromPage].sort(),
    "every declared #field is accounted for",
  );
  const s = build(2).save();
  assert.deepEqual(Object.keys(s.private).sort(), [...inPrivate].sort());
  assert.deepEqual(Object.keys(s.grids).sort(), ["bands", "counts"]);
});
