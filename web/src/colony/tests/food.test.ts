import { test } from "node:test";
import assert from "node:assert/strict";
import { LARVA, PUPA } from "../brood.ts";
import { Colony, LIFESPAN, MIDDLE, YOUNG } from "../colony.ts";
import { Game } from "../game.ts";
import { CELL, cellOf, centreX, centreY } from "../hex.ts";
import { digCell, generateSideWorld, mulberry32, OPEN, rockAt, type WorldMap } from "../world.ts";

// Nest slice 5 (docs/nest-and-home.md §3.6): food lies in chambers. Foragers bring it to reception; porters carry it to
// where brood and the queen want it, and the rest down to stores; the queen and larvae eat what lies by them.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

test("the larder is the food lying in the colony's chambers, porters move it, and the queen's brood is raised from it", () => {
  const map = generateSideWorld(2, SMALL);
  const g = new Game(map, { antCount: 300, rival: false }, mulberry32(4));
  const c = g.player;
  for (let k = 0; k < 30 * 300; k++) {
    g.tick(1 / 30);
    if (k % 300 === 0) {
      let inChambers = 0;
      for (const ch of map.chambers!.list) if (ch.colony === 0) inChambers += ch.food;
      assert.ok(Math.abs(inChambers - c.larder) < 1e-6, `larder ${c.larder} vs chambers ${inChambers}`);
      for (const ch of map.chambers!.list) assert.ok(ch.food > -1e-9, `chamber ${ch.id} (${ch.role}) food ${ch.food}`);
    }
  }
  assert.ok(c.portTrips > 50, `porter trips ${c.portTrips}`);
  assert.ok(c.births > 20, `births ${c.births}`);
});

/** A reception chamber of `cells` cells dug in a row off the shaft, four rows below the hole, for colony 0. */
function reception(map: WorldMap, cells: number) {
  const ch = map.chambers!;
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const [ex, ey] = [CELL[0] as number, CELL[1] as number];
  let sx = ex;
  const sy = ey + 4;
  for (let x = ex - 3; x <= ex + 3 && rockAt(map, sx, sy) !== OPEN; x++) sx = x; // a shaft cell 4 rows down
  const rec = ch.add(0, sy, "reception");
  for (let k = 1; k <= cells; k++) {
    digCell(map, sx + k, sy);
    ch.claim(rec.id, sx + k, sy, (a, b) => rockAt(map, a, b) === OPEN);
  }
  return rec;
}

/** A colony of one forager carrying food in at the hole: which chamber its food goes to. */
function forage(map: WorldMap) {
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "explore");
  c.x[0] = map.nest.entrance!.x;
  c.y[0] = map.nest.entrance!.y + 1;
  c.carrying[0] = 1;
  c.mode[0] = 2;
  return c;
}

test("a forager with food puts it down in reception when there is one; without one, in the royal chamber", () => {
  const map = generateSideWorld(2, SMALL);
  const royal = map.chambers!.list[0]!;
  const rec = reception(map, 4);
  const drop = (withReception: boolean) => {
    if (!withReception) rec.role = "brood";
    const c = forage(map);
    const target = withReception ? rec : royal;
    const before = target.food;
    for (let k = 0; k < 30 * 60 && c.stored === 0; k++) c.tick(1 / 30);
    rec.role = "reception";
    return { stored: c.stored, got: target.food - before };
  };
  const a = drop(true);
  assert.equal(a.stored, 1, "home");
  assert.equal(a.got, 1, "reception got it");
  const b = drop(false);
  assert.equal(b.stored, 1);
  assert.ok(b.got >= 1, `royal got it: ${b.got}`);
});

test("a reception of a cell or two is no reception yet: foragers take their food to the royal chamber (review of slice 5: a one-cell reception choked the colony)", () => {
  const map = generateSideWorld(2, SMALL);
  const royal = map.chambers!.list[0]!;
  const rec = reception(map, 1);
  const c = forage(map);
  for (let k = 0; k < 30 * 60 && c.stored === 0; k++) c.tick(1 / 30);
  assert.equal(c.stored, 1, "home");
  assert.equal(rec.food, 0, "not into the one-cell reception");
  assert.equal(royal.food, 1, "into the royal chamber");
});

test("a forager finding food already waiting at reception carries its own on to where it is wanted (a backlog: the porters aren't keeping up)", () => {
  const map = generateSideWorld(2, SMALL);
  const royal = map.chambers!.list[0]!;
  const rec = reception(map, 4);
  const c = forage(map);
  rec.food += 5; // waiting there already
  c.larder += 5;
  // The queen alive and her chamber empty: it wants her stock (QUEEN_STOCK).
  for (let k = 0; k < 30 * 120 && royal.food === 0; k++) c.tick(1 / 30);
  assert.equal(c.handedOn, 1, "handed on at reception");
  assert.equal(c.stored, 1, "home (counted once, at reception)");
  assert.equal(royal.food, 1, "carried on to the royal chamber");
  assert.equal(rec.food, 5, "the food waiting there stays for the porters");
  assert.ok(Math.abs(c.larder - 6) < 1e-9, `the larder is all of it: ${c.larder}`);
});

