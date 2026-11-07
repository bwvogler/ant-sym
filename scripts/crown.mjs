// Offline: can Bloom's crown orphan a colony in a real game? The app's own setup (generateSideWorld(seed), Game
// with mulberry32(seed * 7919), 600 + 600 ants), crown on the menu, and the UI's spore brush (useColony.ts SPORES:
// radius 3, spores 2, dose 0.15 per paint event). At PAINT_AT seconds the player paints Bloom on colony 1's royal
// chamber: STROKES paint events along its floor (a short drag; the app paints one event per pointer move), or with
// WHERE "hole", across its hole on the ground (where the foragers pass, not on the queen). The
// fungus policy is scripted, as a Jev answer to an aim like "kill their queen" would be: crown wherever the host is in
// its own colony's chamber, the strain's default elsewhere. Reports when the queen died, brood crown killed, births,
// Bloom's hosts in colony 1 over time, and both colonies' ants at the end.
//
// Usage: node scripts/crown.mjs [seed=1] [seconds=600] [ants=600] [strokes=6] [paintAt=60] [where=royal|hole]
import { Game } from "../web/src/colony/game.ts";
import { INFECTED, STRAINS } from "../web/src/colony/fungus.ts";
import { centreX, centreY } from "../web/src/colony/hex.ts";
import { generateSideWorld, mulberry32 } from "../web/src/colony/world.ts";

const [seed = 1, seconds = 600, ants = 600, strokes = 6, paintAt = 60] = process.argv.slice(2, 7).map(Number);
const where = process.argv[7] ?? "royal";
const SPORES = { radius: 3, spores: 2, dose: 0.15 }; // web/src/ui/useColony.ts
const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");
const DT = 1 / 30;
const map = generateSideWorld(seed);
const g = new Game(map, { antCount: ants, rivalAnts: ants }, mulberry32(seed * 7919));
const target = g.colonies[1];
g.fungus.menu = new Set([...g.fungus.menu, "crown"]);
g.fungus.policy = (s) => (s.place === "queen" || s.place === "chamber" ? "crown" : "default");

let diedAt = -1;
let painted = false;
const hosts = [];
let peakHosts = 0;
let crowners = 0; // hosts running crown (regicide > 0) at once, at most
for (let t = 0, k = 0; t < seconds; t += DT, k++) {
  g.tick(DT);
  if (!painted && g.time >= paintAt) {
    painted = true;
    if (where === "hole") {
      // Across the hole, a cell a stroke (as muddle.mjs and fungus-cost.mjs paint).
      const e = target.nest.entrance;
      for (let s = 0; s < strokes; s++) g.paintSpores(e.x - 3 + s, e.y, SPORES.radius, SPORES.spores, SPORES.dose, BLOOM);
    } else {
      // Along the royal chamber's floor, west to east (where the queen and the nurses are).
      const royal = map.chambers.list.find((c) => c.colony === target.params.nest && c.role === "royal");
      for (let s = 0; s < strokes; s++) {
        const x = royal.x0 + ((royal.x1 - royal.x0) * (s + 0.5)) / strokes;
        g.paintSpores(centreX(Math.round(x), royal.floorRow), centreY(royal.floorRow), SPORES.radius, SPORES.spores, SPORES.dose, BLOOM);
      }
    }
  }
  if (diedAt < 0 && target.orphaned) diedAt = Math.round(g.time);
  if (k % 30 === 0) {
    let n = 0;
    let crown = 0;
    for (let i = 0; i < target.n; i++) {
      if (!target.alive[i] || target.load[i] < INFECTED) continue;
      n++;
      if (target.regicide[i] > 0) crown++;
    }
    peakHosts = Math.max(peakHosts, n);
    crowners = Math.max(crowners, crown);
    if (k % (30 * 30) === 0) hosts.push(n);
  }
}
console.log(
  JSON.stringify({
    seed,
    seconds,
    ants,
    strokes,
    paintAt,
    where,
    queenDiedAt: diedAt,
    afterPaint: diedAt < 0 ? -1 : diedAt - paintAt,
    broodKilled: target.broodKilled,
    births: g.colonies.map((c) => c.births),
    peakHosts,
    peakCrowning: crowners,
    hostsEvery30s: hosts,
    antsLeft: g.colonies.map((c) => c.population),
  }),
);
