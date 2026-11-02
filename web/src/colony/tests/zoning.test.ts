import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, FORAGERS, LIFESPAN, MIDDLE, YOUNG } from "../colony.ts";
import { Game } from "../game.ts";
import { CELL } from "../hex.ts";
import { generateSideWorld, generateWorld, groundTop, isSky, mulberry32 } from "../world.ts";

// Nest slice 6 (docs/nest-and-home.md §3.5, Tschinkel): who works where goes by age. The young nurse, deep with the
// queen and brood, and never go out; the middle-aged dig and carry inside; the old forage.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

function aged(c: Colony, share: number): void {
  for (let i = 0; i < c.n; i++) {
    c.age[i] = share * LIFESPAN;
    c.lifespan[i] = Infinity;
  }
}

test("bands: on the top-down maps every ant is old; in the side view by age", () => {
  const top = new Colony(generateWorld(1), { antCount: 5 }, mulberry32(1));
  assert.equal(top.band(0), 2);
  const c = new Colony(generateSideWorld(2, SMALL), { antCount: 5 }, mulberry32(1));
  c.age[0] = 0;
  c.age[1] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
  c.age[2] = (MIDDLE + 0.1) * LIFESPAN;
  assert.deepEqual([c.band(0), c.band(1), c.band(2)], [0, 1, 2]);
});

test("the young never go out, the old do; the middle-aged go out only while foragers are short", () => {
  const outShare = (share: number) => {
    const map = generateSideWorld(2, SMALL);
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
  assert.ok(middle > 0 && middle <= FORAGERS + 0.1, `the middle-aged go out, but only up to about FORAGERS: ${(middle * 100).toFixed(0)} %`);
});

test("the young sit deeper than the old, and only the middle-aged dig", () => {
  const map = generateSideWorld(2, SMALL);
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
});
