import { test } from "node:test";
import assert from "node:assert/strict";
import { LARVA } from "../../brood.ts";
import { Colony, LIFESPAN } from "../../colony.ts";
import { centreX, centreY } from "../../hex.ts";
import { ADULT_DRAIN, ADULT_DRAIN_OUT, begOf, BEG_BELOW, feel, FeltGrid, LARVA_DRAIN, NEED_FADE, PASS, respond, SHARE_ABOVE, THETA_OLD } from "../../hunger.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";
import { SMALL_SIDE, broodChamber } from "../builders.ts";

// Energy and hunger (ja-xu6.1, hunger.ts): every adult, larva and the queen has energy, drained with time and refilled by
// eating; hunger is felt by touch (begging larvae, a queen who can't lay) and passed on; old ants answer it by working
// inside, above a threshold age raises.


test("a larva begs only once its energy is low; the response threshold is s²/(s²+θ²); felt need rises fast and fades slowly", () => {
  assert.equal(begOf(1), 0);
  assert.equal(begOf(BEG_BELOW), 0);
  assert.ok(begOf(0.4) > 0 && begOf(0.4) < begOf(0.1), "the emptier, the stronger");
  assert.equal(begOf(0), 1);
  assert.equal(respond(0, THETA_OLD), 0);
  assert.equal(respond(THETA_OLD, THETA_OLD), 0.5);
  assert.ok(respond(1, THETA_OLD) > 0.9);
  assert.equal(respond(0, 0), 1, "no threshold: always");
  const up = feel(0, 1, 2);
  const down = 1 - feel(1, 0, 2);
  assert.ok(up > 0.5 && down < 0.1, `up ${up}, down ${down}`);
  assert.ok(Math.abs(feel(1, 0, NEED_FADE) - Math.exp(-1)) < 1e-9);
});

test("the felt grid keeps the strongest on a cell, reads the strongest within one cell, and a reset clears it", () => {
  const g = new FeltGrid();
  g.put(10, 10, 0.3);
  g.put(10, 10, 0.2);
  assert.equal(g.get(10, 10), Math.fround(0.3));
  g.put(11, 10, 0.6);
  assert.equal(g.near(10, 10), Math.fround(0.6), "a neighbour's");
  assert.equal(g.near(20, 20), 0);
  g.reset();
  assert.equal(g.get(10, 10), 0);
  assert.equal(g.near(10, 10), 0);
});

/** A colony of `n` ants in the small side world, its queen alive, every ant exploring. */
function colony(n = 1) {
  const map = generateSideWorld(2, SMALL_SIDE);
  const c = new Colony(map, { antCount: n, maxAnts: n + 4 }, mulberry32(2), () => "explore");
  return { map, c };
}


test("an ant uses energy, twice as fast outside, eats from food lying within two cells once hungry (not the queen's stock), and shares by mouth", () => {
  const { c } = colony(2);
  c.energy[0] = 0.9;
  c.tick(1);
  assert.ok(Math.abs((c.energy[0] as number) - (0.9 - ADULT_DRAIN)) < 1e-6, `inside: ${c.energy[0]}`);
  assert.ok(ADULT_DRAIN_OUT > ADULT_DRAIN);
  // Not hungry: it leaves the food. (10 in the royal chamber: the queen's stock of 8, which adults leave her, and 2 beyond.)
  c.feed(10);
  const at = (i: number) => {
    c.x[i] = c.queen!.x;
    c.y[i] = c.queen!.y;
  };
  at(0);
  at(1);
  c.energy[0] = 0.8;
  c.energy[1] = 0.8;
  c.tick(1 / 30);
  assert.equal(c.eaten, 0, "above EAT_BELOW, nobody eats");
  // Hungry beside food: it eats, and the food leaves the larder.
  c.energy[0] = 0.3;
  const larder = c.larder;
  at(0);
  at(1);
  c.tick(1 / 30);
  assert.ok((c.energy[0] as number) > 0.9, `fed: ${c.energy[0]}`);
  assert.ok(c.eaten > 0 && Math.abs(larder - c.larder - c.eaten) < 1e-9, `eaten ${c.eaten}, larder ${larder} → ${c.larder}`);
  // No food left: a hungry ant takes food by mouth from a well-fed nestmate it touches; energy is passed, not made.
  c.feed(-c.larder);
  c.energy[0] = 0.2;
  c.energy[1] = 1;
  at(0);
  at(1);
  const before = (c.energy[0] as number) + (c.energy[1] as number);
  c.tick(1 / 30);
  assert.ok((c.energy[0] as number) > 0.3, `given: ${c.energy[0]}`);
  assert.ok((c.energy[1] as number) >= SHARE_ABOVE - 1e-6, `the giver keeps enough: ${c.energy[1]}`);
  assert.ok(Math.abs(before - 2 * (1 / 30) * ADULT_DRAIN - (c.energy[0] as number) - (c.energy[1] as number)) < 1e-5, "shared, not made");
});

