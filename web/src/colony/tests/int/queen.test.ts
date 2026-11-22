import { test } from "node:test";
import assert from "node:assert/strict";
import { EGG, LARVA, PUPA } from "../../brood.ts";
import { Colony, CURTAIN, T_EGG, T_LARVA, T_PUPA, type ColonyParams } from "../../colony.ts";
import { Game } from "../../game.ts";
import { cellOf, CELL, centreX } from "../../hex.ts";
import type { OneWorld } from "../../oneWorld.ts";
import type { Policy } from "../../vocab.ts";
import { digCell, mulberry32, OPEN, rockAt } from "../../world.ts";
import { smallOne } from "../builders.ts";

// Nest slice 4 (docs/nest-and-home.md §3.4): the queen lays, brood grows from egg to larva (fed) to pupa, workers are
// born from pupae, and a colony that loses its queen is orphaned: no more eggs, its workers age out. On the curtain of a
// small one world (S2.3c).

/** A small one world with no food on either layer: what the colony eats is only what a test puts in its larder. */
function bare(seed: number): OneWorld {
  const w = smallOne(seed);
  for (const map of [w.plane, w.curtain])
    for (let y = 0; y < map.size.h; y++) for (let x = map.x0; x < map.x0 + map.size.w; x++) map.food.set(x, y, 0);
  return w;
}

/** A bare colony on world `w`'s curtain, bound to it. */
function colony(w: OneWorld, params: Partial<ColonyParams>, seed: number, policy?: Policy): Colony {
  const c = new Colony(w.curtain, params, mulberry32(seed), policy, { plane: w.plane, line: w.line });
  c.bind(CURTAIN);
  return c;
}

test("the queen lies on her royal chamber's floor, under its centre", () => {
  // That each colony has a queen is int/oneWorldGame's "two layers… a queen…". She lies on the royal chamber's floor: its bottom row, under the founding chamber's centre (review of slice 4: she
  // was placed a row below the centre, rows above the floor).
  for (const seed of [1, 2, 3, 4]) {
    const w = smallOne(seed);
    const m = w.curtain;
    for (const k of [0, 1]) {
      const q = colony(w, { antCount: 1, nest: k }, 1).queen!;
      assert.ok(q.alive);
      cellOf(q.x, q.y);
      const royal = m.chambers!.list.find((ch) => ch.colony === k && ch.role === "royal")!;
      assert.equal(m.chambers!.at(CELL[0], CELL[1]), royal.id, `seed ${seed}, colony ${k}: in her chamber`);
      assert.equal(CELL[1], royal.floorRow, `seed ${seed}, colony ${k}: on its floor`);
      assert.ok(Math.abs(q.x - m.nests[k]!.x) <= 1, `seed ${seed}, colony ${k}: under its centre`);
    }
  }
});

test("queen to worker: she lays while there is food; an egg becomes a larva, is fed, pupates, and a worker is born where the pupa lay", () => {
  const c = colony(bare(2), { antCount: 20, maxAnts: 30 }, 2, () => "explore");
  c.feed(8.5); // two workers' worth, and a little for the larvae's upkeep as they wait (ja-xu6.1)
  let firstBirth = -1;
  const stages = new Set<number>();
  let pupae: string[] = [];
  let bornAtPupa = 0;
  for (let k = 0; k < 30 * 120 && c.births < 2; k++) {
    const before = c.births;
    const wasAlive = Array.from(c.alive);
    c.tick(1 / 30);
    if (c.births > before)
      for (let i = 0; i < c.n; i++)
        if (c.alive[i] && !wasAlive[i]) {
          // Born where a pupa lay (its cell's centre), not somewhere in the founding chamber.
          cellOf(c.x[i], c.y[i]);
          if (pupae.includes(`${CELL[0]},${CELL[1]}`) && c.x[i] === centreX(CELL[0], CELL[1])) bornAtPupa++;
        }
    pupae = c.brood.items.filter((b) => b.stage === PUPA).map((b) => `${b.x},${b.y}`);
    for (const b of c.brood.items) stages.add(b.stage);
    if (c.births > 0 && firstBirth < 0) firstBirth = c.time;
  }
  assert.equal(bornAtPupa, c.births, "each worker born on its pupa's cell");
  assert.ok(stages.has(EGG) && stages.has(LARVA) && stages.has(PUPA), `stages seen ${[...stages]}`);
  assert.equal(c.births, 2, "two workers from eight food");
  assert.ok(firstBirth >= T_EGG + T_LARVA + T_PUPA - 1, `no worker sooner than egg + larva + pupa: ${firstBirth.toFixed(1)} s`);
  assert.ok(c.larder < 0.5, `the larder went into them: ${c.larder}`);
});

