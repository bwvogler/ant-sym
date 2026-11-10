import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, SAVE_VERSION, type GameSave } from "../game.ts";
import { STRAINS } from "../fungus.ts";
import { generateSideWorld, generateWorld, mulberry32, OPEN_WORLD, type WorldMap } from "../world.ts";

// Saves made on main before one-world saves (U4b, ja-lp4.4.2): version 4, recorded at b3389a9 with
// SAVE_FIXTURE_WRITE=1, gzipped. Each must still load into a game built afresh from the same world and settings, run on
// and save again: the only proof that the saves players already have keep loading. They are not tied to a behaviour
// hash, so a change of behaviour never needs them recorded again; only a change of what a save holds would.

const DT = 1 / 30;
const GARDEN = STRAINS.findIndex((s) => s.id === "garden");
const VIEWS = ["top", "side"] as const;
type View = (typeof VIEWS)[number];

const fixture = (view: View) => new URL(`./fixtures/save-v4-${view}.json.gz`, import.meta.url);

/** The fixture's game as the page would build it again: the same world and settings (seed 5, 20 + 20 ants, regrowth on). */
function fixtureGame(view: View): Game {
  const map: WorldMap = view === "side" ? generateSideWorld(5) : generateWorld(5, { ...OPEN_WORLD, size: { w: 160, h: 100 } });
  return new Game(map, { antCount: 20, rivalAnts: 20, regrow: 600 }, mulberry32(5 * 7919));
}

function run(g: Game, seconds: number): void {
  for (let k = 0; k < Math.round(seconds / DT); k++) g.tick(DT);
}

if (process.env.SAVE_FIXTURE_WRITE)
  for (const view of VIEWS) {
    const g = fixtureGame(view);
    g.land(0, GARDEN, { evolve: true });
    // The side view's save also holds a colony founded mid-game (the lab's), between the two nests: its re-founding from the saved nest.
    if (view === "side") g.addColony({ x: 515, y: 58, antCount: 10, odour: 0 });
    run(g, 5);
    writeFileSync(fixture(view), gzipSync(JSON.stringify(g.save()), { level: 9 }));
  }

const read = (view: View) => JSON.parse(gunzipSync(readFileSync(fixture(view))).toString("utf8")) as GameSave;

/** Everything `expected` holds is in `actual`, the same (objects may have gained keys: version 5's are optional). */
function holds(actual: unknown, expected: unknown, path: string): void {
  if (expected !== null && typeof expected === "object") {
    assert.ok(actual !== null && typeof actual === "object", `${path}: an object`);
    if (Array.isArray(expected)) {
      assert.ok(Array.isArray(actual) && actual.length === expected.length, `${path}: ${expected.length} items`);
      expected.forEach((x, k) => holds((actual as unknown[])[k], x, `${path}[${k}]`));
    } else for (const [k, x] of Object.entries(expected)) holds((actual as Record<string, unknown>)[k], x, `${path}.${k}`);
  } else assert.equal(actual, expected, path);
}

for (const view of VIEWS)
  test(`a version-4 save from main (${view} view) loads as it was, runs on 5 s and saves again`, () => {
    const saved = read(view);
    assert.equal(saved.version, 4, "recorded on main, before U4b");
    assert.ok(!("grids" in saved));
    const g = fixtureGame(view);
    g.load(saved);
    assert.equal(g.time, saved.time);
    assert.equal(g.colonies.length, saved.colonies.length);
    // The migration from 4 changes nothing: saved again at once, it holds everything it held, as version 5 with the grids.
    const now = JSON.parse(JSON.stringify(g.save())) as GameSave;
    assert.equal(now.version, SAVE_VERSION);
    holds({ ...now, version: saved.version }, saved, "save");
    run(g, 5);
    assert.ok(g.time > saved.time + 4.9);
    assert.ok(g.colonies.every((c) => c.population > 0), "every colony still has ants");
    const again = JSON.parse(JSON.stringify(g.save())) as GameSave;
    assert.deepEqual(Object.keys(again).sort(), [...Object.keys(saved), "grids"].sort(), "the same keys, and the grids");
  });

test("a single-map save is version 4's shape, with the grids: colony saves are fields and private, the fungus's keys as they were", () => {
  for (const view of VIEWS) {
    const v4 = read(view);
    const g = fixtureGame(view);
    g.land(0, GARDEN, { evolve: true });
    run(g, 1);
    const s = g.save();
    assert.deepEqual(Object.keys(s).sort(), [...Object.keys(v4), "grids"].sort(), `${view}: the game's keys`);
    for (const c of s.colonies) assert.deepEqual(Object.keys(c).sort(), ["fields", "private"], `${view}: a colony's keys`);
    assert.deepEqual(Object.keys(s.fungus).sort(), Object.keys(v4.fungus).sort(), `${view}: the fungus's keys`);
    assert.deepEqual(Object.keys(s.grids!).sort(), ["bands", "counts"]);
    assert.equal(s.grids!.counts.length, 1, `${view}: one layer`);
  }
});