test("food beyond the queen's stock in the royal chamber is carried on to hungry larvae (no reception yet: foragers put it there)", () => {
  const map = generateSideWorld(2, SMALL);
  const { b: room, cell } = broodChamber(map);
  const c = new Colony(map, { antCount: 12, maxAnts: 16, deposit: 0 }, mulberry32(5), () => "explore");
  for (let i = 0; i < c.n; i++) ((c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN), (c.lifespan[i] = Infinity)); // diggers and carriers
  c.killQueen(); // no eggs: just the one larva
  const larva = c.brood.add(cell[0], cell[1], room.id);
  room.brood++;
  larva.stage = LARVA;
  c.feed(20); // all in the royal chamber
  for (let k = 0; k < 30 * 90 && larva.stage === LARVA; k++) c.tick(1 / 30);
  assert.ok(c.portTrips > 0, "porters took it from the royal chamber");
  assert.notEqual(larva.stage, LARVA, `the larva was fed (${larva.fed.toFixed(2)}) and pupated`);
});

test("porters lay no food trail: food moved between chambers is no food to recruit to (review of slice 5: 4–5× as many ants followed food scent underground)", () => {
  const map = generateSideWorld(2, SMALL);
  const rec = reception(map, 4);
  const c = new Colony(map, { antCount: 1, maxAnts: 1 }, mulberry32(4), () => "explore");
  c.age[0] = ((YOUNG + MIDDLE) / 2) * LIFESPAN; // a carrier inside
  c.lifespan[0] = Infinity;
  rec.food += 3;
  c.larder += 3;
  // In reception: it takes a unit to the royal chamber (the queen wants her stock there).
  const at = [rec.x0 + 1, rec.floorRow] as const;
  c.x[0] = centreX(at[0], at[1]);
  c.y[0] = centreY(at[1]);
  let carried = false;
  for (let k = 0; k < 30 * 120 && c.portTrips === 0; k++) {
    c.tick(1 / 30);
    carried ||= c.porting(0);
  }
  assert.ok(carried && c.portTrips === 1, `it carried a unit and put it down (${c.portTrips} trips)`);
  let food = 0;
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) food += c.ph.fields.food.get(x, y);
  assert.equal(food, 0, "no food trail anywhere");
});

test("food is conserved over a game: map + jaws + larder + brood (1 + fed each) + 4 a birth is what the map started with", () => {
  // Review of slice 4: the invariant held to 2e-10 in reviewers' runs, but nothing tested it.
  const map = generateSideWorld(1, { ...SMALL, nestCount: 2 });
  const g = new Game(map, { antCount: 200, rivalAnts: 200 }, mulberry32(7));
  let worst = 0;
  for (let k = 0; k < 30 * 300; k++) {
    g.tick(1 / 30);
    if (k % 150) continue;
    let s = map.foodLeft;
    for (const c of g.colonies) {
      for (let i = 0; i < c.n; i++) if (c.alive[i] && c.carrying[i]) s += 1;
      s += c.larder + 4 * c.births;
      for (const b of c.brood.items) s += 1 + b.fed;
    }
    worst = Math.max(worst, Math.abs(s - map.foodTotal));
  }
  assert.ok(g.colonies.every((c) => c.births > 0 && c.portTrips > 0), "brood raised, food moved");
  assert.ok(worst < 1e-6, `food drifted by ${worst}`);
});

/** A brood chamber of three cells dug beside the royal one (to its east), for colony 0. */
function broodChamber(map: ReturnType<typeof generateSideWorld>) {
  const ch = map.chambers!;
  cellOf(map.nest.x, map.nest.y);
  const [rx, ry] = [CELL[0] as number, CELL[1] as number];
  let x = rx;
  while (rockAt(map, x, ry) === OPEN) x++;
  digCell(map, x, ry);
  const b = ch.add(0, ry, "brood");
  for (let k = 1; k <= 3; k++) {
    digCell(map, x + k, ry);
    ch.claim(b.id, x + k, ry, (a, y) => rockAt(map, a, y) === OPEN);
  }
  return { b, cell: [x + 2, ry] as const };
}

test("a larva eats what lies in its own chamber, not the royal chamber's", () => {
  const map = generateSideWorld(2, SMALL);
  const { b: room, cell } = broodChamber(map);
  const c = new Colony(map, { antCount: 1, maxAnts: 4 }, mulberry32(2), () => "explore");
  c.kill(0); // no porters: only where the food lies counts
  c.killQueen();
  const larva = c.brood.add(cell[0], cell[1], room.id);
  room.brood++;
  larva.stage = LARVA;
  larva.t = 100;
  c.feed(10); // in the royal chamber
  for (let k = 0; k < 30 * 30; k++) c.tick(1 / 30);
  assert.equal(larva.fed, 0, "the royal chamber's food is not its");
  room.food += 3;
  c.larder += 3;
  for (let k = 0; k < 30 * 30; k++) c.tick(1 / 30);
  assert.equal(larva.stage, PUPA, "fed from its own, it pupated");
});

test("a larva lying outside any chamber is taken in and raised (review of slice 5: strays starved)", () => {
  const map = generateSideWorld(2, SMALL);
  const g = new Game(map, { antCount: 80, rival: false }, mulberry32(3));
  const c = g.player;
  // A larva on the shaft just below the hole: in no chamber.
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y + 3);
  const stray = c.brood.add(CELL[0] as number, CELL[1] as number, -1);
  stray.stage = LARVA;
  c.feed(30);
  for (let k = 0; k < 30 * 120 && stray.stage === LARVA; k++) g.tick(1 / 30);
  assert.notEqual(stray.stage, LARVA, `still a larva: in chamber ${stray.chamber}, fed ${stray.fed}`);
});
