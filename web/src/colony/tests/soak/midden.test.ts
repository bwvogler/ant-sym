import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, CORPSE_ROT, LIFESPAN, MIDDEN_AT, MIDDLE, YOUNG } from "../../colony.ts";
import { Game, nearestRival } from "../../game.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { generateSideWorld, isSky, mulberry32, OPEN, rockAt, takeFoodCell, type WorldMap } from "../../world.ts";

// Nest slice 7 (docs/nest-and-home.md §3.7): the dead lie where they fall until an undertaker (middle-aged) carries
// them out to the midden past the mound's edge; the midden marks the colony's ground, and raiders shy from it.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

/** The corpses on colony c's midden, one entry each (it keeps a count per cell). */
const buried = (c: Colony) => [...c.midden].flatMap(([key, n]) => Array.from({ length: n }, () => ({ x: key % 65536, y: Math.floor(key / 65536) })));

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
  for (let i = 0; i < c.n && killed < 20; i++) if (c.alive[i] && !c.carrying[i] && !c.pellet[i] && c.y[i]! > map.nest.entrance!.y + 3) {
      c.kill(i);
      killed++;
    }
  assert.equal(c.corpses.length, 20);
  for (let k = 0; k < 30 * 180; k++) {
    g.tick(1 / 30);
    if (k % 300 === 0) assert.equal(c.soilDug, c.soilOut + c.soilFilled + c.carriedPellets().dug + c.soilLost, "dug = mound + filled + carried + lost");
  }
  assert.ok(c.buried >= 15, `${c.buried} of 20 on the midden`);
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  // Past the mound's largest reach, so its growth never buries the midden (review of slice 7: it was 3 columns out).
  for (const k of buried(c)) {
    assert.ok(k.x - ex >= MIDDEN_AT - 3, `past the mound (column ${k.x - ex} from the hole)`);
  }
});

const middleAged = (c: Colony) => {
  for (let i = 0; i < c.n; i++) c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
};