test("nurses take eggs from the queen to a brood chamber", () => {
  // Three games: one is noisy (over 30 games a nurse colony moved 0–9 eggs in a minute, none in about one game in ten
  // before #17 was merged in, whose Y forks change the tunnels).
  let moved = 0;
  for (const seed of [3, 4, 5]) {
    const w = smallOne(2);
    const map = w.curtain;
    const ch = map.chambers!;
    // A brood chamber dug beside the royal one, out along a tunnel from it.
    cellOf(map.nests[0]!.x, map.nests[0]!.y);
    const [rx, ry] = [CELL[0], CELL[1]];
    let x = rx;
    while (rockAt(map, x, ry) === OPEN) x++;
    for (let k = 0; k < 4; k++) digCell(map, x + k, ry);
    const brood = ch.add(0, ry, "brood");
    for (let k = 4; k < 10; k++) {
      digCell(map, x + k, ry);
      digCell(map, x + k, ry - 1);
      ch.claim(brood.id, x + k, ry, (a, b) => rockAt(map, a, b) === OPEN);
      ch.claim(brood.id, x + k, ry - 1, (a, b) => rockAt(map, a, b) === OPEN);
    }
    const c = colony(w, { antCount: 40, maxAnts: 80 }, seed, () => "explore");
    c.feed(20);
    for (let k = 0; k < 30 * 60; k++) c.tick(1 / 30);
    const inBrood = c.brood.items.filter((b) => b.held < 0 && b.chamber === brood.id).length;
    // Every chamber counts exactly what lies in it (the royal one too: a pick-up takes it off its count).
    for (const ch2 of ch.list)
      assert.equal(
        ch2.brood,
        c.brood.items.filter((b) => b.held < 0 && b.chamber === ch2.id).length,
        `seed ${seed}: chamber ${ch2.id} (${ch2.role})`,
      );
    assert.ok(brood.brood === inBrood, `seed ${seed}: the chamber counts what lies in it`);
    moved += inBrood;
  }
  assert.ok(moved > 0, `brood in the brood chamber over three games: ${moved}`);
});

test("nurses take brood only to a brood chamber of BROOD_MIN cells: past a smaller one, else it stays with the queen (ja-xu6.2)", () => {
  // Off the royal chamber, a tunnel east with a small brood chamber (3 cells) on it, and a big one of exactly BROOD_MIN (4)
  // farther on: sizes fixed, so a BROOD_MIN of 3 or 5 fails too. A chamber just begun is a bulge in a tunnel nobody stands by: brood put there starved
  // (economy.test's setup, world 1 n = 11 on main: 40 larvae). With the big one dug, eggs go there and never to the small
  // one; with only the small one, they stay with the queen.
  const run = (big: boolean, seed: number) => {
    const w = smallOne(2);
    const map = w.curtain;
    const ch = map.chambers!;
    cellOf(map.nests[0]!.x, map.nests[0]!.y);
    const [rx, ry] = [CELL[0], CELL[1]];
    let x = rx;
    while (rockAt(map, x, ry) === OPEN) x++;
    const dig = (n: number, rows: number) => {
      const k = ch.add(0, ry, "brood");
      for (let j = 0; j < n; j++, x++)
        for (let r = 0; r < rows; r++) {
          digCell(map, x, ry - r);
          ch.claim(k.id, x, ry - r, (a, b) => rockAt(map, a, b) === OPEN);
        }
      return k;
    };
    for (let j = 0; j < 3; j++) digCell(map, x++, ry);
    const small = dig(3, 1);
    for (let j = 0; j < 3; j++) digCell(map, x++, ry);
    const large = big ? dig(4, 1) : null;
    assert.ok(small.cells === 3 && (!large || large.cells === 4), "the chambers' sizes, either side of BROOD_MIN (the test's own check)");
    const c = colony(w, { antCount: 40, maxAnts: 80 }, seed, () => "explore");
    c.feed(20);
    for (let k = 0; k < 30 * 60; k++) c.tick(1 / 30);
    const royal = ch.list.find((k) => k.colony === 0 && k.role === "royal")!;
    return { small: small.brood, large: large?.brood ?? 0, royal: royal.brood };
  };
  let large = 0;
  for (const seed of [3, 4, 5]) {
    const both = run(true, seed);
    assert.equal(both.small, 0, `seed ${seed}: nothing in the small brood chamber with a big one dug`);
    large += both.large;
    const only = run(false, seed);
    assert.equal(only.small, 0, `seed ${seed}: nothing in the small brood chamber with none bigger`);
    assert.ok(only.royal > 0, `seed ${seed}: brood stays with the queen (${only.royal})`);
  }
  assert.ok(large > 0, `brood in the big brood chamber over three games: ${large}`);
});

