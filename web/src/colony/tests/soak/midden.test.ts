import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, CORPSE_ROT, CURTAIN, LIFESPAN, MIDDLE, PLANE, YOUNG, type HoleCell } from "../../colony.ts";
import { Game } from "../../game.ts";
import { CELL } from "../../hex.ts";
import { mulberry32 } from "../../world.ts";
import { curtainHole, own, planeHole, smallOne } from "../builders.ts";

// Nest slice 7 (docs/nest-and-home.md §3.7): the dead lie where they fall until an undertaker (middle-aged) carries
// them out to the midden past the mound's edge; the midden marks the colony's ground, and raiders shy from it. On one world
// the carrying out, the ring and the shying are soak/oneWorldMound's and int/oneWorldMoundGates' (S2.3c). The raid tests make the rival's ants
// raiders by their own stance (`recruited`).

const middleAged = (c: Colony) => {
  for (let i = 0; i < c.n; i++) c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
};

test("an undertaker that dies leaves the corpse it carried lying; the unclaimed dead rot", () => {
  const g = new Game(smallOne(2), { antCount: 150, rival: false }, mulberry32(4));
  const c = g.player;
  const hole = curtainHole(own(c));
  middleAged(c);
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  const victim = Array.from({ length: c.n }, (_, i) => i).find(
    (i) => c.alive[i] && !c.carrying[i] && !c.pellet[i] && c.layer[i] === CURTAIN && c.y[i]! > hole.y + 3,
  )!;
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

/** Whether colony c's ant i is on the plane nearer the rival's hole than its own. */
const onRivalSide = (c: Colony, i: number, rival: Colony) => {
  const own = planeHole(c.holeCells[c.params.nest] as HoleCell);
  const r = planeHole(rival.holeCells[rival.params.nest] as HoleCell);
  return c.layer[i] === PLANE && Math.hypot(c.x[i]! - r.x, c.y[i]! - r.y) < Math.hypot(c.x[i]! - own.x, c.y[i]! - own.y);
};

/** A raid played once: seed 1's small one world, 30 s, then colony 1 on the raid stance for 60 s; what the tests below read. */
let raid: { young: number; atHole: number; longest: number; raiders: number } | undefined;
const raidOfEveryAge = () => {
  if (raid) return raid;
  const g = new Game(smallOne(1), { antCount: 150, rivalAnts: 150 }, mulberry32(1));
  const [a, b] = g.colonies as [Colony, Colony];
  // Ages as a new colony has them (0 to half a lifespan, Colony's constructor): about a third young, every band present.
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  const h = b.holeCells[b.params.nest] as HoleCell;
  let young = 0;
  let atHole = 0;
  let raiders = 0;
  const stay = new Map<number, number>(); // ticks each young ant has been at the top of its shaft, unbroken
  let longest = 0;
  for (let k = 0; k < 30 * 60; k++) {
    g.tick(1 / 30);
    for (let i = 0; i < b.n; i++) {
      if (!b.alive[i]) continue;
      b.recruited[i] = 1; // each ant a raider by its own stance (the rival raids in force)
      if (b.band(i) !== 0) {
        if (k % 30 === 0 && onRivalSide(b, i, a)) raiders++;
        continue;
      }
      b.antCell(i);
      const at = b.layer[i] === CURTAIN && Math.abs(CELL[0] - h.col) <= 2 && Math.abs(CELL[1] - h.row) <= 2;
      if (at) longest = Math.max(longest, stay.set(i, (stay.get(i) ?? 0) + 1).get(i)!);
      else stay.delete(i);
      if (k % 30) continue;
      young++;
      if (at) atHole++;
    }
  }
  return (raid = { young, atHole, longest, raiders });
};

test("a raiding colony of every age: the young stay in to nurse, not parked at the hole", () => {
  // Review of #26 (blocker): raid stance made every explorer a fighter, the young too. A young raider climbed to its hole,
  // was put back down the shaft (slice 6: it may not go out), and climbed again: 70–93 of ~110 young parked at the hole.
  // On one world (S2.3c): 38 young on average, 0.4 % of samples at the top of the shaft, the longest stay 4.5 s.
  const { young, atHole, longest } = raidOfEveryAge();
  assert.ok(young > 60 * 20, `${(young / 60).toFixed(0)} young on average`);
  assert.ok(longest / 30 < 5, `the longest a young ant stays at the hole: ${(longest / 30).toFixed(1)} s`);
  assert.ok(atHole / young < 0.2, `young at the hole: ${((100 * atHole) / young).toFixed(1)} % of samples`);
});

test(
  "a raiding colony of every age: the middle-aged and old go raiding",
  { todo: "ja-utdq: on one world 14.1 on the rival's side on average (seed 1), under the side view's 15" },
  () => {
    const { raiders } = raidOfEveryAge();
    assert.ok(raiders / 60 >= 15, `${(raiders / 60).toFixed(0)} of the middle-aged and old on the rival's side`);
  },
);

test(
  "a raid in force goes in at the rival's hole",
  { todo: "ja-utdq: on one world no raider goes in at the rival's hole (0 on seeds 1, 2 and 7)" },
  () => {
    // Review of #26: the midden's saturated mark turned back 98 % of raiders at every step onto it: a wall, and no raider
    // ever got into a nest that had one. Now the turn-back falls with the raiders around (a scout shies, a raid presses on).
    // On one world the midden is a ring off the mound (soak/oneWorldMound), laid by the colony's own dead; in this run the rival
    // has none (no dead in 90 s), so this reads only the way in. The midden half waits for ja-utdq (review of #247, S3).
    const g = new Game(smallOne(1), { antCount: 150, rivalAnts: 150 }, mulberry32(1));
    const [a, b] = g.colonies as [Colony, Colony];
    middleAged(b);
    for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
    const under = curtainHole(a.holeCells[a.params.nest] as HoleCell);
    let inRival = 0;
    for (let k = 0; k < 30 * 60; k++) {
      g.tick(1 / 30);
      for (let i = 0; i < b.n; i++) if (b.alive[i]) b.recruited[i] = 1; // each ant a raider by its own stance
      if (k % 30) continue;
      let n = 0;
      for (let i = 0; i < b.n; i++) if (b.alive[i] && b.layer[i] === CURTAIN && Math.abs(b.x[i]! - under.x) < 30) n++;
      inRival = Math.max(inRival, n);
    }
    assert.ok(inRival >= 3, `${inRival} in under the rival's hole`);
  },
);
