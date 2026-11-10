import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, type GameSave } from "../game.ts";
import { hashGame } from "./saveHash.ts";
import { STRAINS } from "../fungus.ts";
import { generateSideWorld, generateWorld, mulberry32, OPEN_WORLD, type WorldMap } from "../world.ts";

// Saving a game (ja-lo8.6): run, save, restore into a game built afresh from the same world and settings, run on. The
// result must be bit-identical to the unbroken run: every typed array of every colony, every scent and map layer, the
// fungus's spores, the brood and the chambers. A field the save misses shows up here as a hash that differs.

const DT = 1 / 30;
const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

function build(view: "side" | "top", seed: number): Game {
  const map: WorldMap = view === "side" ? generateSideWorld(seed) : generateWorld(seed, { ...OPEN_WORLD, size: { w: 160, h: 100 } });
  return new Game(map, { antCount: 200, rivalAnts: 200, regrow: 600 }, mulberry32(seed * 7919));
}

function run(g: Game, seconds: number): void {
  for (let k = 0; k < Math.round(seconds / DT); k++) g.tick(DT);
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
    assert.ok(runToFightDeath(whole, 20), "a fight death within 20 s (the test's own check)");
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

    // Without the grids (as a version-4 save loads) the same save diverges: this tick really is one that needs them.
    const rebuilt = fighting(view, false);
    rebuilt.load({ ...saved, grids: undefined });
    rebuilt.tick(DT);
    run(rebuilt, 3);
    assert.notEqual(hashGame(rebuilt), unbroken, "rebuilt from the living, the run differs");
  });

test("a save of another version is refused", () => {
  const g = build("top", 2);
  const s = g.save();
  assert.throws(() => build("top", 2).load({ ...s, version: s.version + 1 }), /version/);
});

test("a colony's save holds every private field it declares (but its random stream, the game's)", () => {
  // The save's private list is written out by hand: a field left off it would lose its value on every load, and the
  // restored game would only show it once that field mattered (PR #42 review, S1: tired, holdsBrood and cameFrom each
  // slipped past the run-on test). So: every `#field` declared in Colony, and nothing else, is saved.
  const src = readFileSync(new URL("../colony.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export class Colony "));
  const declared = new Set<string>();
  for (const m of body.matchAll(/^ {2}(?:readonly )?#(\w+)(?!\w|\()/gm)) declared.add(m[1]!);
  declared.delete("rng");
  const g = build("side", 2);
  const saved = Object.keys(g.colonies[0]!.saveState().private as object);
  assert.ok(declared.size > 50, `found the declarations (${declared.size})`);
  assert.deepEqual([...declared].filter((k) => !saved.includes(k)).sort(), [], "declared but not saved");
  assert.deepEqual(saved.filter((k) => !declared.has(k)).sort(), [], "saved but not declared");
});
