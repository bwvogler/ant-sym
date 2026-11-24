import assert from "node:assert/strict";
import { test } from "node:test";
import { INFECTED, type Colony, type Game } from "../../colony/index.ts";
import { asOf, endingKnown, isKnown, knowsAll, knownCodexStats, knownSides } from "../fog/knownView.ts";
import { KnownColonies } from "../fog/known.ts";
import { Knowledge } from "../fog/knowledge.ts";
import { sensedFor } from "../fog/sources.ts";
import { SensedMap } from "../fungusSight.ts";
import { sideOf, type ColonyStats, type SideStats } from "../stats.ts";
import { buildGame, GAME_STRAIN } from "../useColony.ts";

// The readouts under the fog (docs/fog-of-war.md §4.4, §5.3, ja-1ypq.5): the colonies the fungus knows, live while a host is in them and otherwise as of
// when the last one left; nothing of the rest.

const side = (n: number): SideStats => ({ population: n }) as SideStats;
const stats = (sides: SideStats[], over: Partial<ColonyStats> = {}): ColonyStats =>
  ({ time: 100, sides, outcome: "playing", fallen: -1, unity: { gap: 0.2, score: 0.8 }, ...over }) as unknown as ColonyStats;
const colonyWith = (hosts: number, holeCell?: { col: number; row: number }): Colony =>
  ({
    n: hosts,
    alive: Uint8Array.from({ length: hosts }, () => 1),
    load: Float32Array.from({ length: hosts }, () => INFECTED),
    holeCells: holeCell ? [{ ...holeCell, px: 0, py: 0 }] : [],
  }) as unknown as Colony;

/** A known-colonies set with colony 0 live, colony 1 known as of 40 s, and colony 2 never known. */
function known() {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const k = new KnownColonies<SideStats>((c) => side(c.n));
  const game = { time: 40, colonies: [colonyWith(3), colonyWith(2), colonyWith(0)] } as unknown as Game;
  k.update(game, fog);
  game.time = 100;
  (game.colonies[1] as { n: number }).n = 0;
  game.colonies[0] = colonyWith(5);
  k.update(game, fog);
  return { k, game };
}

test("a readout lists every colony without the fog, and only the known ones under it, live or as of their last host", () => {
  const { k } = known();
  const s = stats([side(5), side(2), side(7)]);
  assert.deepEqual(
    knownSides(s, null).map((r) => [r.k, r.live]),
    [
      [0, true],
      [1, true],
      [2, true],
    ],
  );
  const rows = knownSides(s, k);
  assert.deepEqual(
    rows.map((r) => [r.k, r.live, r.asOf, r.side?.population]),
    [
      [0, true, 100, 5],
      [1, false, 40, 2],
    ],
    "colony 2 is not there; colony 1 keeps what it was when its last host left",
  );
  assert.equal(isKnown(k, 1), true);
  assert.equal(isKnown(k, 2), false);
  assert.equal(isKnown(null, 2), true, "no fog: every colony");
  assert.equal(knowsAll(k, 3), false);
  assert.equal(knowsAll(null, 3), true);
  assert.equal(asOf(100, 40), "as of 60 s ago");
});

test("an ending is news only once the fungus knows the colonies it is about", () => {
  const { k } = known();
  assert.equal(endingKnown(stats([], { outcome: "fallen", fallen: 1 }), k), true, "a known colony gone");
  assert.equal(endingKnown(stats([], { outcome: "fallen", fallen: 2 }), k), false, "an unknown colony gone");
  assert.equal(endingKnown(stats([side(1), side(1), side(1)], { outcome: "unified" }), k), false, "one colony needs every colony known");
  assert.equal(endingKnown(stats([side(1), side(1), side(1)], { outcome: "unified" }), null), true, "no fog");
  assert.equal(endingKnown(stats([], { outcome: "playing" }), k), true);
});

test("the Codex counts only the known colonies' deaths, and the odours' gap only while two are known", () => {
  const { k } = known();
  const s = knownCodexStats(stats([side(5), side(2), side(7)]), k)!;
  assert.equal(s.sides.length, 2);
  assert.equal(s.unity.gap, 0.2, "two known: the gap");
  const one = new KnownColonies<SideStats>((c) => side(c.n));
  one.update({ time: 1, colonies: [colonyWith(1), colonyWith(0)] } as unknown as Game, new Knowledge(new SensedMap(), []));
  assert.equal(knownCodexStats(stats([side(5), side(2)]), one)!.unity.gap, 1, "one known: no gap");
  assert.equal(knownCodexStats(stats([side(5)]), null)!.sides.length, 1, "no fog: as it is");
});

test("a colony that holds a host is read again at most every KnownColonies.EVERY", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  let reads = 0;
  const k = new KnownColonies<SideStats>((c) => (reads++, side(c.n)));
  const game = { time: 0, colonies: [colonyWith(1)] } as unknown as Game;
  for (let t = 0; t < 2; t += 0.05) {
    game.time = t;
    k.update(game, fog);
  }
  assert.ok(reads >= 3 && reads <= 6, `${reads} reads in 2 s (one every ${KnownColonies.EVERY} s)`);
});

test("in a real game the landing colony becomes known with the first host, and stays known, as last read, once it has none", () => {
  const game = buildGame({ species: "generic", seed: 1, antCount: 60, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  game.land(0, GAME_STRAIN, { evolve: true });
  assert.deepEqual(sensed.known!.list(), [], "before any step: nothing known");
  for (let k = 0; k < 30 * 40 && sensed.known!.list().length === 0; k++) {
    game.tick(1 / 30);
    sensed.stampGame(game);
  }
  assert.ok(sensed.known!.get(0)?.live, "colony 0: a host, live");
  assert.deepEqual(sensed.known!.get(0)!.readout, sideOf(game.colonies[0]!, game.fungus), "its numbers as sideOf reads them");
});