test("orphaned: the queen dies, no egg is laid after, brood in progress still hatches, and the workers age out", () => {
  const c = colony(bare(2), { antCount: 20, maxAnts: 80 }, 4, () => "explore");
  c.feed(40);
  for (let k = 0; k < 30 * 20; k++) c.tick(1 / 30);
  const laid = c.brood.size;
  assert.ok(laid > 0, "eggs before");
  c.killQueen();
  assert.ok(c.orphaned);
  c.feed(40); // food enough for ten more eggs: only her death keeps them from being laid
  const bornBefore = c.births;
  for (let i = 0; i < c.n; i++) c.lifespan[i] = c.age[i]! + 200 + i; // all age out within ~4 minutes
  const before = new Set(c.brood.items);
  let laidAfter = 0;
  for (let k = 0; k < 30 * 300; k++) {
    c.tick(1 / 30);
    for (const b of c.brood.items) if (!before.has(b)) laidAfter++;
  }
  assert.equal(laidAfter, 0, "no egg laid after (room and food for more: only her death stops them)");
  assert.ok(c.births > bornBefore, "brood in progress hatched");
  assert.equal(c.population, c.births - bornBefore, "every worker from before aged out; only those hatched since are left");
  assert.ok(c.diedOld >= 20);
  assert.equal(c.losses, 0, "old age is no loss in a fight (the strategist's losses)");
});

test("strangers at her side kill the queen; a colony with no workers and no pupae is beaten", () => {
  const g = new Game(smallOne(2), { antCount: 40, rivalAnts: 40 }, mulberry32(5));
  const [a, b] = g.colonies as [Colony, Colony];
  // Ten of b's ants on a's queen, in the curtain.
  for (let k = 0; k < 30 * 2 && a.queen!.alive; k++) {
    for (let j = 0; j < 10; j++) b.putAnt(j, CURTAIN, a.queen!.x, a.queen!.y);
    g.tick(1 / 30);
  }
  assert.equal(a.queen!.alive, false, "killed");
  assert.ok(a.orphaned);
  // Beaten: no workers and no pupae.
  for (let i = 0; i < a.n; i++) a.kill(i);
  a.brood.items.length = 0;
  assert.ok(Game.beaten(a));
  a.brood.add(1, 1, -1).stage = PUPA;
  assert.ok(!Game.beaten(a), "a pupa will still hatch");
});

test("a larva is fed before it pupates: with no food for it, it stays a larva", () => {
  const w = bare(2);
  const c = colony(w, { antCount: 20, maxAnts: 30 }, 7, () => "explore");
  c.killQueen(); // no eggs: just the one larva
  cellOf(c.queen!.x, c.queen!.y);
  const b = c.brood.add(CELL[0], CELL[1], w.curtain.chambers!.at(CELL[0], CELL[1]));
  b.stage = LARVA;
  b.t = 1000;
  for (let k = 0; k < 30 * 60; k++) c.tick(1 / 30);
  assert.equal(b.stage, LARVA, "unfed");
  c.feed(4); // its 3, and a little for the energy it used waiting (ja-xu6.1: food goes to its energy first)
  for (let k = 0; k < 30 * 60; k++) c.tick(1 / 30);
  assert.notEqual(b.stage, LARVA, "fed, it pupated");
});