test("each colony's midden lies toward the other: a boundary between them", () => {
  const map = generateSideWorld(2, { ...SMALL, nestCount: 2 });
  const g = new Game(map, { antCount: 120, rivalAnts: 120 }, mulberry32(4));
  for (const c of g.colonies) {
    middleAged(c);
    c.stancePolicy = () => "forage";
    c.stance = "forage";
  }
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  for (const c of g.colonies) {
    let killed = 0;
    // near the hole, in it or on the ground (the rival's ants were mostly out: few underground to kill)
    for (let i = 0; i < c.n && killed < 12; i++) if (c.alive[i] && !c.carrying[i] && !c.pellet[i] && Math.abs(c.x[i]! - c.nest.entrance!.x) < 15) {
        c.kill(i);
        killed++;
      }
  }
  for (let k = 0; k < 30 * 180; k++) g.tick(1 / 30);
  const [a, b] = g.colonies as [Colony, Colony];
  const col = (c: Colony) => (cellOf(c.nest.entrance!.x, c.nest.entrance!.y), CELL[0] as number);
  const toward = Math.sign(col(b) - col(a));
  for (const [c, side] of [[a, toward], [b, -toward]] as const) {
    const heap = buried(c);
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

test("a corpse lying past the midden is carried back to it, not put down where it lay and picked up again", () => {
  // Review of #26: carried "out to the midden" from beyond it, the drop fired at once, off the midden, and the corpse was
  // picked up again (one nine times); between the midden and MIDDEN_NEAR (100 columns), nothing past it was ever buried.
  const map = generateSideWorld(2, SMALL);
  const c = new Colony(map, { antCount: 1, maxAnts: 1 }, mulberry32(9), () => "explore");
  c.age[0] = (MIDDLE + 0.1) * LIFESPAN; // old: a forager, out on the ground
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const x = (CELL[0] as number) + MIDDEN_AT + 6; // east (alone, the midden faces east), 99 columns out
  const y = walkway(map, x);
  c.corpses.push({ x, y, held: -1, died: 0, load: 0, strain: 0 });
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) while (takeFoodCell(map, x + dx, y + dy)); // a forager with food goes home instead
  let picks = 0;
  let was = false;
  for (let k = 0; k < 30 * 120 && c.buried === 0; k++) {
    if (!c.carriesCorpse(0) && picks === 0) {
      // by it, not tired, until it takes it up
      c.x[0] = centreX(x, y);
      c.y[0] = centreY(y);
      c.mode[0] = 0;
      c.since[0] = 0;
    }
    c.tick(1 / 30);
    if (c.carriesCorpse(0) && !was) picks++;
    was = c.carriesCorpse(0);
  }
  assert.equal(c.buried, 1, "on the midden");
  assert.equal(picks, 1, "picked up once");
  const [k] = buried(c);
  assert.ok(Math.abs(k!.x - (x - 6)) <= 3, `on the midden, ${k!.x - (x - 6)} columns from its middle`);
  assert.equal(c.corpses.length, 0);
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

test("a raiding colony of every age: the young stay in to nurse, not parked at the hole; the rest go raiding", () => {
  // Review of #26 (blocker): raid stance made every explorer a fighter, the young too. A young raider climbed to its hole,
  // was put back down the shaft (slice 6: it may not go out), and climbed again: 70–93 of ~110 young parked at the hole.
  const map = generateSideWorld(1, { ...SMALL, nestCount: 2 });
  const g = new Game(map, { antCount: 150, rivalAnts: 150 }, mulberry32(1));
  const [a, b] = g.colonies as [Colony, Colony];
  // Ages as a new colony has them (0 to half a lifespan, Colony's constructor): about a third young, every band present.
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  b.stancePolicy = () => "raid";
  cellOf(b.nest.entrance!.x, b.nest.entrance!.y);
  const [hx, hy] = [CELL[0] as number, CELL[1] as number];
  let young = 0;
  let atHole = 0;
  let raiders = 0;
  const stay = new Map<number, number>(); // ticks each young ant has been at the hole, unbroken
  let longest = 0;
  for (let k = 0; k < 30 * 60; k++) {
    g.tick(1 / 30);
    b.stance = "raid";
    for (let i = 0; i < b.n; i++) {
      if (!b.alive[i]) continue;
      if (b.band(i) !== 0) {
        if (k % 30 === 0 && Math.abs(b.x[i]! - a.nest.entrance!.x) < Math.abs(b.x[i]! - b.nest.entrance!.x)) raiders++;
        continue;
      }
      b.antCell(i);
      const at = Math.abs((CELL[0] as number) - hx) <= 2 && Math.abs((CELL[1] as number) - hy) <= 2;
      if (at) longest = Math.max(longest, stay.set(i, (stay.get(i) ?? 0) + 1).get(i)!);
      else stay.delete(i);
      if (k % 30) continue;
      young++;
      if (at) atHole++;
    }
  }
  assert.ok(young > 60 * 20, `${(young / 60).toFixed(0)} young on average`);
  // Without the fix: 68 % of the young's samples at the hole, stays of a minute. The young still pass by now and then
  // (raiders leaving the royal chamber lay its mark up the shaft, and the young keep to it: ~9 % here), but none stays.
  assert.ok(longest / 30 < 5, `the longest a young ant stays at the hole: ${(longest / 30).toFixed(1)} s`);
  assert.ok(atHole / young < 0.2, `young at the hole: ${((100 * atHole) / young).toFixed(1)} % of samples`);
  // 15, not 20, since behaviour MR 4 (PRD §46.4): the rival's foragers no longer charge out at raiders but turn away, and
  // the raiders die faster at its crowded hole (109 against 64 in this minute), so fewer are over there at once (17.5
  // against 49.9). They still go: none of the dead fell on their own side. The margin is thin: on main, seeds 3, 4 and 6
  // already sat at 16.8–18.6, and seeds range from about 17 to 67 (review of #38).
  assert.ok(raiders / 60 >= 15, `${(raiders / 60).toFixed(0)} of the middle-aged and old on the rival's side`);
});

test("a raid in force gets past the rival's midden and in at its hole", () => {
  // Review of #26: the midden's saturated mark turned back 98 % of raiders at every step onto it: a wall, and no raider
  // ever got into a nest that had one. Now the turn-back falls with the raiders around (a scout shies, a raid presses on).
  const map = generateSideWorld(1, { ...SMALL, nestCount: 2 });
  const g = new Game(map, { antCount: 150, rivalAnts: 150 }, mulberry32(1));
  const [a, b] = g.colonies as [Colony, Colony];
  middleAged(b);
  const col = (c: Colony) => (cellOf(c.nest.entrance!.x, c.nest.entrance!.y), CELL[0] as number);
  // a's midden, as its undertakers leave it: 20 dead in a heap on the ground toward b, 40 % of the way (nests 120 apart).
  const side = Math.sign(col(b) - col(a));
  const mx = col(a) + side * Math.min(MIDDEN_AT, Math.round(0.4 * Math.abs(col(b) - col(a))));
  a.midden.set(walkway(map, mx) * 65536 + mx, 20);
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  assert.ok(a.ph.fields.midden.get(mx, walkway(map, mx)) > 10, "the midden smells (laid from its heap every tick)");
  assert.ok(a.ph.fields.midden.get(mx + 3 * side, walkway(map, mx + 3 * side)) > 1, "over ±3 columns");
  b.stancePolicy = () => "raid";
  let inRival = 0;
  for (let k = 0; k < 30 * 60; k++) {
    g.tick(1 / 30);
    b.stance = "raid";
    if (k % 30) continue;
    let under = 0;
    for (let i = 0; i < b.n; i++) {
      if (!b.alive[i]) continue;
      if (Math.abs(b.x[i]! - a.nest.entrance!.x) >= Math.abs(b.x[i]! - b.nest.entrance!.x)) continue;
      cellOf(b.x[i]!, b.y[i]!);
      if (!isSky(map, CELL[0] as number, CELL[1] as number)) under++;
    }
    inRival = Math.max(inRival, under);
  }
  assert.ok(inRival >= 3, `${inRival} in under the rival's hole, past its midden`);
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
    middleAged(b); // a raider (review of #26: the young, who may not go out, are no raiders)
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

test("any number of colonies: raids go to the nearest rival, the midden faces the nearest neighbour", () => {
  // The owner (2026-11-02): more than two colonies is coming; nothing may assume a single rival (review of #26–#28: the
  // midden sat 0.4 × the gap to *the* rival, raids went to colonies[1 − k]).
  const map = generateSideWorld(3, { size: { w: 420, h: 160 }, nestGap: 110, surface: 40, nestCount: 3 });
  assert.equal(map.nests.length, 3);
  const cs = [0, 1, 2].map((k) => new Colony(map, { antCount: 30, maxAnts: 30, nest: k, odour: k / 2 }, mulberry32(20 + k)));
  for (const c of cs) c.others = cs.filter((o) => o !== c).map((o) => o.nest);
  const col = (c: Colony) => (cellOf(c.nest.entrance!.x, c.nest.entrance!.y), CELL[0] as number);
  const order = [...cs].sort((p, q) => col(p) - col(q));
  const [west, middle, east] = order as [Colony, Colony, Colony];
  // Raids: each to its nearest rival; a beaten or kin colony is skipped for the next one.
  const nearer = col(middle) - col(west) < col(east) - col(middle) ? west : east;
  assert.equal(nearestRival(middle, cs, 0.35), nearer);
  assert.equal(nearestRival(west, cs, 0.35), middle);
  middle.nestOdour = west.nestOdour; // kin to the west now (unified)
  assert.equal(nearestRival(west, cs, 0.35), east, "kin are not raided: on to the next");
  // Middens: corpses buried where they lie at the midden's middle face the nearest neighbour, on each colony's own ground.
  for (const c of cs) {
    for (let i = 0; i < c.n; i++) c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
    const others = cs.filter((o) => o !== c).map(col);
    const near = others.reduce((p, q) => (Math.abs(q - col(c)) < Math.abs(p - col(c)) ? q : p));
    const side = Math.sign(near - col(c));
    const at = col(c) + side * Math.min(MIDDEN_AT, Math.round(0.4 * Math.abs(near - col(c))));
    // A corpse on the ground at that column, an old forager by it: put on the midden where it lies, not carried on.
    const y = walkway(map, at);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) while (takeFoodCell(map, at + dx, y + dy));
    c.corpses.push({ x: at, y, held: -1, died: 0, load: 0, strain: 0 });
    c.age[0] = (MIDDLE + 0.1) * LIFESPAN;
    for (let k = 0; k < 30 * 60 && c.buried === 0; k++) {
      if (!c.carriesCorpse(0)) {
        c.x[0] = centreX(at, y);
        c.y[0] = centreY(y);
        c.mode[0] = 0;
        c.since[0] = 0;
      }
      c.tick(1 / 30);
    }
    assert.equal(c.buried, 1, `colony ${c.params.nest} buries it`);
    const [k] = buried(c);
    assert.ok(Math.abs(k!.x - at) <= 3, `colony ${c.params.nest}'s midden is ${at - col(c)} columns out, toward its nearest neighbour`);
  }
});
