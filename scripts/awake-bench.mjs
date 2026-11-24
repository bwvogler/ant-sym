// Offline, no key: how long one tick takes with the awake rule on and wild colonies woken (docs/endless-world.md §6, PRD §66 E4.5): two start
// colonies and up to `wild` wild colonies woken from sites on lines of their own, every colony at `ants`, the awake cap `cap` (nothing is near the
// fungus, so the cap alone decides who sleeps: the lowest-ranked freeze first). Reports the colonies in the game and awake, and the median, 90th
// percentile and late mean milliseconds a tick takes after a warm-up, as colony-bench does.
//
// Usage: node scripts/awake-bench.mjs [wild=4] [cap=6] [ants per colony=400] [sim seconds=60] [seed=1]
import { Game, gameRng, generateOneWorld, mainGround, centreX, centreY } from "../web/src/colony/index.ts";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const [wild = 4, cap = 6, ants = 400, seconds = 60, seed = 1] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"))
  .map(Number);
const DT = 1 / 30;
const game = new Game(generateOneWorld(seed), { autoFound: false }, gameRng(seed), [{ antCount: ants }, { antCount: ants }]);
const ground = mainGround(game.world);
// Wake sites where a founding would start a line (open ground, a unit clear of every hole and line), one after another.
game.newLines = true;
let woken = 0;
for (let y = 20; y < 360 && woken < wild; y += 12)
  for (let x = 20; x < 500 && woken < wild; x += 12) {
    const s = game.settleAt({ x, y }, ground);
    if (!s.ok || !s.newLine) continue;
    game.wakeSite({ x: centreX(s.cell.x, s.cell.y), y: centreY(s.cell.y), rx: woken, ry: 0, heading: s.newLine.heading }, { ants });
    woken++;
  }
game.newLines = false;
game.enableSleep({ cap, delay: 1e9 });
const warm = Math.round(5 / DT);
const ms = [];
let awake = game.colonies.length;
for (let k = 0; k < Math.round(seconds / DT); k++) {
  const a = performance.now();
  game.tick(DT);
  if (k >= warm) ms.push(performance.now() - a);
  if (k === warm) awake = game.colonies.filter((_, i) => !game.isFrozen(i)).length;
}
const late = ms.slice(ms.length >> 1);
const lateMean = (late.reduce((a, b) => a + b, 0) / late.length).toFixed(2);
ms.sort((a, b) => a - b);
const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(2);
const awakeNow = game.colonies.filter((_, i) => !game.isFrozen(i)).length;
console.log(
  `seed ${seed}: ${game.colonies.length} colonies (2 start + ${woken} wild), ${ants} ants each, cap ${cap}: awake ${awake} at 5 s, ${awakeNow} at ${seconds} s (over ${game.sleepRule.over}); ` +
    `tick median ${q(0.5)} ms, p90 ${q(0.9)} ms, late mean ${lateMean} ms`,
);
