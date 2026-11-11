import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, LIFESPAN, MIDDLE, YOUNG } from "../../colony.ts";
import { Game } from "../../game.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { digCell, generateSideWorld, generateWorld, groundTop, isSky, mulberry32, OPEN, rockAt } from "../../world.ts";
import { SMALL_SIDE } from "../builders.ts";

// Nest slice 6 (docs/nest-and-home.md §3.5, Tschinkel): who works where goes by age. The young nurse, deep with the
// queen and brood, and never go out; the middle-aged dig and carry inside; the old forage.


function aged(c: Colony, share: number): void {
  for (let i = 0; i < c.n; i++) {
    c.age[i] = share * LIFESPAN;
    c.lifespan[i] = Infinity;
  }
}

test("bands: on the top-down maps every ant is old; in the side view by age", () => {
  const top = new Colony(generateWorld(1), { antCount: 5 }, mulberry32(1));
  assert.equal(top.band(0), 2);
  const c = new Colony(generateSideWorld(2, SMALL_SIDE), { antCount: 5 }, mulberry32(1));
  c.age[0] = 0;
  c.age[1] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
  c.age[2] = (MIDDLE + 0.1) * LIFESPAN;
  assert.deepEqual([c.band(0), c.band(1), c.band(2)], [0, 1, 2]);
});

test("the young never go out; the old do, more than the middle-aged (the old climb out to forage)", () => {
  const outShare = (share: number) => {
    const map = generateSideWorld(2, SMALL_SIDE);
    const g = new Game(map, { antCount: 120, rival: false }, mulberry32(3));
    aged(g.player, share);
    let out = 0;
    let n = 0;
    for (let k = 0; k < 30 * 90; k++) {
      g.tick(1 / 30);
      if (k % 30 !== 0) continue;
      const c = g.player;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.carrying[i] || c.pellet[i]) continue;
        c.antCell(i);
        n++;
        if (isSky(map, CELL[0] as number, CELL[1] as number)) out++;
      }
    }
    return out / n;
  };
  const young = outShare(0.05);
  const middle = outShare((YOUNG + MIDDLE) / 2);
  const old = outShare(MIDDLE + 0.1);
  assert.equal(young, 0, "the young stay in");
  assert.ok(old > 0.1, `the old forage: ${(old * 100).toFixed(0)} % out`);
  assert.ok(middle > 0 && middle < old, `the middle-aged go out less than the old: ${(middle * 100).toFixed(0)} % vs ${(old * 100).toFixed(0)} %`);
});

test("the young sit deeper than the old, and only the middle-aged dig", () => {
  const map = generateSideWorld(2, SMALL_SIDE);
  const g = new Game(map, { antCount: 300, rival: false }, mulberry32(5));
  const c = g.player;
  // Ages well inside each band, so none crosses into the next in the two minutes (an ant mid-dig as it comes of age finishes).
  for (let i = 0; i < c.n; i++) {
    c.age[i] = [0.02, 0.22, 0.5][i % 3]! * LIFESPAN;
    c.lifespan[i] = Infinity;
  }
  let dugByOthers = 0;
  for (let k = 0; k < 30 * 120; k++) {
    const before = c.soilDug;
    const bandsDigging = new Map<number, number>();
    for (let i = 0; i < c.n; i++) if (c.alive[i] && c.digT[i]! > 0) bandsDigging.set(i, c.band(i));
    g.tick(1 / 30);
    if (c.soilDug > before) for (const [, b] of bandsDigging) if (b !== 1) dugByOthers++;
  }
  assert.equal(dugByOthers, 0, "nobody but the middle-aged was digging");
  const depth = [0, 0, 0];
  const count = [0, 0, 0];
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i]) continue;
    c.antCell(i);
    const b = c.band(i);
    depth[b]! += Math.max(0, (CELL[1] as number) - groundTop(map, CELL[0] as number));
    count[b]!++;
  }
  assert.ok(depth[0]! / count[0]! > depth[2]! / count[2]!, `young ${(depth[0]! / count[0]!).toFixed(1)} rows deep, old ${(depth[2]! / count[2]!).toFixed(1)}`);
  // …and with the queen: of the ants underground, the young nearer her than the middle-aged (they keep to the royal and
  // brood marks; inside anyway, they'd otherwise wander the nest like anyone).
  const near = [0, 0, 0];
  const inside = [0, 0, 0];
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i]) continue;
    c.antCell(i);
    if (isSky(map, CELL[0] as number, CELL[1] as number)) continue;
    near[c.band(i)]! += Math.hypot(c.x[i]! - c.queen!.x, c.y[i]! - c.queen!.y);
    inside[c.band(i)]!++;
  }
  assert.ok(near[0]! / inside[0]! < near[1]! / inside[1]!, `from the queen, underground: young ${(near[0]! / inside[0]!).toFixed(1)}, middle-aged ${(near[1]! / inside[1]!).toFixed(1)}`);
});

test("an old forager in a dead-end tunnel whose tip lies just under the ground by the hole goes back down and out by the shaft (review of #25)", () => {
  // Stepping straight toward the hole, the tip is nearer it than anything round it: old ants don't dig, so the first cut
  // parked them there until their mode changed. They climb out by the way through the tunnels (#climbOut).
  const map = generateSideWorld(2, SMALL_SIDE);
  const n = map.nest;
  cellOf(n.entrance!.x, n.entrance!.y);
  const ex = CELL[0] as number;
  const ey = CELL[1] as number;
  cellOf(n.x, n.y);
  const cy = CELL[1] as number;
  // A branch east out of the chamber's upper side, then straight up, its tip two rows under the ground line beside the hole.
  const tipX = ex + 4;
  let x = CELL[0] as number;
  while (rockAt(map, x, cy - 3) === OPEN) x++;
  for (; x <= tipX; x++) digCell(map, x, cy - 3);
  for (let y = cy - 3; y >= ey + 2; y--) digCell(map, tipX, y);
  assert.ok(!isSky(map, tipX, ey + 1) && rockAt(map, tipX, ey + 1) !== OPEN, "a dead end under the crust");
  const c = new Colony(map, { antCount: 1, maxAnts: 1 }, mulberry32(4), () => "explore");
  aged(c, MIDDLE + 0.2);
  c.x[0] = centreX(tipX, ey + 5);
  c.y[0] = centreY(ey + 5);
  c.heading[0] = -Math.PI / 2;
  let out = -1;
  for (let k = 0; k < 30 * 60 && out < 0; k++) {
    c.tick(1 / 30);
    c.antCell(0);
    if (isSky(map, CELL[0] as number, CELL[1] as number)) out = k / 30;
  }
  assert.equal(c.mode[0], 0, "still exploring (a forager on its way out)");
  assert.ok(out >= 0, "out on the ground within a minute");
});
