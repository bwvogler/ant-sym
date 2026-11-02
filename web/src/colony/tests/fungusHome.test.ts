import { test } from "node:test";
import assert from "node:assert/strict";
import { LARVA } from "../brood.ts";
import { Colony, type Situation } from "../colony.ts";
import { decodeFungal } from "../fungalPolicy.ts";
import { Fungus, INTERVENTIONS, intervention, LETHAL, STRAINS } from "../fungus.ts";
import { Game } from "../game.ts";
import { CELL, cellOf, centreX, centreY } from "../hex.ts";
import { CountGrid, occupancy } from "../battle.ts";
import { generateSideWorld, isSky, mulberry32, OPEN, rockAt, type WorldMap } from "../world.ts";

// Nest slice 8 (docs/nest-and-home.md §4): the fungus on the new home. Its ground is the nest's places; it can blunt
// or swap a host's floor marks (muddle); a lethal strain-gated crown kills the queen and brood; a Bloom host's corpse
// on the midden sporulates.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 2 };
const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");
const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

function walkway(map: WorldMap, x: number): number {
  for (let y = 0; y < map.size.h; y++) if (isSky(map, x, y) && rockAt(map, x, y) === OPEN) return y;
  return -1;
}

test("the fungus's ground in the side view: its own chamber, its own tunnels, the open ground, another's chamber", () => {
  const map = generateSideWorld(2, SMALL);
  const a = new Colony(map, { antCount: 4, maxAnts: 4, nest: 0 }, mulberry32(1));
  const b = new Colony(map, { antCount: 1, maxAnts: 1, nest: 1 }, mulberry32(2));
  const place = (i: number, x: number, y: number) => ((a.x[i] = x), (a.y[i] = y));
  place(0, map.nests[0]!.x, map.nests[0]!.y); // own chamber
  place(1, map.nests[0]!.entrance!.x, map.nests[0]!.entrance!.y + 2); // own shaft
  cellOf(map.nests[0]!.entrance!.x, map.nests[0]!.entrance!.y);
  const sx = (CELL[0] as number) + 20;
  place(2, centreX(sx, walkway(map, sx)), centreY(walkway(map, sx))); // the open ground
  place(3, map.nests[1]!.x, map.nests[1]!.y); // the rival's chamber
  b.x[0] = map.nests[1]!.x + 50; // far away
  for (let i = 0; i < 4; i++) ((a.load[i] = 0.5), (a.strain[i] = GARDEN));
  const f = new Fungus(map, { grooming: 0 });
  f.hosts = 4;
  f.step([a, b], [occupancy(a, new CountGrid()), occupancy(b, new CountGrid())], 1e-6);
  assert.deepEqual([0, 1, 2, 3].map((i) => decodeFungal(a.fungal[i]!, "garden").ground), ["home", "tunnel", "border", "foreign"]);
});

test("muddle: a host misreads its floor marks: in a brood chamber it is asked as in a store; blunted, it can't tell", () => {
  const map = generateSideWorld(2, { ...SMALL, nestCount: 1 });
  const asked: Situation[] = [];
  const c = new Colony(map, { antCount: 1, maxAnts: 1 }, mulberry32(3), (s) => (asked.push(s), "explore"));
  const ch = map.chambers!;
  ch.list[0]!.role = "brood"; // stand-in: the founding chamber read as brood
  c.x[0] = map.nest.x;
  c.y[0] = map.nest.y;
  c.tick(1 / 30);
  assert.equal(asked.at(-1)!.homeTrail, "brood");
  const f = new Fungus(map);
  f.express(c, 0, intervention("muddle"), 1);
  assert.ok(c.swapMarks[0]! >= 0.5);
  c.mode[0] = 1; // a new question
  c.tick(1 / 30);
  // gainMarks 0.3 < ½ at full load: it can't tell the chamber at all.
  assert.equal(asked.at(-1)!.homeTrail, "tunnel");
  c.gainMarks[0] = 1; // marks as they are, swap kept
  c.mode[0] = 2;
  c.tick(1 / 30);
  assert.equal(asked.at(-1)!.homeTrail, "store", "brood smells like store");
});

test("crown (lethal, Bloom's, off by default): a host by the queen kills her and the brood it touches", () => {
  assert.ok(LETHAL.has("crown"));
  assert.ok(STRAINS[BLOOM]!.allows.includes("crown"));
  assert.ok(!new Fungus(generateSideWorld(2, SMALL)).menu.has("crown"), "off the menu by default");
  const map = generateSideWorld(2, { ...SMALL, nestCount: 1 });
  const c = new Colony(map, { antCount: 2, maxAnts: 4 }, mulberry32(4), () => "explore");
  cellOf(c.queen!.x, c.queen!.y);
  const larva = c.brood.add(CELL[0] as number, CELL[1] as number, map.chambers!.at(CELL[0] as number, CELL[1] as number));
  larva.stage = LARVA;
  c.x[0] = c.queen!.x;
  c.y[0] = c.queen!.y;
  const f = new Fungus(map);
  f.express(c, 0, intervention("crown"), 1);
  c.tick(1 / 30);
  assert.ok(!c.orphaned, "not at once: CROWN_RATE a second");
  for (let k = 0; k < 30 * 120 && (!c.orphaned || c.brood.size > 0); k++) {
    c.x[0] = c.queen!.x; // kept by her (the larva lies in her cell)
    c.y[0] = c.queen!.y;
    c.tick(1 / 30);
  }
  assert.ok(c.orphaned, "the queen is dead");
  assert.equal(c.brood.size, 0, "and the brood by her");
  assert.equal(c.broodKilled, 1);
  assert.ok(INTERVENTIONS.some((v) => v.id === "muddle") && !LETHAL.has("muddle"));
});

test("on the midden a Bloom host's corpse sporulates; a Garden host's doesn't", () => {
  const spores = (strain: number) => {
    const map = generateSideWorld(2, { ...SMALL, nestCount: 1 });
    const g = new Game(map, { antCount: 60, rival: false }, mulberry32(5));
    const c = g.player;
    const k = { x: 0, y: 0, held: -1, midden: true, died: 0, load: 0.8, strain, spored: false };
    cellOf(map.nest.entrance!.x + 12, map.nest.entrance!.y);
    k.x = CELL[0] as number;
    k.y = walkway(map, k.x);
    c.corpses.push(k);
    g.tick(1 / 30);
    assert.ok(k.spored, "looked at once");
    return g.fungus.spores.get(k.x, k.y);
  };
  assert.ok(spores(BLOOM) > 0, "Bloom");
  assert.equal(spores(GARDEN), 0, "Garden");
});
