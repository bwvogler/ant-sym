import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../colony.ts";
import { CountGrid, occupancy } from "../battle.ts";
import { askedLevers, DEFAULT_MENU, Fungus, STRAINS } from "../fungus.ts";
import { Game, type GameSave } from "../game.ts";
import { CELL, cellOf } from "../hex.ts";
import { encodeLevels } from "../levers.ts";
import { generateSideWorld, mulberry32 } from "../world.ts";

// The queen as a host (ja-lo8.7): her attendants infect her by contact; the fungus in her has its own levers (showing,
// and her signal, which scales her royal mark); reaching her opens her colony's doctrine (Game.revealed).

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };
const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

/** A colony of `n` ants, all put beside its queen. */
function court(n: number, load: number) {
  const map = generateSideWorld(2, SMALL);
  const c = new Colony(map, { antCount: n, maxAnts: n }, mulberry32(4), () => "explore");
  for (let i = 0; i < n; i++) {
    c.x[i] = c.queen!.x + 0.3;
    c.y[i] = c.queen!.y;
    c.load[i] = load;
    c.strain[i] = GARDEN;
    c.resist[i] = 1; // they don't lose it to each other's grooming here
  }
  return { map, c };
}

test("a queen is infected by the loaded ants that tend her, and not by clean ones", () => {
  for (const [load, infected] of [
    [0.8, true],
    [0, false],
  ] as const) {
    const { map, c } = court(4, load);
    const f = new Fungus(map, { grooming: 0 });
    f.hosts = 4;
    for (let k = 0; k < 50; k++) f.step([c], [occupancy(c, new CountGrid())], 0.1);
    assert.equal(c.queen!.load > 0.05, infected, `attendants at ${load}: queen ${c.queen!.load.toFixed(3)}`);
    if (infected) assert.equal(c.queen!.strain, GARDEN);
  }
});

test("the queen is asked only her own levers, and her signal lever scales the royal mark she lays", () => {
  const menu = new Set(DEFAULT_MENU);
  assert.deepEqual(askedLevers(menu, true), ["show", "queenSignal"]);
  assert.ok(!askedLevers(menu, false).includes("queenSignal"), "a worker has no queen signal");
  const mark = (signalLevel: number) => {
    const { map, c } = court(4, 0.8);
    const f = new Fungus(map, { grooming: 0 });
    c.queen!.load = 1;
    c.queen!.strain = GARDEN;
    f.hosts = 5;
    f.policy = (s) => (s.task === "queen" ? encodeLevels({ queenSignal: signalLevel }, askedLevers(f.menu, true)) : "default");
    f.step([c], [occupancy(c, new CountGrid())], 0.1);
    const signal = c.queen!.signal;
    for (let k = 0; k < 30; k++) c.tick(1 / 30);
    cellOf(c.queen!.x, c.queen!.y);
    return { signal, mark: c.ph.fields.royal.get(CELL[0] as number, CELL[1] as number) };
  };
  const damped = mark(0);
  const asIs = mark(2);
  assert.ok(Math.abs(damped.signal - 0.1) < 0.02, `strongly damped at full load: ${damped.signal}`);
  assert.equal(asIs.signal, 1);
  assert.ok(damped.mark < asIs.mark * 0.5, `her mark: ${damped.mark.toFixed(2)} damped vs ${asIs.mark.toFixed(2)}`);
});

test("reaching a queen opens her colony's doctrine for good, and a save keeps it", () => {
  const g = new Game(generateSideWorld(2, { ...SMALL, nestCount: 2 }), { antCount: 60, rivalAnts: 60 }, mulberry32(9));
  g.tick(1 / 30);
  assert.deepEqual(g.revealed, []);
  g.colonies[0]!.queen!.load = 0.3;
  g.colonies[0]!.queen!.strain = GARDEN;
  g.fungus.hosts = 1;
  g.tick(1 / 30);
  assert.equal(g.revealed[0], true);
  assert.notEqual(g.revealed[1], true);
  g.colonies[0]!.queen!.load = 0;
  g.tick(1 / 30);
  assert.equal(g.revealed[0], true, "it stays open");
  const saved = JSON.parse(JSON.stringify(g.save())) as GameSave;
  const again = new Game(generateSideWorld(2, { ...SMALL, nestCount: 2 }), { antCount: 60, rivalAnts: 60 }, mulberry32(9));
  again.load(saved);
  assert.equal(again.revealed[0], true);
  assert.equal(again.colonies[0]!.queen!.strain, GARDEN, "and the queen's fungus with it");
});
