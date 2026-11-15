import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, CURTAIN } from "../../colony.ts";
import { Game } from "../../game.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { EXPLORE } from "../../vocab.ts";
import { digCell, mulberry32, OPEN, rockAt } from "../../world.ts";
import { ageOf, smallOne } from "../builders.ts";

// forageDig (ja-16rp, PRD §70) at the dig face: what a bout lets an old forager do that the nest's own diggers (the
// middle-aged) don't, and what it doesn't let it do. tests/int/forageDigBout.test.ts has who takes a bout and when it ends.
// The curtain of seed 2's small one world (S2.3c); each ant's age (and bout) held for the whole run.

/** Every cell of the curtain, whose columns run from x0 (negative) to x0 + w. */
const count = (c: Colony, yes: (x: number, y: number) => boolean) => {
  const map = c.layers[CURTAIN]!.map;
  let n = 0;
  for (let y = 0; y < map.size.h; y++) for (let x = map.x0; x < map.x0 + map.size.w; x++) if (yes(x, y)) n++;
  return n;
};
const cellsDugSince = (c: Colony, t0: number) => count(c, (x, y) => c.layers[CURTAIN]!.map.dugAt.get(x, y) > t0);
const chamberCells = (c: Colony) => count(c, (x, y) => c.layers[CURTAIN]!.map.chambers!.at(x, y) >= 0);

test("forageDig: alone at a tunnel's dead end in a roomy nest, an ant on a bout digs on; a middle-aged one mostly turns away", () => {
  // A six-cell tunnel off the nest chamber's far wall, the ant four cells in, heading for its end, 20 s, eight seeds. A bout
  // skips digChance (no nestmates by) and ROOMY_DIG at a dead end; the middle-aged ant has both.
  const run = (bout: boolean, seed: number) => {
    const w = smallOne(2);
    const map = w.curtain;
    cellOf(map.nests[0]!.x, map.nests[0]!.y);
    const sy = CELL[1];
    let sx = CELL[0];
    while (rockAt(map, sx - 1, sy) === OPEN) sx--;
    for (let k = 1; k <= 6; k++) digCell(map, sx - k, sy);
    // In a Game, so the colony counts its ants round each cell (friends) and digChance applies to an ant without a bout.
    const g = new Game(w, { antCount: 1, rival: false }, mulberry32(seed), { colony: { forageDig: 120 } });
    const c = g.player;
    c.putAnt(0, CURTAIN, centreX(sx - 4, sy), centreY(sy));
    c.heading[0] = Math.PI;
    c.mode[0] = EXPLORE;
    const t0 = c.time;
    for (let t = 0; t < 30 * 20; t++) {
      c.age[0] = ageOf(bout ? 2 : 1);
      if (bout) c.digBout[0] = 100;
      g.tick(1 / 30);
    }
    return cellsDugSince(c, t0);
  };
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const onBout = seeds.map((s) => run(true, s));
  const middle = seeds.map((s) => run(false, s));
  // Measured: on a bout every seed dug (12 cells in all); middle-aged, two seeds of eight dug a cell each.
  assert.ok(onBout.filter((n) => n > 0).length >= 7, `on a bout, seeds that dug: ${onBout.join(" ")}`);
  assert.ok(middle.filter((n) => n > 0).length <= 3, `middle-aged, seeds that dug: ${middle.join(" ")}`);
});

test("forageDig: in a crowded nest, ants on a bout build and widen no chamber; middle-aged diggers do", () => {
  // 200 ants crowd the founding nest (crowded()); 30 s. Measured (S2.3c): the middle-aged add 6-7 chamber cells (seeds 1-4), ants on a bout none.
  const run = (bout: boolean, seed: number) => {
    const w = smallOne(2);
    const c = new Colony(
      w.curtain,
      { antCount: 200, maxAnts: 200, forageDig: 120 },
      mulberry32(seed),
      (() => "explore") as never,
      undefined,
      {
        plane: w.plane,
        line: w.line,
      },
    );
    const before = chamberCells(c);
    for (let t = 0; t < 30 * 30; t++) {
      for (let i = 0; i < c.n; i++) {
        c.age[i] = ageOf(bout ? 2 : 1);
        if (bout) c.digBout[i] = 100;
      }
      c.tick(1 / 30);
    }
    return chamberCells(c) - before;
  };
  assert.ok(run(false, 2) > 0, "the middle-aged dug chambers (the nest was crowded)");
  assert.equal(run(true, 2), 0, "on a bout, none");
});
