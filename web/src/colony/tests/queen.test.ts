import { test } from "node:test";
import assert from "node:assert/strict";
import { EGG, LARVA, PUPA } from "../brood.ts";
import { Colony, T_EGG, T_LARVA, T_PUPA } from "../colony.ts";
import { Game } from "../game.ts";
import { cellOf, CELL, centreX } from "../hex.ts";
import { digCell, generateSideWorld, generateWorld, mulberry32, OPEN, rockAt } from "../world.ts";

// Nest slice 4 (docs/nest-and-home.md §3.4): the queen lays, brood grows from egg to larva (fed) to pupa, workers are
// born from pupae, and a colony that loses its queen is orphaned: no more eggs, its workers age out.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

/** A side world with no food on it: what the colony eats is only what a test puts in its larder. */
function bare(seed: number) {
  const map = generateSideWorld(seed, SMALL);
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) map.food.set(x, y, 0);
  return map;
}

test("the side view's colony has a queen; the top-down maps keep the larder, with no queen", () => {
  assert.equal(new Colony(generateWorld(1), { antCount: 10 }, mulberry32(1)).queen, null);
  const map = generateSideWorld(2, SMALL);
  const c = new Colony(map, { antCount: 10 }, mulberry32(1));
  assert.ok(c.queen?.alive);
  assert.equal(c.orphaned, false);
  // She lies on the royal chamber's floor: its bottom row, under the founding chamber's centre (review of slice 4: she
  // was placed a row below the centre, rows above the floor).
  for (const seed of [1, 2, 3, 4]) {
    const m = generateSideWorld(seed, { ...SMALL, nestCount: 2 });
    for (const k of [0, 1]) {
      const q = new Colony(m, { antCount: 1, nest: k }, mulberry32(1)).queen!;
      cellOf(q.x, q.y);
      const royal = m.chambers!.list.find((ch) => ch.colony === k && ch.role === "royal")!;
      assert.equal(m.chambers!.at(CELL[0] as number, CELL[1] as number), royal.id, `seed ${seed}, colony ${k}: in her chamber`);
      assert.equal(CELL[1], royal.floorRow, `seed ${seed}, colony ${k}: on its floor`);
      assert.ok(Math.abs(q.x - m.nests[k]!.x) <= 1, `seed ${seed}, colony ${k}: under its centre`);
    }
  }
});

test("queen to worker: she lays while there is food; an egg becomes a larva, is fed, pupates, and a worker is born where the pupa lay", () => {
  const map = bare(2);
  const c = new Colony(map, { antCount: 20, maxAnts: 30 }, mulberry32(2), () => "explore");
  c.feed(8); // two workers' worth
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
          cellOf(c.x[i] as number, c.y[i] as number);
          if (pupae.includes(`${CELL[0]},${CELL[1]}`) && c.x[i] === centreX(CELL[0] as number, CELL[1] as number)) bornAtPupa++;
        }
    pupae = c.brood.items.filter((b) => b.stage === PUPA).map((b) => `${b.x},${b.y}`);
    for (const b of c.brood.items) stages.add(b.stage);
    if (c.births > 0 && firstBirth < 0) firstBirth = c.time;
  }
  assert.equal(bornAtPupa, c.births, "each worker born on its pupa's cell");
  assert.ok(stages.has(EGG) && stages.has(LARVA) && stages.has(PUPA), `stages seen ${[...stages]}`);
  assert.equal(c.births, 2, "two workers from eight food");
  assert.ok(firstBirth >= T_EGG + T_LARVA + T_PUPA - 1, `no worker sooner than egg + larva + pupa: ${firstBirth.toFixed(1)} s`);
  assert.ok(c.larder < 1e-6, `the larder went into them: ${c.larder}`);
});

