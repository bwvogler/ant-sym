// Offline: where the food-home gain from nest slice 7 comes from (PRD §36, §39). A natural game in the side view,
// the app's own setup (generateSideWorld(seed), Game with mulberry32(seed * 7919)), both colonies on the local rule
// and the local strategist. Sampled every second: each colony's stance, and while it raids, its fighters underground
// and out on the ground. Reports food home, the share of time each colony raided, and its fighters in or out then.
// Runs on any branch of the nest stack (it reads only public fields).
//
// Usage: node scripts/lab/raid-food.mjs [seed=3] [ants=600] [seconds=600]
import { Game } from "../../web/src/colony/game.ts";
import { CELL } from "../../web/src/colony/hex.ts";
import { generateSideWorld, isSky, mulberry32 } from "../../web/src/colony/world.ts";

const [seed = 3, ants = 600, seconds = 600] = process.argv.slice(2).map(Number);
const DT = 1 / 30;
const map = generateSideWorld(seed);
const g = new Game(map, { antCount: ants, rivalAnts: ants }, mulberry32(seed * 7919));
const raid = g.colonies.map(() => ({ samples: 0, raiding: 0, under: 0, out: 0 }));
for (let t = 0, k = 0; t < seconds; t += DT, k++) {
  g.tick(DT);
  if (k % 30) continue;
  g.colonies.forEach((c, n) => {
    const r = raid[n];
    r.samples++;
    if (c.stance !== "raid") return;
    r.raiding++;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || c.mode[i] !== 3) continue;
      c.antCell(i);
      if (isSky(map, CELL[0], CELL[1])) r.out++;
      else r.under++;
    }
  });
}
console.log(
  JSON.stringify({
    seed,
    ants,
    seconds,
    food: g.colonies.map((c) => c.stored),
    births: g.colonies.map((c) => c.births),
    losses: g.colonies.map((c) => c.losses),
    raidingShare: raid.map((r) => +(r.raiding / r.samples).toFixed(2)),
    fightersWhileRaiding: raid.map((r) =>
      r.raiding ? { under: +(r.under / r.raiding).toFixed(0), out: +(r.out / r.raiding).toFixed(0) } : null,
    ),
  }),
);
