// Offline, no key: how long one tick takes with the awake rule on and wild colonies woken (docs/endless-world.md §6, PRD §66 E4.5): two start
// colonies and up to `wild` wild colonies woken from sites on lines of their own, every colony at `ants`, the awake cap `cap` (nothing is near the
// fungus, so the cap alone decides how many sleep; every colony ties on rank, so the lowest indexes freeze first). Reports the colonies in the game and awake, and the median, 90th
// percentile and late mean milliseconds a tick takes after a warm-up, as colony-bench does.
//
// Usage: node scripts/awake-bench.mjs [wild=4] [cap=6] [ants per colony=400] [sim seconds=60] [seed=1] [--endless [--no-prefetch]]
//
// --endless plays the endless plane instead (generateEndlessWorld, PRD §66 E6.0.4): two start colonies, Garden landed by the first hole, the awake rule
// on (cap as given, the default delay), `wild` is ignored (sites wake as the fungus reaches them). It also reports the ticks over 50 ms, the slowest
// tick, and the chunks a layer read had to make on a miss inside the ticks after the 5 s warm-up (0 with the prefetch; --no-prefetch turns it off to
// compare). Without --endless nothing changes: the bounded numbers of §66 stay reproducible.
import { Game, gameRng, generateOneWorld, generateEndlessWorld, mainGround, centreX, centreY, STRAINS } from "../web/src/colony/index.ts";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const [wild = 4, cap = 6, ants = 400, seconds = 60, seed = 1] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"))
  .map(Number);
const DT = 1 / 30;
if (process.argv.includes("--endless")) endless();
else bounded();

function endless() {
  const world = generateEndlessWorld(seed);
  const game = new Game(world, { autoFound: false }, gameRng(seed), [{ antCount: ants }, { antCount: ants }]);
  if (process.argv.includes("--no-prefetch")) game.prefetch = false;
  game.enableSleep({ cap });
  game.land(
    0,
    STRAINS.findIndex((s) => s.id === "garden"),
    { evolve: true },
  );
  const warm = Math.round(5 / DT);
  const ms = [];
  let missed = 0;
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    const before = world.plane.gen.misses;
    const a = performance.now();
    game.tick(DT);
    const took = performance.now() - a;
    if (k >= warm) {
      ms.push(took);
      missed += world.plane.gen.misses - before;
    }
  }
  const over = ms.filter((t) => t > 50).length;
  ms.sort((a, b) => a - b);
  const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(2);
  console.log(
    `seed ${seed} endless${game.prefetch ? "" : ", no prefetch"}: ${game.colonies.length} colonies, ${ants} ants each, cap ${cap}, ${seconds} s: ` +
      `tick median ${q(0.5)} ms, p90 ${q(0.9)} ms, max ${ms[ms.length - 1].toFixed(1)} ms, ${over} of ${ms.length} ticks over 50 ms; ` +
      `${missed} chunks made on a miss in the ticks, ${world.plane.gen.prefetched} prefetched, ${world.plane.rock.count} chunks held`,
  );
}

function bounded() {
  const game = new Game(generateOneWorld(seed), { autoFound: false }, gameRng(seed), [{ antCount: ants }, { antCount: ants }]);
  const ground = mainGround(game.world);
  // Wake sites where a founding would start a line (open ground, a unit clear of every hole and line), one after another.
  game.newLines = true;
  let woken = 0;
  for (let y = 20; y < 360 && woken < wild; y += 12)
    for (let x = 20; x < 500 && woken < wild; x += 12) {
      const s = game.settleAt({ x, y }, ground);
      if (!s.ok || !s.newLine) continue;
      game.wakeSite(
        {
          x: centreX(s.cell.x, s.cell.y),
          y: centreY(s.cell.y),
          rx: woken,
          ry: 0,
          heading: s.newLine.heading,
        },
        { ants },
      );
      woken++;
    }
  game.newLines = false;
  if (woken < wild) console.error(`awake-bench: only ${woken} of ${wild} wild sites fit on this plane`);
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
}
