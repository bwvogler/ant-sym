import { test } from "node:test";
import assert from "node:assert/strict";
import { LARVA, PUPA } from "../brood.ts";
import { Colony } from "../colony.ts";
import { Game } from "../game.ts";
import { CELL, cellOf } from "../hex.ts";
import { digCell, generateSideWorld, mulberry32, OPEN, rockAt } from "../world.ts";

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

test("a forager with food puts it down in reception when there is one; without one, in the royal chamber", () => {
  const map = generateSideWorld(2, SMALL);
  const ch = map.chambers!;
  const royal = ch.list[0]!;
  // A reception chamber: three cells dug in a row a few rows above the royal one, off the shaft.
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const [ex, ey] = [CELL[0] as number, CELL[1] as number];
  let sx = ex;
  let sy = ey + 4;
  for (let x = ex - 3; x <= ex + 3 && rockAt(map, sx, sy) !== OPEN; x++) sx = x; // a shaft cell 4 rows down
  const rec = ch.add(0, sy, "reception");
  for (let k = 1; k <= 3; k++) {
    digCell(map, sx + k, sy);
    ch.claim(rec.id, sx + k, sy, (a, b) => rockAt(map, a, b) === OPEN);
  }
  const drop = (withReception: boolean) => {
    if (!withReception) rec.role = "brood";
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "explore");
    const target = withReception ? rec : royal;
    const before = target.food;
    c.x[0] = map.nest.entrance!.x;
    c.y[0] = map.nest.entrance!.y + 1;
    c.carrying[0] = 1;
    c.mode[0] = 2;
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