test("an ant that runs out of energy dies of hunger; a larva that does dies too, and its food leaves with it", () => {
  const { map, c } = colony(2);
  c.energy[1] = 1e-6;
  c.tick(1 / 30);
  assert.equal(c.alive[1], 0);
  assert.equal(c.diedHungry, 1);
  assert.equal(c.alive[0], 1, "the fed one lives");
  const { b: room, cell } = broodChamber(map);
  const larva = c.brood.add(cell[0], cell[1], room.id);
  room.brood++;
  larva.stage = LARVA;
  larva.fed = 1;
  larva.energy = LARVA_DRAIN / 60;
  c.tick(1 / 30);
  assert.equal(c.brood.items.includes(larva), false, "starved");
  assert.equal(c.broodStarved, 1);
  assert.equal(room.brood, 0);
  assert.ok(Math.abs(c.eaten - 2) < 1e-9, `its egg and what it was fed left the economy: ${c.eaten}`);
});

test("hunger is felt by touch and passed on: an ant beside a begging larva feels it, one beside that ant a little less, one far off nothing", () => {
  const { map, c } = colony(3);
  const { b: room, cell } = broodChamber(map);
  const larva = c.brood.add(cell[0] - 1, cell[1], room.id);
  room.brood++;
  larva.stage = LARVA;
  larva.energy = 0.1; // starving: it begs hard (and isn't fed: there is no food)
  // The larva at the chamber's west cell, ant 0 beside it, ant 1 beside ant 0 (two from the larva), ant 2 in the royal chamber far off.
  const at = (i: number, x: number, y: number) => {
    c.x[i] = centreX(x, y);
    c.y[i] = centreY(y);
  };
  for (let k = 0; k < 30 * 3; k++) {
    at(0, cell[0], cell[1]);
    at(1, cell[0] + 1, cell[1]);
    at(2, c.queen!.x, c.queen!.y);
    c.tick(1 / 30);
  }
  const [a, b, far] = [c.need[0] as number, c.need[1] as number, c.need[2] as number];
  assert.ok(a > 0.5, `beside it: ${a}`);
  assert.ok(b > 0.2 && b < a, `one further: ${b}`);
  assert.ok(b <= PASS * a + 1e-6 || b < a, "passed on, a little less");
  assert.ok(far < b, `far off: ${far}`);
});

test("an old forager carries food in only when it feels hunger: with none it never does, with a strong need it soon does", () => {
  const run = (need: number) => {
    const { map, c } = colony();
    const { b: room, cell } = broodChamber(map);
    // Larvae wanting food in the brood chamber, food beyond the queen's stock in the royal chamber.
    for (let k = 0; k < 3; k++) {
      const l = c.brood.add(cell[0], cell[1], room.id);
      room.brood++;
      l.stage = LARVA;
    }
    c.feed(30);
    c.age[0] = 0.9 * LIFESPAN; // old: age band 2
    c.lifespan[0] = 10 * LIFESPAN;
    for (let k = 0; k < 30 * 20; k++) {
      c.x[0] = c.queen!.x; // kept by the food (it would wander off to forage)
      c.y[0] = c.queen!.y;
      if (need > 0) c.need[0] = need;
      c.tick(1 / 30);
      if (c.band(0) !== 2) throw new Error("not old");
    }
    return c.portTrips + (c.carrying[0] ? 1 : 0);
  };
  assert.equal(run(0), 0, "no hunger felt: an old ant forages, as before");
  assert.ok(run(1) > 0, "a strong need: it carries food in");
});
