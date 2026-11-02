import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, CORPSE_ROT, LIFESPAN, MIDDEN_AT, MIDDLE, YOUNG } from "../colony.ts";
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
  // Past the mound's largest reach, so its growth never buries the midden (review of slice 7: it was 3 columns out).
  for (const k of c.corpses.filter((k) => k.midden)) {
    assert.ok(k.x - ex >= MIDDEN_AT - 3, `past the mound (column ${k.x - ex} from the hole)`);
  }
});

const middleAged = (c: Colony) => {
  for (let i = 0; i < c.n; i++) c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
};

test("each colony's midden lies toward the other: a boundary between them", () => {
  const map = generateSideWorld(2, { ...SMALL, nestCount: 2 });
  const g = new Game(map, { antCount: 120, rivalAnts: 120 }, mulberry32(4));
  for (const c of g.colonies) (middleAged(c), (c.stancePolicy = () => "forage"), (c.stance = "forage"));
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  for (const c of g.colonies) {
    let killed = 0;
    // near the hole, in it or on the ground (the rival's ants were mostly out: few underground to kill)
    for (let i = 0; i < c.n && killed < 12; i++) if (c.alive[i] && !c.carrying[i] && !c.pellet[i] && Math.abs(c.x[i]! - c.nest.entrance!.x) < 15) (c.kill(i), killed++);
  }
  for (let k = 0; k < 30 * 180; k++) g.tick(1 / 30);
  const [a, b] = g.colonies as [Colony, Colony];
  const col = (c: Colony) => (cellOf(c.nest.entrance!.x, c.nest.entrance!.y), CELL[0] as number);
  const toward = Math.sign(col(b) - col(a));
  for (const [c, side] of [[a, toward], [b, -toward]] as const) {
    const heap = c.corpses.filter((k) => k.midden);
    // and on its own side of the halfway line (40 % of the way at most: the nests here are only 120 columns apart)
    for (const k of heap) assert.ok(Math.abs(k.x - col(c)) < Math.abs(k.x - col(c === a ? b : a)), "on its own ground");
    assert.ok(heap.length >= 6, `${heap.length} on the midden`);
    for (const k of heap) assert.equal(Math.sign(k.x - col(c)), side, `colony ${c.nest === a.nest ? "a" : "b"}'s midden faces the rival`);
  }
});

test("an undertaker that dies leaves the corpse it carried lying; the unclaimed dead rot", () => {
  const map = generateSideWorld(2, SMALL);
  const g = new Game(map, { antCount: 150, rival: false }, mulberry32(4));
  const c = g.player;
  middleAged(c);
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  const victim = Array.from({ length: c.n }, (_, i) => i).find((i) => c.alive[i] && !c.carrying[i] && !c.pellet[i] && c.y[i]! > map.nest.entrance!.y + 3)!;
  c.kill(victim);
  let carrier = -1;
  for (let k = 0; k < 30 * 120 && carrier < 0; k++) {
    g.tick(1 / 30);
    for (let i = 0; i < c.n; i++) if (c.alive[i] && c.carriesCorpse(i)) carrier = i;
  }
  assert.ok(carrier >= 0, "someone takes the corpse up");
  c.kill(carrier);
  assert.equal(c.corpses.length, 2, "the carried corpse and the carrier's");
  for (const k of c.corpses) assert.equal(k.held, -1, "both lie where the carrier fell");
  assert.equal(c.carriesCorpse(carrier), false);
  for (const k of c.corpses) k.died = c.time - CORPSE_ROT - 1;
  g.tick(1 / 30);
  assert.equal(c.corpses.filter((k) => k.held < 0).length, 0, "rotted away");
});

test("raiders leave their own nest and go in at the rival's hole, down toward its chamber", () => {
  const map = generateSideWorld(1, { ...SMALL, nestCount: 2 });
  const g = new Game(map, { antCount: 150, rivalAnts: 150 }, mulberry32(1));
  const [a, b] = g.colonies as [Colony, Colony];
  middleAged(b);
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  b.stancePolicy = () => "raid";
  let rivalSide = 0;
  let inRival = 0;
  for (let k = 0; k < 30 * 40; k++) {
    g.tick(1 / 30);
    b.stance = "raid";
    if (k % 30) continue;
    let near = 0;
    let under = 0;
    for (let i = 0; i < b.n; i++) {
      if (!b.alive[i]) continue;
      if (Math.abs(b.x[i]! - a.nest.entrance!.x) >= Math.abs(b.x[i]! - b.nest.entrance!.x)) continue;
      near++;
      cellOf(b.x[i]!, b.y[i]!);
      if (!isSky(map, CELL[0] as number, CELL[1] as number)) under++;
    }
    rivalSide = Math.max(rivalSide, near);
    inRival = Math.max(inRival, under);
  }
  // Review of slice 7: none got past their own nest (they steered at the rival through soil, from their chambers).
  assert.ok(rivalSide >= 40, `${rivalSide} raiders reach the rival's side`);
  assert.ok(inRival >= 3, `${inRival} in under the rival's hole`);
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
