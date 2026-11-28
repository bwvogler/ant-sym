// Offline, no key: how long one colony tick takes. Runs the game headless (generateOneWorld(seed), docs/one-world.md: the
// plane and the curtain, two colonies on the local rule) and reports the median and 90th-percentile milliseconds per tick
// after a warm-up, plus the ants alive at the end and how many are on each layer. Ants spread out over the run, so the
// late ticks (more trail laid, more chunks awake) are the honest ones.
//
// With spores=1, Bloom is painted over both royal chambers at the start: every ant of both colonies carries load, the
// fungus's worst case per tick.
//
// --page plays the game as the page plays it (U6a): gameRng(seed), regrowth on, no queen founded on her own (the pen's),
// and Garden landed by the first colony's hole at the start, evolving, as the Start button lands it (ui/useColony.ts).
// --hash prints a hash of the whole game at the end (tests/saveHash.ts): a tick refactor must leave it unchanged.
// --one is accepted and ignored: one world is the only game (S2.3d).
//
// Usage: node scripts/colony-bench.mjs [--page] [--hash] [ants per colony=1200] [sim seconds=60] [seed=1] [spores=0] [--axes=N odour axes, default the game's]
import { CURTAIN, PLANE, STRAINS, GAME_REGROW, Game, gameRng, generateOneWorld, mulberry32 } from "../web/src/colony/index.ts";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const page = process.argv.includes("--page");
const hash = process.argv.includes("--hash");
const axes = Number(process.argv.find((a) => a.startsWith("--axes="))?.slice(7));
const recognition = axes ? { recognition: { odourAxes: axes } } : {};
const [ants = 1200, seconds = 60, seed = 1, spores = 0] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"))
  .map(Number);
const DT = 1 / 30;

for (const ground of [page ? "one world, two, as the page plays it" : "one world, two"]) {
  const t0 = performance.now();
  const map = generateOneWorld(seed);
  const gen = performance.now() - t0;
  const size = map.plane.size;
  const pair = [{ antCount: ants }, { antCount: ants }];
  const game = page
    ? new Game(map, { regrow: GAME_REGROW, autoFound: false, ...recognition }, gameRng(seed), pair)
    : new Game(map, { ...recognition }, mulberry32(seed * 31 + 7), pair);
  if (page)
    game.land(
      0,
      STRAINS.findIndex((s) => s.id === "garden"),
      { evolve: true },
    );
  if (spores) for (const c of game.colonies) game.paintSpores(c.nest.x, c.nest.y, c.nest.r + 2, 3, 0.3, 1, CURTAIN);
  const steps = Math.round(seconds / DT);
  const warm = Math.round(5 / DT);
  const ms = [];
  for (let k = 0; k < steps; k++) {
    const a = performance.now();
    game.tick(DT);
    if (k >= warm) ms.push(performance.now() - a);
  }
  // The second half alone: the JIT has settled by then (one world's colony tick is optimized only after ~30 s of play).
  const late = ms.slice(ms.length >> 1);
  const lateMean = (late.reduce((a, b) => a + b, 0) / late.length).toFixed(2);
  ms.sort((a, b) => a - b);
  const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(2);
  const mean = (ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2);
  const alive = game.colonies.map((c) => c.population).join(" + ");
  const awake = game.colonies[0].ph.awakeChunks?.() ?? "n/a";
  const dug = game.colonies.map((c) => c.soilDug).join(" / ");
  const onLayer = (c, l) => c.layer.filter((v, i) => v === l && c.alive[i]).length;
  const layers = `; plane/curtain ${game.colonies.map((c) => `${onLayer(c, PLANE)}/${onLayer(c, CURTAIN)}`).join(" + ")}`;
  const h = hash ? `; hash ${(await import("../web/src/colony/tests/saveHash.ts")).hashGame(game)}` : "";
  console.log(
    `${size.w}×${size.h} ${ground}: generate ${gen.toFixed(0)} ms; tick mean ${mean} ms, median ${q(0.5)} ms, p90 ${q(0.9)} ms over ${seconds} s (second half: mean ${lateMean} ms); ants ${alive}${layers}; stored ${game.colonies.map((c) => c.stored).join(" / ")}; dug ${dug}; awake chunks ${awake}${spores ? `; infected ${game.colonies.map((c) => game.fungus.census(c).infected).join(" + ")}` : ""}${page ? `; infected ${game.colonies.map((c) => game.fungus.census(c).infected).join(" + ")}, spore cells ${game.fungus.sporeCells}` : ""}${h}`,
  );
}
