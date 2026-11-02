import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, LIFESPAN, MIDDLE, YOUNG } from "../colony.ts";
import { Game } from "../game.ts";
import { CELL, cellOf, centreX, centreY } from "../hex.ts";
import { generateSideWorld, isSky, mulberry32, OPEN, rockAt, type WorldMap } from "../world.ts";

// Nest slice 7 (docs/nest-and-home.md §3.7): the dead lie where they fall until an undertaker (middle-aged) carries
// them out to the midden past the mound's edge; the midden marks the colony's ground, and raiders shy from it.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

function walkway(map: WorldMap, x: number): number {
  for (let y = 0; y < map.size.h; y++) if (isSky(map, x, y) && rockAt(map, x, y) === OPEN) return y;
  return -1;
}

test("the dead are carried out to the midden on the ground, past the mound; soil accounting is untouched", () => {
  const map = generateSideWorld(2, SMALL);
  const g = new Game(map, { antCount: 200, rival: false }, mulberry32(4));
  const c = g.player;
  for (let i = 0; i < c.n; i++) c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN; // undertakers: the middle-aged
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  let killed = 0;
  for (let i = 0; i < c.n && killed < 20; i++) if (c.alive[i] && !c.carrying[i] && !c.pellet[i] && c.y[i]! > map.nest.entrance!.y + 3) (c.kill(i), killed++);
  assert.equal(c.corpses.length, 20);
  for (let k = 0; k < 30 * 180; k++) {
    g.tick(1 / 30);
    if (k % 300 === 0) assert.equal(c.soilDug, c.soilOut + c.soilFilled + c.carriedPellets().dug + c.soilLost, "dug = mound + filled + carried + lost");
  }
  assert.ok(c.buried >= 15, `${c.buried} of 20 on the midden`);
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  for (const k of c.corpses.filter((k) => k.midden)) {
    assert.ok(k.x - ex > 3, `past the mound (column ${k.x - ex} from the hole)`);
  }
});

test("a raider walking at the rival's hole shies from its midden", () => {
  const run = (midden: boolean) => {
    const map = generateSideWorld(2, { ...SMALL, nestCount: 2 });
    const g = new Game(map, { antCount: 1, rivalAnts: 1 }, mulberry32(5));
    const [a, b] = g.colonies as [Colony, Colony];
    a.kill(0);
    cellOf(map.nests[0]!.entrance!.x, map.nests[0]!.entrance!.y);
    const ex = CELL[0] as number;
    // a's midden mark along the ground for 10 columns east of its hole (where a raider from the east comes in).
    if (midden) for (let x = ex + 4; x <= ex + 14; x++) a.ph.depositCell("midden", x, walkway(map, x), 20);
    // b's raider on the ground 25 columns east of a's hole, facing it.
    const sx = ex + 25;
    b.x[0] = centreX(sx, walkway(map, sx));
    b.y[0] = centreY(walkway(map, sx));
    b.heading[0] = Math.PI;
    b.stancePolicy = () => "raid";
    b.stance = "raid";
    b.mode[0] = 3;
    let closest = Infinity;
    for (let k = 0; k < 30 * 20; k++) {
      g.tick(1 / 30);
      b.stance = "raid";
      closest = Math.min(closest, Math.abs((b.x[0] as number) - map.nests[0]!.entrance!.x));
    }
    return closest;
  };
  const without = run(false);
  const withMidden = run(true);
  assert.ok(without < 6, `without a midden it gets to the hole: ${without.toFixed(1)}`);
  assert.ok(withMidden > without + 4, `with one it keeps off: ${withMidden.toFixed(1)} vs ${without.toFixed(1)}`);
});