test("nurses take eggs from the queen to a brood chamber", () => {
  // Three games: one is noisy (over 30 games a nurse colony moved 0–9 eggs in a minute, none in about one game in ten
  // before #17 was merged in, whose Y forks change the tunnels).
  let moved = 0;
  for (const seed of [3, 4, 5]) {
    const map = generateSideWorld(2, SMALL);
    const ch = map.chambers!;
    // A brood chamber dug beside the royal one, out along a tunnel from it.
    cellOf(map.nest.x, map.nest.y);
    const [rx, ry] = [CELL[0] as number, CELL[1] as number];
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
    const c = new Colony(map, { antCount: 40, maxAnts: 80 }, mulberry32(seed), () => "explore");
    c.feed(20);
    for (let k = 0; k < 30 * 60; k++) c.tick(1 / 30);
    const inBrood = c.brood.items.filter((b) => b.held < 0 && b.chamber === brood.id).length;
    // Every chamber counts exactly what lies in it (the royal one too: a pick-up takes it off its count).
    for (const ch2 of ch.list) assert.equal(ch2.brood, c.brood.items.filter((b) => b.held < 0 && b.chamber === ch2.id).length, `seed ${seed}: chamber ${ch2.id} (${ch2.role})`);
    assert.ok(brood.brood === inBrood, `seed ${seed}: the chamber counts what lies in it`);
    moved += inBrood;
  }
  assert.ok(moved > 0, `brood in the brood chamber over three games: ${moved}`);
});

test("orphaned: the queen dies, no egg is laid after, brood in progress still hatches, and the workers age out", () => {
  const map = bare(2);
  const c = new Colony(map, { antCount: 20, maxAnts: 80 }, mulberry32(4), () => "explore");
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

test("strangers at her side kill the queen; a side-view colony with no workers and no pupae is beaten", () => {
  const map = generateSideWorld(2, { ...SMALL, nestCount: 2 });
  const g = new Game(map, { antCount: 40, rivalAnts: 40 }, mulberry32(5));
  const [a, b] = g.colonies as [Colony, Colony];
  // Ten of b's ants on a's queen.
  for (let k = 0; k < 10; k++) {
    b.x[k] = a.queen!.x;
    b.y[k] = a.queen!.y;
  }
  for (let k = 0; k < 30 * 2 && a.queen!.alive; k++) {
    for (let j = 0; j < 10; j++) {
      b.x[j] = a.queen!.x;
      b.y[j] = a.queen!.y;
    }
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

test("the strategist reads the larder as full only for food the brood won't eat, at the cap (a growing colony went raiding)", () => {
  const map = bare(2);
  const c = new Colony(map, { antCount: 20, maxAnts: 30 }, mulberry32(6));
  c.feed(20);
  assert.equal(c.stanceSituation(false).larder, "low", "growing (room for more): its food is for brood");
  for (let i = 20; i < 30; i++) c.spawn();
  assert.equal(c.population, 30);
  assert.equal(c.stanceSituation(false).larder, "full", "at the cap with nothing owed: spare food");
  assert.equal(new Colony(generateWorld(1), { antCount: 10 }, mulberry32(1)).stanceSituation(false).larder, "low");
});

test("a larva is fed before it pupates: with no food for it, it stays a larva", () => {
  const map = bare(2);
  const c = new Colony(map, { antCount: 20, maxAnts: 30 }, mulberry32(7), () => "explore");
  c.killQueen(); // no eggs: just the one larva
  cellOf(c.queen!.x, c.queen!.y);
  const b = c.brood.add(CELL[0] as number, CELL[1] as number, map.chambers!.at(CELL[0] as number, CELL[1] as number));
  b.stage = LARVA;
  b.t = 1000;
  for (let k = 0; k < 30 * 60; k++) c.tick(1 / 30);
  assert.equal(b.stage, LARVA, "unfed");
  c.feed(3);
  for (let k = 0; k < 30 * 60; k++) c.tick(1 / 30);
  assert.notEqual(b.stage, LARVA, "fed, it pupated");
});

