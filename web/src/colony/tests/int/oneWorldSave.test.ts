import { test } from "node:test";
import assert from "node:assert/strict";
import { cellKey, CURTAIN, PLANE, type Colony } from "../../colony.ts";
import { STRAINS } from "../../fungus.ts";
import { Game, gameRng, type GameSave } from "../../game.ts";
import { centreX, centreY } from "../../hex.ts";
import { CRUST, generateOneWorld, growWorld } from "../../oneWorld.ts";
import type { Flight } from "../../royal.ts";
import { hashGame } from "../saveHash.ts";
import { DT, run} from "../builders.ts";

// One-world saves (U4b, ja-lp4.4.2; docs/one-world.md §4): run, save, load into a game built afresh from the same seed
// and options, run on. The result must hash as the unbroken run on both layers: the plane, the curtain as dug and grown,
// the line, every colony's scent on each layer, the fungus on each map, the grids and bands. Saving the loaded game must
// give the same save, field for field. The mutations (oneWorldSaveMutations.test.ts) show each part is needed.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

/** Seed 7's small plane (160 × 100): two nests well inside it, quick to run. */
const small = (ants = 60, autoFound = true): Game => new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), { antCount: ants, rivalAnts: ants, autoFound }, gameRng(7));
/** Seed 1's default plane, where a founding beyond V₀ fits (the line grows at V₀: the curtain's x0 falls). */
const big = (autoFound = true): Game => new Game(generateOneWorld(1), { antCount: 40, rivalAnts: 40, autoFound }, gameRng(1));

const copy = (s: GameSave): GameSave => JSON.parse(JSON.stringify(s)) as GameSave;

/** A flight from colony `mother`, pending (as Colony.flown gives one): found() takes only pending flights. */
function fly(g: Game, mother: number): Flight {
  const m = g.colonies[mother]!;
  const f: Flight = { mother, x: m.nest.x, y: m.nest.y, load: 0, strain: 0, at: g.time, food: 2 };
  g.flights.push(f);
  return f;
}

/** The save loaded into a fresh game from `make`; saving that game again gives the same save, field for field. */
function restore(saved: GameSave, make: () => Game): Game {
  const g = make();
  g.load(copy(saved));
  const again = copy(g.save());
  assert.deepEqual(Object.keys(again).sort(), Object.keys(saved).sort(), "the same fields");
  for (const k of Object.keys(saved) as (keyof GameSave)[]) assert.deepEqual(again[k], saved[k], `resaved: field ${k}`);
  return g;
}

/** Spores in the curtain, a few rows down colony c's shaft (the fungus's second map), below the gate (ja-web: the foragers held at the top of the shaft took up spores painted there before the save). */
function sporesBelow(g: Game, c: Colony): void {
  const h = c.holeCells[c.params.nest]!;
  g.fungus.paint([], centreX(h.col, CRUST + 6), centreY(CRUST + 6), 2, 3, 0, GARDEN, CURTAIN);
}

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

test("one world: a save runs on exactly as the unbroken game: the plane with its mound and midden, the curtain, the fungus on both maps", () => {
  const make = () => small();
  const whole = make();
  whole.land(0, GARDEN, { evolve: true });
  sporesBelow(whole, whole.player);
  run(whole, 30);
  // The midden doesn't fill in a short run: a pile and a corpse on the plane by hand, as the undertakers leave them.
  const c = whole.player;
  const h = c.holeCells[c.params.nest]!;
  c.midden.set(cellKey(h.px + 9, h.py), 2);
  c.corpses.push({ x: centreX(h.px + 7, h.py), y: centreY(h.py), held: -1, died: whole.time, load: 0, strain: 0, layer: PLANE });
  assert.ok((whole.map.moundCells ?? 0) > 0, "the mound has begun (the test's own check)");
  assert.ok(whole.colonies.every((k) => k.layer.some((l, i) => k.alive[i] === 1 && l === PLANE)), "both colonies have ants on the plane");
  const saved = copy(whole.save());
  assert.ok(((saved.fungus.layers as { sporeCells: unknown }[])[0]!.sporeCells as { $set: unknown[] }).$set.length > 0, "spores in the curtain");
  const at = hashGame(whole);
  run(whole, 15);
  const unbroken = hashGame(whole);

  const again = restore(saved, make);
  assert.equal(hashGame(again), at, "restored: the state as saved");
  run(again, 15);
  assert.equal(hashGame(again), unbroken, "run on: as if never saved");
});

