// Offline, no key: the roomy-nest test's games (web/src/colony/tests/int/chambers.test.ts), game by game (PRD §31, §40): 30
// ants, every one middle-aged (a digger), dig for 120 s in the founding chamber of the small side world, with the chambers
// (roomy: 30 ants want less floor than it has) and without (as before nest slice 2). Reports cells dug each way and the
// ratio. Checkouts from before age zoning (nest slice 6) have every ant dig anyway.
//
// Usage: node scripts/lab/roomy-bench.mjs [seeds=6-9] [root=this repo]
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const seeds = (args[0] ?? "6-9").split(",").flatMap((s) => {
  const [a, b] = s.split("-").map(Number);
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, k) => a + k);
});
const root = resolve(args[1] ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
const C = await import(`${root}/web/src/colony/colony.ts`);
const W = await import(`${root}/web/src/colony/world.ts`);
const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };
const dig = (seed, chambers) => {
  const map = W.generateSideWorld(2, SMALL);
  if (!chambers) map.chambers = undefined;
  const c = new C.Colony(map, { antCount: 30, maxAnts: 30 }, W.mulberry32(seed));
  if (C.YOUNG !== undefined && c.age) for (let i = 0; i < c.n; i++) ((c.age[i] = ((C.YOUNG + C.MIDDLE) / 2) * C.LIFESPAN), (c.lifespan[i] = Infinity));
  for (let k = 0; k < 30 * 120; k++) c.tick(1 / 30);
  return c.soilDug;
};
let a = 0;
let b = 0;
for (const seed of seeds) {
  const roomy = dig(seed, true);
  const none = dig(seed, false);
  a += roomy;
  b += none;
  console.log(`game ${seed}: roomy ${roomy}, no chambers ${none}, ratio ${(roomy / none).toFixed(2)}`);
}
console.log(`all: ${a} vs ${b}, ratio ${(a / b).toFixed(2)}`);
