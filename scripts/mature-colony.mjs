// Offline, no key, no spend: what a start colony is after N minutes (docs/endless-world.md §4, PRD §66 E4.3): the numbers a wild colony is
// generated at when it wakes (measured from the start colonies, not invented). One colony alone on one world, the local rule, no fungus.
//
// Usage: node scripts/mature-colony.mjs [minutes=10] [ants=600] [seeds=1,2,3]
import { Game, gameRng, generateOneWorld } from "../web/src/colony/index.ts";
import { helpAndExit } from "./lib/usage.mjs";

helpAndExit(import.meta.url);

const DT = 1 / 30;
const minutes = Number(process.argv[2] ?? 10);
const ants = Number(process.argv[3] ?? 600);
const seeds = (process.argv[4] ?? "1,2,3").split(",").map(Number);

for (const seed of seeds) {
  const g = new Game(generateOneWorld(seed), {}, gameRng(seed), [{ antCount: ants }]);
  const c = g.colonies[0];
  const read = () => {
    const brood = c.brood.counts();
    const chambers = g.world.curtain.chambers?.list.filter((ch) => ch.colony === c.params.nest).length ?? 0;
    return {
      t: Math.round(g.time),
      population: c.population,
      modes: c.counts(),
      brood,
      larder: Math.round(c.larder * 10) / 10,
      chambers,
      queen: c.queen ? c.queen.alive : null,
    };
  };
  console.log(`seed ${seed}, start ${ants} ants`);
  console.log(JSON.stringify(read()));
  for (let m = 1; m <= minutes; m++) {
    for (let t = 0; t < 60; t += DT) g.tick(DT);
    if (m % 2 === 0 || m === minutes) console.log(JSON.stringify(read()));
  }
}
