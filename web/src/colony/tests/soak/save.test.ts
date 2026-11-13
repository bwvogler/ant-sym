import { ANT_FIELDS } from "../../ants.ts";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLONY_SKIP, COLONY_STATE, CURTAIN, LAYER_STATE, PLANE, type Layer } from "../../colony.ts";
import { Game, gameRng, type GameSave } from "../../game.ts";
import { gridsFromLiving, hashGame } from "../saveHash.ts";
import { STRAINS } from "../../fungus.ts";
import { CRUST, generateOneWorld } from "../../oneWorld.ts";
import { encode } from "../../save.ts";
import { centreX, centreY } from "../../hex.ts";
import { generateSideWorld, generateWorld, mulberry32, OPEN_WORLD, type WorldMap } from "../../world.ts";
import { DT, run } from "../builders.ts";

// Saving a game (ja-lo8.6): run, save, restore into a game built afresh from the same world and settings, run on. The
// result must be bit-identical to the unbroken run: every typed array of every colony, every scent and map layer, the
// fungus's spores, the brood and the chambers. A field the save misses shows up here as a hash that differs.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

function build(view: "side" | "top", seed: number): Game {
  const map: WorldMap = view === "side" ? generateSideWorld(seed) : generateWorld(seed, { ...OPEN_WORLD, size: { w: 160, h: 100 } });
  return new Game(map, { antCount: 200, rivalAnts: 200, regrow: 600 }, mulberry32(seed * 7919));
}

for (const view of ["side", "top"] as const)
  test(`a save restored into a fresh game runs on exactly as the unbroken game (${view} view, the fungus landed)`, () => {
    const whole = build(view, 3);
    whole.land(0, GARDEN, { evolve: true }); // as the page lands: the fungus's body and evolution are saved too (ja-lo8.12)
    run(whole, 40);
    const before = hashGame(whole);
    run(whole, 20);
    const unbroken = hashGame(whole);

    const first = build(view, 3);
    first.land(0, GARDEN, { evolve: true });
    run(first, 40);
    assert.equal(hashGame(first), before, "the same game, the same state (the test's own check)");
    const saved = JSON.parse(JSON.stringify(first.save())) as GameSave;

    const again = build(view, 3);
    again.load(saved);
    assert.equal(hashGame(again), before, "restored: the state as saved");
    // Every field the save holds was put back: saving the restored game gives the same save, field for field (a field
    // a load drops shows here even when it changes nothing for a while).
    const resaved = JSON.parse(JSON.stringify(again.save())) as GameSave;
    for (const k of Object.keys(saved) as (keyof GameSave)[]) assert.deepEqual(resaved[k], saved[k], `save field ${k}`);
    run(again, 20);
    assert.equal(hashGame(again), unbroken, "run on: as if never saved");
    assert.ok(again.landed, "it remembers where the fungus landed");
    // The fungus is still in the game: its patch sporulating, and fungus grown in hosts so far (a weak start may have no
    // host at this moment: the colony grooms it out of the nest).
    assert.ok(again.fungus.sporeCells > 0 && (again.fungus.evolution?.growth ?? 0) > 0);
  });

/**
 * Run g a tick at a time until a tick has a fight death (Unity.deathsPerMinute rises: it only fades otherwise), at most
 * `seconds`; returns whether one did.
 */
function runToFightDeath(g: Game, seconds: number): boolean {
  let last = g.unity().deathsPerMinute;
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    g.tick(DT);
    const d = g.unity().deathsPerMinute;
    if (d > last) return true;
    last = d;
  }
  return false;
}

/**
 * The game of the fight-tick test: the top-down map's two colonies meet within seconds; in the side view a stranger
 * colony is founded by the first's hole (`found`: a game a save is loaded into re-founds it from the save).
 */
function fighting(view: "side" | "top", found = true): Game {
  if (view === "top") return build("top", 3);
  const g = new Game(generateSideWorld(3), { antCount: 60, rivalAnts: 60, regrow: 600 }, mulberry32(3 * 7919));
  const e = g.player.nest.entrance!;
  if (found) g.addColony({ x: e.x + 24, y: e.y, antCount: 40, odour: 1 });
  return g;
}

