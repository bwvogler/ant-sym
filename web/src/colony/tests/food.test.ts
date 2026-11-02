import { test } from "node:test";
import assert from "node:assert/strict";
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
