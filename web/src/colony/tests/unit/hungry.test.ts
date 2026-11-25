import { test } from "node:test";
import assert from "node:assert/strict";
import { ANTS_START, Evolution, EARNED, MUTATION } from "../../evolution.ts";
import { Fungus, STRAINS } from "../../fungus.ts";
import { generateWorld, OPEN, rockAt } from "../../world.ts";

// A hungry fungus (FungusParams.hungry, PRD §93, ja-a2no.4): a cheap spore, a landing reserve, the free pool's higher share.

const grown = (hungry: boolean): Evolution => {
  const e = new Evolution(0);
  e.hungry = hungry;
  e.patches = 10;
  e.mass = 4;
  for (let k = 0; k < 4000; k++) {
    const spores = e.grow(0.5);
    void spores;
  }
  return e;
};

test("hungry: the free term pays out its reserve and stops; not hungry, it does not", () => {
  const h = grown(true);
  assert.ok(Math.abs(h.reserveUsed - EARNED.reserve) < 1e-6, `spent ${h.reserveUsed} of ${EARNED.reserve}`);
  assert.ok(Math.abs(h.ledger.free - EARNED.reserve) < 1e-6);
  const n = grown(false);
  assert.ok(n.ledger.free > 5 * EARNED.reserve, `not hungry: ${n.ledger.free}`);
  assert.equal(n.reserveUsed, 0, "the reserve is counted only when hungry");
});

test("hungry: a spore costs EARNED.sporeCost, and the free pool counts ground growth at EARNED.share", () => {
  const e = new Evolution(0);
  assert.equal(e.sporeCost, 1);
  e.hungry = true;
  assert.equal(e.sporeCost, EARNED.sporeCost);
  e.growth = 100;
  e.ground = 100;
  assert.ok(Math.abs(e.pools.free - EARNED.share * 100) < 1e-9);
  const n = new Evolution(0);
  n.growth = 100;
  n.ground = 100;
  assert.ok(Math.abs(n.pools.free - MUTATION * 100) < 1e-9, "not hungry: MUTATION as before");
});

test("hungry saves the reserve it spent and loads it; a fungus that is not hungry saves no extra key", () => {
  const h = grown(true);
  const back = Evolution.load(JSON.parse(JSON.stringify(h.save())));
  assert.equal(back.hungry, true);
  assert.equal(back.reserveUsed, h.reserveUsed);
  const keys = Object.keys(grown(false).save());
  assert.ok(!keys.includes("hungry") && !keys.includes("reserveUsed"), `keys ${keys}`);
});

// The flag reaches the evolution: FungusParams.hungry → Evolution.hungry (fungus.ts evolve() and #grow()), review of #438 S2.
const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");
const grownFungus = (hungry: boolean): Fungus => {
  const map = generateWorld(3);
  const f = new Fungus(map, { hyphae: true, hungry });
  f.evolve(BLOOM);
  let land: [number, number] | null = null;
  for (let y = 10; y < 300 && !land; y++) for (let x = 20; x < 500 && !land; x++) if (rockAt(map, x, y) === OPEN) land = [x, y];
  f.root(land![0], land![1], 2, 0);
  f.paint([], land![0], land![1], 0.5, 4, 0, BLOOM, 0);
  for (let k = 0; k < 900; k++) f.stepLayers([], [[]], 1 / 30);
  return f;
};

test("FungusParams.hungry reaches the evolution: the cost, the reserve and the save follow it", () => {
  const h = grownFungus(true);
  const e = h.evolution!;
  assert.equal(e.hungry, true);
  assert.equal(e.sporeCost, EARNED.sporeCost);
  assert.ok(e.reserveUsed > 0, `the free term spent ${e.reserveUsed} of its reserve`);
  assert.equal((h.saveState().evolution as { hungry?: boolean }).hungry, true);
  const n = grownFungus(false).evolution!;
  assert.equal(n.hungry, false);
  assert.equal(n.sporeCost, 1);
  assert.equal(n.reserveUsed, 0);
});

test("hungry: the mutations earned count ground growth at EARNED.share, and a spore refunded or made is paid at EARNED.sporeCost", () => {
  const e = new Evolution(0);
  e.hungry = true;
  e.patches = 10;
  e.growth = 300;
  e.ground = 100;
  assert.ok(Math.abs(e.earned - (ANTS_START + MUTATION * (300 - 100) + EARNED.share * 100)) < 1e-9);
  const n = new Evolution(0);
  n.growth = 300;
  assert.equal(n.earned, ANTS_START + MUTATION * 300, "not hungry: as before");
  e.mass = 50;
  const before = e.mass;
  e.refund(40);
  assert.ok(Math.abs(e.mass - (before + 40 * EARNED.sporeCost)) < 1e-9, "a refunded spore returns its cost");
  const made = new Evolution(0);
  made.hungry = true;
  made.patches = 1;
  made.mass = 30;
  const spores = made.grow(1);
  assert.ok(spores > 0);
  assert.ok(Math.abs(made.ledger.spores - spores * EARNED.sporeCost) < 1e-9, "a spore made costs EARNED.sporeCost of mass");
});
