// Offline, no key: slow/economy.test's own hour on many seeds, as a guard for nest changes (PRD §71, §73; ja-k4k.15.1).
// The test's map (256 × 160, ground 40 rows down, one colony of 110, 0.3 of the map's food), the game seeded
// world × 7919 + n. Each minute from 300 s on it counts larvae unfed over 120 s while the larder could feed them
// ("stranded"), and reports per seed the worst stranding at once, where those larvae lay (royal chamber, a brood
// chamber of two cells or fewer, a bigger one, none), the bands at that moment, and the workers alive at 3,600 s
// (a collapse: under 110). Fed to `xargs -P` it runs seeds side by side.
//
// Usage: node scripts/lab/economy-strand.mjs <world> <n> [root=this repo] [colony=JSON]
//   root: another checkout to measure (its web/src/colony is imported), so the same probe measures before and after.
//   colony: the colony's params as JSON (Game's sides.colony), e.g. '{"broodOdour":1,"broodClimb":1}'.
// Example, the 20 seeds of PRD §71 (world 1 n = 1-7, 9-12; world 2 n = 0, 2-9), four at a time:
//   for c in "1 1" "1 2" "1 3" "1 4" "1 5" "1 6" "1 7" "1 9" "1 10" "1 11" "1 12" "2 0" "2 2" "2 3" "2 4" "2 5" "2 6" \
//     "2 7" "2 8" "2 9"; do echo "$c"; done | xargs -P 4 -L 1 node scripts/lab/economy-strand.mjs
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [w, nudge] = [Number(process.argv[2] ?? 2), Number(process.argv[3] ?? 0)];
const root = resolve(process.argv[4] || resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
const colony = process.argv[5] ? JSON.parse(process.argv[5]) : undefined;
const M = (p) => import(`${root}/web/src/colony/${p}`);
const { isFed, LARVA, LARVA_FOOD } = await M("brood.ts");
const { Game } = await M("game.ts");
const { generateSideWorld, mulberry32 } = await M("world.ts");

const map = generateSideWorld(w, {
  size: { w: 256, h: 160 },
  nestGap: 120,
  surface: 40,
  nestCount: 1,
});
let total = 0;
for (let y = 0; y < map.size.h; y++)
  for (let x = 0; x < map.size.w; x++) {
    const v = map.food.get(x, y) * 0.3;
    map.food.set(x, y, v);
    total += v;
  }
map.foodTotal = map.foodLeft = total;
const g = new Game(map, { antCount: 110, rival: false }, mulberry32(w * 7919 + nudge), colony ? { colony } : undefined);
const c = g.player;
const ch = map.chambers;
let stranded = 0;
let worst = "";
for (let k = 1; k <= 30 * 3600; k++) {
  g.tick(1 / 30);
  if (k % (30 * 60) || k < 30 * 300) continue;
  const waiting = c.brood.items.filter((b) => b.stage === LARVA && b.t > 120 && !isFed(b));
  if (c.larder < waiting.length * LARVA_FOOD || waiting.length <= stranded) continue;
  stranded = waiting.length;
  const kinds = {};
  for (const b of waiting) {
    const r = b.chamber >= 0 ? ch.list[b.chamber] : null;
    const key = !r ? "none" : r.role === "royal" ? "royal" : r.cells <= 2 ? "tiny" : "brood";
    kinds[key] = (kinds[key] ?? 0) + 1;
  }
  const bands = [0, 0, 0];
  for (let i = 0; i < c.n; i++) if (c.alive[i]) bands[c.band(i)]++;
  worst = `t=${k / 30} ${JSON.stringify(kinds)} bands=${bands}`;
}
console.log(`w${w}+${nudge} stranded=${stranded} pop=${c.population}${c.population < 110 ? " COLLAPSE" : ""} ${worst}`);
