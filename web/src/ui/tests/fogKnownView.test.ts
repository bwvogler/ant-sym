import assert from "node:assert/strict";
import { test } from "node:test";
import { centreX, centreY, INFECTED, type Colony, type Game } from "../../colony/index.ts";
import { asOf, endingKnown, lastKnownText, isKnown, knowsAll, knownCodexStats, knownSides } from "../fog/knownView.ts";
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
/** The two nests' holes on the plane: a colony's own is at its `params.nest` (holeCells lists every nest's). */
const HOLES = [
  { col: 0, row: 0, px: 10, py: 10 },
  { col: 0, row: 0, px: 150, py: 10 },
];
const colonyWith = (hosts: number, nest = 0): Colony =>
  ({
    n: hosts,
    params: { nest },
    alive: Uint8Array.from({ length: hosts }, () => 1),
    load: Float32Array.from({ length: hosts }, () => INFECTED),
    holeCells: HOLES,
  }) as unknown as Colony;

/** A known-colonies set with colony 0 live, colony 1 known as of 40 s, and colony 2 never known. */
function known() {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const k = new KnownColonies<SideStats>((c) => side(c.n));
  const game = { time: 40, colonies: [colonyWith(3, 0), colonyWith(2, 1), colonyWith(0, 2)] } as unknown as Game;
  k.update(game, fog);
  game.time = 100;
  (game.colonies[1] as { n: number }).n = 0;
  game.colonies[0] = colonyWith(5, 0);
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
  one.update({ time: 1, colonies: [colonyWith(1, 0), colonyWith(0, 1)] } as unknown as Game, new Knowledge(new SensedMap(), []));
  assert.equal(knownCodexStats(stats([side(5), side(2)]), one)!.unity.gap, 1, "one known: no gap");
  assert.equal(knownCodexStats(stats([side(5)]), null)!.sides.length, 1, "no fog: as it is");
});

test("a colony that holds a host is read again at most every KnownColonies.EVERY", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  let reads = 0;
  const k = new KnownColonies<SideStats>((c) => (reads++, side(c.n)));
  const game = { time: 0, colonies: [colonyWith(1, 0)] } as unknown as Game;
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

test("a colony is known by its own hole, not by another's, and goes live when a host arrives", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const k = new KnownColonies<SideStats>((c) => side(c.n));
  const a = colonyWith(0, 0);
  const b = colonyWith(0, 1);
  const game = { time: 1, colonies: [a, b] } as unknown as Game;
  const host = (px: number, py: number): Colony =>
    ({
      n: 1,
      alive: Uint8Array.of(1),
      load: Float32Array.of(INFECTED),
      layer: Uint8Array.of(0),
      x: Float32Array.of(centreX(px, py)),
      y: Float32Array.of(centreY(py)),
      params: { sensorDistance: 3 },
      alates: [],
    }) as unknown as Colony;
  sensed.stamp([host(HOLES[0]!.px, HOLES[0]!.py)], 1); // only colony 0's own hole is sensed
  k.update(game, fog);
  assert.deepEqual(k.list(), [0], "colony 0 by its hole, and not colony 1 (the other nest's hole is not its own)");
  assert.deepEqual(k.get(0), { readout: null, asOf: 1, live: false }, "known by the hole alone: no numbers yet");
  sensed.stamp([host(HOLES[1]!.px, HOLES[1]!.py)], 5); // now the rival's hole
  game.time = 5;
  k.update(game, fog);
  assert.deepEqual(k.list(), [0, 1], "both once both holes have been sensed");
  game.colonies[0] = colonyWith(2, 0); // a host arrives in colony 0
  game.time = 6;
  k.update(game, fog);
  assert.deepEqual(k.get(0), { readout: side(2), asOf: 6, live: true }, "a host: its numbers, live");
  game.colonies[0] = colonyWith(0, 0); // its host has gone
  game.time = 0.5; // time goes back: the fog forgets (sight and knowledge), and so must the known colonies
  sensed.stamp([], 0.5);
  k.update(game, fog);
  assert.deepEqual(k.list(), [], "forgotten");
});

test("the fungus knows every colony only when it knows them all", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const k = new KnownColonies<SideStats>((c) => side(c.n));
  k.update({ time: 1, colonies: [colonyWith(1, 0), colonyWith(1, 1)] } as unknown as Game, fog);
  assert.equal(knowsAll(k, 2), true, "both hold a host");
  assert.equal(knowsAll(k, 3), false, "a third colony is not known");
});

test("the nest tab's last-known line says when, and what was last known; and the palette lists only the nests the fungus knows", async () => {
  const withSide = lastKnownText({ queen: "lost", brood: [1, 2, 3], population: 9 } as unknown as SideStats, 100, 40);
  assert.ok(withSide.includes("as of 60 s ago"), "when");
  assert.ok(withSide.includes("dead (orphaned)") && withSide.includes("1 / 2 / 3") && withSide.includes("9 ants"), "what was last known");
  assert.ok(lastKnownText(null, 100, 40).includes("no host of yours has been in it"), "a nest known by its hole alone");
  const { paletteCommands } = await import("../paletteCommands.ts");
  const { k } = known();
  const ids = (kn: KnownColonies<SideStats> | null) =>
    paletteCommands({
      game: {
        map: { endless: false },
        colonies: [{ ...colonyWith(1, 0), ph: { has: () => true } }, colonyWith(1, 1), colonyWith(0, 2)],
        params: { species: { id: "generic" } },
      },
      controls: { playing: true, speed: 1, view: "above" },
      speeds: [],
      oneWorld: false,
      lab: false,
      lensOn: false,
      noticeLevel: "all",
      theme: "light",
      field: { current: null },
      known: kn,
    } as never)
      .map((c) => c.id)
      .filter((id) => id.startsWith("nest-"));
  assert.deepEqual(ids(null), ["nest-0", "nest-1", "nest-2"], "no fog: every nest");
  assert.deepEqual(ids(k), ["nest-0", "nest-1"], "the fog: the known ones");
});