for (const view of ["side", "top"] as const)
  test(`a save on a tick with a fight death runs on exactly (${view} view): the grids and bands are saved, not built again`, () => {
    // Game.tick builds the occupancy grids and recognition bands before fights, and the next tick's steps read them, the
    // ants killed since included. A load that built them again from the living diverged on the first tick (U4b).
    const whole = fighting(view);
    assert.ok(runToFightDeath(whole, 30), "a fight death within 30 s (the test's own check)");
    const saved = JSON.parse(JSON.stringify(whole.save())) as GameSave;
    const at = hashGame(whole);
    whole.tick(DT);
    const next = hashGame(whole);
    run(whole, 3);
    const unbroken = hashGame(whole);

    const again = fighting(view, false);
    again.load(saved);
    assert.equal(hashGame(again), at, "restored: the state as saved");
    again.tick(DT);
    assert.equal(hashGame(again), next, "the first tick after: as unbroken");
    run(again, 3);
    assert.equal(hashGame(again), unbroken, "run on: as if never saved");

    // With the grids built again from the living (as a load did before U4b) the same save diverges: this tick really is
    // one that needs them.
    const twin = fighting(view, false);
    twin.load(saved);
    const rebuilt = fighting(view, false);
    rebuilt.load({ ...saved, grids: gridsFromLiving(twin) });
    rebuilt.tick(DT);
    run(rebuilt, 3);
    assert.notEqual(hashGame(rebuilt), unbroken, "rebuilt from the living, the run differs");
  });

test("a save of another version is refused", () => {
  const g = build("top", 2);
  const s = g.save();
  assert.throws(() => build("top", 2).load({ ...s, version: s.version + 1 }), /version/);
});

test("what a colony saves: its public properties in `fields`, COLONY_STATE in `private`, and nothing it names as code or rebuilt on load", () => {
  // The colony's former #private fields are plain members now (docs/refactor.md S3.2). A property the colony gains is saved with the public fields by
  // default (so a new field cannot be lost on load, as tired, holdsBrood and cameFrom were in PR #42's review, S1); COLONY_STATE keeps the older
  // state that is written by name in `private` and restored in place; COLONY_SKIP names what is code, wired again by the Game, or the random stream.
  // That the restore is complete is the run-on tests' job (a loaded game runs on as if never saved): this one holds the lists to each other.
  const g = build("side", 2);
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
  const inPrivate = ["fightDeaths", "lastFightDeath", "metBy", "haveMet", "nextStrategy", "regrowClock", "rng", "regrowRng"];
  // The occupancy grids and every layer's recognition bands are GameSave.grids (layer 0's recognition is `recognition` too).
  const inGrids = ["grids", "recs"];
  const derived = ["piles"]; // the food piles as the world began: from the fresh world
  assert.deepEqual([...declared].sort(), [...inPrivate, ...inGrids, ...derived].sort(), "every declared #field is accounted for");
  const s = build("top", 2).save();
  assert.deepEqual(Object.keys(s.private).sort(), [...inPrivate].sort());
  assert.deepEqual(Object.keys(s.grids).sort(), ["bands", "counts"]);
});

test("a single-map save's shape: the game's keys with the grids, colony saves as fields and private, the fungus's keys, one layer of grids", () => {
  // A single-map game saves none of one world's parts (`world`, a colony's or the fungus's `layers`): held here by name.
  const game = [
    "colonies",
    "flights",
    "founded",
    "fungus",
    "grids",
    "landed",
    "map",
    "params",
    "private",
    "raids",
    "recognition",
    "regrown",
    "revealed",
    "species",
    "strategyChoices",
    "time",
    "version",
  ];
  const fungus = [
    "base",
    "clock",
    "corpses",
    "evolution",
    "hosts",
    "hyphae",
    "menu",
    "params",
    "rule",
    "sporeCells",
    "sporeStrain",
    "spores",
  ];
  for (const view of ["top", "side"] as const) {
    const g = build(view, 5);
    g.land(0, GARDEN, { evolve: true });
    run(g, 1);
    const s = g.save();
    assert.deepEqual(Object.keys(s).sort(), game, `${view}: the game's keys`);
    for (const c of s.colonies) assert.deepEqual(Object.keys(c).sort(), ["fields", "private"], `${view}: a colony's keys`);
    assert.deepEqual(Object.keys(s.fungus).sort(), fungus, `${view}: the fungus's keys`);
    assert.deepEqual(Object.keys(s.grids).sort(), ["bands", "counts"]);
    assert.equal(s.grids.counts.length, 1, `${view}: one layer`);
  }
});
