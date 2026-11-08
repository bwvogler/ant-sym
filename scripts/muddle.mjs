// Offline: what does Lockpick's muddle cost a colony? The app's own setup (generateSideWorld(seed), Game with
// mulberry32(seed * 7919)); at PAINT_AT seconds Lockpick is painted on both holes with the app's old spore brush (radius 3,
// spores 2, dose 0.15; STROKES events each, a short drag across the hole). Policy "local" (Lockpick soothes) or
// "muddle" (every host muddles). Reports, per colony: food home, births, brood at the end and how much of it lies
// outside any chamber (put down on the way), hosts at the end.
//
// Usage: node scripts/muddle.mjs [seed=1] [policy=muddle|local] [seconds=300] [ants=300] [strokes=6] [paintAt=30]
import { Game } from "../web/src/colony/game.ts";
import { INFECTED, STRAINS } from "../web/src/colony/fungus.ts";
import { generateSideWorld, mulberry32 } from "../web/src/colony/world.ts";

const args = process.argv.slice(2);
const seed = Number(args[0] ?? 1);
const policy = args[1] ?? "muddle";
const [seconds = 300, ants = 300, strokes = 6, paintAt = 30] = args.slice(2).map(Number);
const SPORES = { radius: 3, spores: 2, dose: 0.15 }; // the old app brush: web/src/colony/game.ts BRUSH
const LOCKPICK = STRAINS.findIndex((s) => s.id === "lockpick");
const DT = 1 / 30;
const map = generateSideWorld(seed);
const g = new Game(map, { antCount: ants, rivalAnts: ants }, mulberry32(seed * 7919));
if (policy === "muddle") g.fungus.policy = () => "muddle";
let painted = false;
const strays = g.colonies.map(() => 0);
let samples = 0;
for (let t = 0, k = 0; t < seconds; t += DT, k++) {
  g.tick(DT);
  if (!painted && g.time >= paintAt) {
    painted = true;
    for (const c of g.colonies) {
      const e = c.nest.entrance;
      for (let s = 0; s < strokes; s++) g.paintSpores(e.x - 3 + s, e.y, SPORES.radius, SPORES.spores, SPORES.dose, LOCKPICK);
    }
  }
  if (g.time > paintAt && k % 30 === 0) {
    samples++;
    g.colonies.forEach((c, n) => {
      for (const b of c.brood.items) if (b.held < 0 && b.chamber < 0) strays[n]++;
    });
  }
}
console.log(
  JSON.stringify({
    seed,
    policy,
    seconds,
    ants,
    food: g.colonies.map((c) => c.stored),
    births: g.colonies.map((c) => c.births),
    brood: g.colonies.map((c) => c.brood.size),
    strayBroodMean: strays.map((x) => +(x / Math.max(1, samples)).toFixed(1)),
    hosts: g.colonies.map((c) => {
      let n = 0;
      for (let i = 0; i < c.n; i++) if (c.alive[i] && c.load[i] >= INFECTED) n++;
      return n;
    }),
  }),
);
