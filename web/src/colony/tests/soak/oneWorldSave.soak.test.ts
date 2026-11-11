// The long games of oneWorldSave.test.ts (split out so no file nears the 60 s per-file limit on CI, ja-6mj); the quick tests are in oneWorldSave.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE } from "../../colony.ts";
import { STRAINS } from "../../fungus.ts";
import { Game, gameRng, type GameSave } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { hashGame } from "../saveHash.ts";

// One-world saves (U4b, ja-lp4.4.2; docs/one-world.md §4): run, save, load into a game built afresh from the same seed
// and options, run on. The result must hash as the unbroken run on both layers: the plane, the curtain as dug and grown,
// the line, every colony's scent on each layer, the fungus on each map, the grids and bands. Saving the loaded game must
// give the same save, field for field. The mutations (oneWorldSaveMutations.test.ts) show each part is needed.

const DT = 1 / 30;
const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

/** Seed 7's small plane (160 × 100): two nests well inside it, quick to run. */
const small = (ants = 60, autoFound = true): Game => new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), { antCount: ants, rivalAnts: ants, autoFound }, gameRng(7));

const ticks = (g: Game, n: number): void => {
  for (let k = 0; k < n; k++) g.tick(DT);
};
const run = (g: Game, seconds: number): void => ticks(g, Math.round(seconds / DT));
const copy = (s: GameSave): GameSave => JSON.parse(JSON.stringify(s)) as GameSave;

/**
 * Run g a tick at a time until a tick kills an ant in a fight on layer `layer` (a rise in Unity.deathsPerMinute, with an
 * ant on that layer dead in it), at most `seconds`; returns whether one did.
 */
function toFightDeath(g: Game, layer: number, seconds: number): boolean {
  let last = g.unity().deathsPerMinute;
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    const alive = g.colonies.map((c) => Uint8Array.from(c.alive));
    g.tick(DT);
    const d = g.unity().deathsPerMinute;
    if (d > last && g.colonies.some((c, j) => c.layer.some((l, i) => l === layer && alive[j]![i] === 1 && !c.alive[i]))) return true;
    last = d;
  }
  return false;
}

test("one world: a sweep of 30 save ticks round a fight death, each run on 1 tick and 3 s; and a game loaded into itself keeps its future", () => {
  const make = () => small();
  const whole = make();
  whole.land(0, GARDEN, { evolve: true });
  assert.ok(toFightDeath(whole, PLANE, 40), "a fight death on the plane");
  // The tick of the death: saves from 15 ticks before it to 14 after, from the same game run again from the start.
  const t0 = Math.round(whole.time / DT);
  const base = make();
  base.land(0, GARDEN, { evolve: true });
  ticks(base, t0 - 15);
  const saves: GameSave[] = [];
  const hashes: string[] = [];
  for (let k = 0; k < 30 + 89; k++) {
    if (k < 30) saves.push(copy(base.save()));
    base.tick(DT);
    // Only the ticks compared below: hashing reads (unity, the strangers by each nest) but moves nothing.
    if (k < 30 || k >= 89) hashes[k] = hashGame(base);
  }
  saves.forEach((s, k) => {
    const g = make();
    g.load(s);
    g.tick(DT);
    assert.equal(hashGame(g), hashes[k], `saved ${k - 15} ticks from the death: the first tick after`);
    ticks(g, 89);
    assert.equal(hashGame(g), hashes[k + 89], `saved ${k - 15} ticks from the death: 3 s on`);
  });

  // Loading a game's own save into itself changes nothing to come: load recomputes nothing the save holds.
  const self = make();
  const twin = make();
  for (const g of [self, twin]) {
    g.land(0, GARDEN, { evolve: true });
    ticks(g, t0);
  }
  self.load(copy(self.save()));
  run(self, 3);
  run(twin, 3);
  assert.equal(hashGame(self), hashGame(twin));
});
