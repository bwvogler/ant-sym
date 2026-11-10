import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE } from "../colony.ts";
import { STRAINS } from "../fungus.ts";
import { Game, gameRng, type GameSave } from "../game.ts";
import { centreX, centreY } from "../hex.ts";
import { CRUST, generateOneWorld } from "../oneWorld.ts";
import { generateSideWorld } from "../world.ts";
import { hashGame } from "./saveHash.ts";

// One-world saves (U4b): each part of a save is needed. One save of one game, and one unbroken hash: take a part away or
// put a stale one in, and the load must refuse it or run on to another hash. And a save into the wrong kind of game,
// or another world, is refused.

const DT = 1 / 30;
const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

const small = (seed = 7, w = 160): Game => new Game(generateOneWorld(seed, { plane: { size: { w, h: 100 } } }), { antCount: 60, rivalAnts: 60 }, gameRng(seed));
const run = (g: Game, seconds: number): void => {
  for (let k = 0; k < Math.round(seconds / DT); k++) g.tick(DT);
};
const copy = (s: GameSave): GameSave => JSON.parse(JSON.stringify(s)) as GameSave;

/**
 * The game every mutation starts from: seed 7's small plane, Garden landed and spores in the curtain, a stranger colony
 * founded beyond V₀ (the line grows there, so `founded` has a spot and the curtain a negative x0), run 30 s and on to a
 * tick with a fight death; saved there, and its hash 5 s on.
 */
function setUp(): { saved: GameSave; unbroken: string } {
  const g = small();
  g.land(0, GARDEN, { evolve: true });
  const c = g.player;
  const h = c.holeCells[c.params.nest]!;
  g.fungus.paint([], centreX(h.col, CRUST + 3), centreY(CRUST + 3), 2, 3, 0, GARDEN, CURTAIN);
  run(g, 2);
  const v = g.world!.line.holes[0]!;
  g.addColony({ x: centreX(v.x, v.y) - 20, y: centreY(v.y), antCount: 40, odour: 1 });
  assert.equal(g.founded[0]?.spot?.end, "start", "founded beyond V₀");
  run(g, 28);
  let last = g.unity().deathsPerMinute;
  for (let k = 0; k < 600; k++) {
    g.tick(DT);
    const d = g.unity().deathsPerMinute;
    if (d > last) break;
    last = d;
  }
  assert.ok(g.unity().deathsPerMinute > last, "saved on a tick with a fight death");
  assert.ok((g.map.moundCells ?? 0) > 0, "the mound has begun");
  assert.ok(g.fungus.sporeCells > 0);
  assert.ok(g.colonies.every((k) => k.layers[PLANE]!.ph.total("home") > 0), "every colony has trails on the plane");
  const saved = copy(g.save());
  run(g, 5);
  return { saved, unbroken: hashGame(g) };
}

const { saved, unbroken } = setUp();

/** Load s into a fresh game and run 5 s: the hash, or the error the load threw. */
function outcome(s: GameSave): { hash?: string; error?: string } {
  const g = small();
  try {
    g.load(copy(s));
  } catch (e) {
    return { error: (e as Error).message };
  }
  run(g, 5);
  return { hash: hashGame(g) };
}

test("one world, the control: the save as made runs on to the unbroken hash", () => {
  assert.deepEqual(outcome(saved), { hash: unbroken });
});

const diverge: [string, (s: GameSave) => void][] = [
  ["without the colonies' other layers (the plane's trails)", (s) => s.colonies.forEach((c) => delete c.layers)],
  ["without the fungus's other maps (the curtain's spores)", (s) => delete s.fungus.layers],
  [
    "with the curtain of a world freshly grown by the same foundings",
    (s) => {
      const g = small();
      for (const f of s.founded ?? []) g.addColony(f);
      s.world!.curtain = copy(g.save()).world!.curtain;
    },
  ],
  ["without the grids, saved on a tick with a fight death", (s) => delete s.grids],
  ["with the mound's spoil zeroed", (s) => ((s.map as Record<string, unknown>).spoil = { $chunks: [] })],
];

for (const [what, mutate] of diverge)
  test(`one world: a save ${what} runs on to another hash`, () => {
    const s = copy(saved);
    mutate(s);
    const o = outcome(s);
    assert.ok(o.error === undefined, `loads (${o.error ?? ""})`);
    assert.notEqual(o.hash, unbroken);
  });

const refused: [string, (s: GameSave) => void, RegExp][] = [
  ["a founding without its spot", (s) => delete s.founded![0]!.spot, /needs its spot/],
  ["another line (V₀'s column moved)", (s) => (s.world!.line.s0 += 1), /another world's line/],
  ["another line (a hole moved)", (s) => (s.world!.line.holes[0]!.x += 1), /another world's line/],
];

for (const [what, mutate, why] of refused)
  test(`one world: a save with ${what} is refused`, () => {
    const s = copy(saved);
    mutate(s);
    assert.match(outcome(s).error ?? "loaded", why);
  });

test("one world: a save into the wrong kind of game, or another world, is refused", () => {
  const side = new Game(generateSideWorld(7), { antCount: 20, rivalAnts: 20 }, gameRng(7));
  assert.throws(() => side.load(copy(saved)), /a one-world save, and this game is on one map/);
  const sideSave = copy(side.save());
  assert.throws(() => small().load(sideSave), /a save of a game on one map, and this game is one world/);
  assert.throws(() => small(8).load(copy(saved)), /another world \(seed 7/, "another seed");
  assert.throws(() => small(7, 176).load(copy(saved)), /another world/, "another plane size");
});
