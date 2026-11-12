// Offline: a forced raid in the side view, the app's own setup (generateSideWorld(seed), Game with
// mulberry32(seed * 7919)). As in the review of #26: 100 of colony 0's workers are killed underground at
// 60 s (corpses for its undertakers), and colony 1 is set to raid from RAID_AT on. Reports, over the raid:
// raiders within 20 columns of colony 0's hole and inside its nest (underground, nearer its hole than any
// other), colony 1's young at its own hole, what each colony buried and how often corpses were picked up.
//
// With "erase" as a fifth argument, colony 0's midden mark is cleared every tick (the deterrent's own effect).
//
// Usage: node scripts/lab/raids.mjs [seed=1] [ants=600] [seconds=450] [raidAt=300] [erase]
import { Game } from "../../web/src/colony/game.ts";
import { CELL, cellOf } from "../../web/src/colony/hex.ts";
import { generateSideWorld, isSky, mulberry32 } from "../../web/src/colony/world.ts";

const [seed = 1, ants = 600, seconds = 450, raidAt = 300] = process.argv.slice(2, 6).map(Number);
const erase = process.argv[6] === "erase";
const DT = 1 / 30;
const map = generateSideWorld(seed);
const g = new Game(map, { antCount: ants, rivalAnts: ants }, mulberry32(seed * 7919));
const [a, b] = g.colonies;
const holes = g.colonies.map((c) => (cellOf(c.nest.entrance.x, c.nest.entrance.y), [CELL[0], CELL[1]]));
const ownNest = (x, k) => holes.every(([hx], j) => j === k || Math.abs(x - holes[k][0]) <= Math.abs(x - hx));

const picks = [0, 0];
const was = g.colonies.map((c) => new Uint8Array(c.n));
let samples = 0;
const sum = { near20: 0, inRival: 0, youngAtHole: 0, young: 0, fighters: 0 };
let maxIn = 0;
const deathsAt = [];
for (let t = 0, k = 0; t < seconds; t += DT, k++) {
  g.tick(DT);
  if (erase) a.ph.fields.midden.clear();
  if (Math.abs(g.time - 60) < DT / 2) {
    let killed = 0;
    for (let i = 0; i < a.n && killed < 100; i++) {
      if (!a.alive[i] || a.carrying[i] || a.pellet[i]) continue;
      a.antCell(i);
      if (!isSky(map, CELL[0], CELL[1])) (a.kill(i), killed++);
    }
  }
  if (g.time >= raidAt) {
    b.bindPolicy("stance", () => "raid");
    b.stance = "raid";
    if (!deathsAt.length) deathsAt.push(a.losses, b.losses);
  }
  g.colonies.forEach((c, n) => {
    for (let i = 0; i < c.n; i++) {
      const on = c.alive[i] && c.carriesCorpse(i) ? 1 : 0;
      if (on && !was[n][i]) picks[n]++;
      was[n][i] = on;
    }
  });
  if (g.time < raidAt || k % 30) continue;
  samples++;
  let near20 = 0;
  let inRival = 0;
  for (let i = 0; i < b.n; i++) {
    if (!b.alive[i]) continue;
    b.antCell(i);
    const [cx, cy] = [CELL[0], CELL[1]];
    if (b.mode[i] === 3) sum.fighters++;
    if (Math.abs(cx - holes[0][0]) <= 20) near20++;
    if (!isSky(map, cx, cy) && ownNest(cx, 0)) inRival++;
    if (b.band(i) === 0) {
      sum.young++;
      if (Math.abs(cx - holes[1][0]) <= 2 && Math.abs(cy - holes[1][1]) <= 2) sum.youngAtHole++;
    }
  }
  sum.near20 += near20;
  sum.inRival += inRival;
  maxIn = Math.max(maxIn, inRival);
}
// The dead left lying at the end: each colony's in its own nest (underground, nearer its hole), and on the ground past MIDDEN_NEAR.
const lying = g.colonies.map((c, n) => {
  let inNest = 0;
  let far = 0;
  for (const k of c.corpses) {
    if (k.held >= 0) continue;
    if (!isSky(map, k.x, k.y) && ownNest(k.x, n)) inNest++;
    else if (Math.abs(k.x - holes[n][0]) > 100) far++;
  }
  return { inNest, far };
});
const f = (x) => (x / Math.max(1, samples)).toFixed(1);
console.log(
  JSON.stringify({
    seed,
    ants,
    seconds,
    raidAt,
    erase,
    near20: +f(sum.near20),
    inRival: +f(sum.inRival),
    maxInRival: maxIn,
    fighters: +f(sum.fighters),
    youngAtHolePct: +((100 * sum.youngAtHole) / Math.max(1, sum.young)).toFixed(1),
    youngAtHole: +f(sum.youngAtHole),
    buried: g.colonies.map((c) => c.buried),
    picks,
    lying,
    deathsDuringRaid: [a.losses - (deathsAt[0] ?? 0), b.losses - (deathsAt[1] ?? 0)],
    queens: g.colonies.map((c) => (c.orphaned ? "dead" : "alive")),
    food: g.colonies.map((c) => c.stored),
  }),
);