test("one world: foundings replay: the line grown at V₀ and at the far end, saved just after a founding and later, runs on exactly", () => {
  const make = () => big();
  const whole = make();
  run(whole, 10);
  whole.foundBeyond("start", 20);
  assert.ok(whole.world!.curtain.x0 < -64, "the line grew at V₀: the curtain's x0 fell");
  run(whole, 5);
  const k = whole.found(fly(whole, 1));
  assert.ok(k >= 0, `the flight landed (${whole.lastLoss?.reason ?? ""})`);
  assert.equal(whole.founded.length, 2);
  for (const f of whole.founded) assert.ok(f.spot, "each founding keeps where it went");
  const justFounded = copy(whole.save());
  const atFounding = hashGame(whole);
  run(whole, 10);
  const later = copy(whole.save());
  const atLater = hashGame(whole);
  run(whole, 10);
  const unbroken = hashGame(whole);

  // Growing a fresh world where each founding went digs the nest the save holds (from the stream keyed by its hole).
  const w = make().world!;
  for (const f of whole.founded) assert.deepEqual(w.curtain.nests[growWorld(w, f.spot!.end, f.spot!.cell)], f.nest, "the nest as dug then");

  const a = restore(justFounded, make);
  assert.deepEqual(a.world!.line, whole.world!.line, "the line grown again");
  assert.equal(hashGame(a), atFounding);
  run(a, 20);
  assert.equal(hashGame(a), unbroken, "saved just after a founding: as if never saved");

  const b = restore(later, make);
  assert.equal(hashGame(b), atLater);
  run(b, 10);
  assert.equal(hashGame(b), unbroken, "saved later: as if never saved");
});

for (const layer of [PLANE, CURTAIN])
  test(`one world: a save on a tick with a fight death on the ${layer === PLANE ? "plane" : "curtain"} runs on exactly`, () => {
    const make = () => small();
    const whole = make();
    if (layer === CURTAIN) {
      // Fights underground are rare in a short run: Amber's ants put into Ink's royal chamber, by the queen.
      run(whole, 2);
      const q = whole.player.queen!;
      const r = whole.rival!;
      let moved = 0;
      for (let i = 0; i < r.n && moved < 8; i++)
        if (r.alive[i] && r.layer[i] === CURTAIN) {
          r.putAnt(i, CURTAIN, q.x + (moved % 3) - 1, q.y);
          moved++;
        }
    }
    assert.ok(toFightDeath(whole, layer, 40), "a fight death there (the test's own check)");
    const saved = copy(whole.save());
    whole.tick(DT);
    const next = hashGame(whole);
    run(whole, 3);
    const unbroken = hashGame(whole);
    const again = restore(saved, make);
    again.tick(DT);
    assert.equal(hashGame(again), next, "the first tick after");
    run(again, 3);
    assert.equal(hashGame(again), unbroken, "run on");
  });

test("one world: a save with a flight pending (the page's pen) founds it as the unbroken game does", () => {
  const make = () => big(false);
  const whole = make();
  run(whole, 5);
  fly(whole, 0);
  const saved = copy(whole.save());
  assert.equal(saved.flights?.length, 1);
  const again = restore(saved, make);
  assert.deepEqual(again.flights, whole.flights);
  for (const g of [whole, again]) {
    assert.ok(g.found(g.flights[0]!) >= 0, "she lands");
    run(g, 5);
  }
  assert.equal(again.colonies.length, 3);
  assert.equal(hashGame(again), hashGame(whole));
});
