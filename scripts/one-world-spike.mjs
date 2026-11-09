// Offline, no key: the U3a spike (ja-lp4.3, docs/one-world.md §6). Plays one world, colonies on the plane and the curtain
// crossing at their holes, on the local rule with no fungus landed, and prints a line a minute per colony: its ants on
// each layer, crossings each way, food carried down, stored, births, brood, deaths; the longest any carrier (or homing
// ant) has stayed inside its plane disc without going down, and the longest a young ant (band 0, which may not go out)
// and a middle-aged one (band 1) have stayed by the hole underground, within two cells of it. It checks the economy
// runs (food reaches the chambers, the queen lays, ants are born) and that nobody is stuck at a hole.
//
// Usage: node scripts/one-world-spike.mjs [seeds=1-3] [seconds=300] [ants=300]
import { GAME_REGROW, Game, gameRng } from "../web/src/colony/game.ts";
import { CELL, cellOf, hexDistance } from "../web/src/colony/hex.ts";
import { generateOneWorld } from "../web/src/colony/oneWorld.ts";

const [range = "1-3", secs = "300", antArg = "300"] = process.argv.slice(2);
const [lo, hi = lo] = range.split("-").map(Number);
const seconds = Number(secs);
const ants = Number(antArg);
const DT = 1 / 30;
const EVERY = Math.round(60 / DT);

for (let seed = lo; seed <= hi; seed++) {
  const t0 = performance.now();
  const world = generateOneWorld(seed);
  const game = new Game(world, { antCount: ants, rivalAnts: ants, regrow: GAME_REGROW }, gameRng(seed));
  // Per colony and ant slot (by its generation): seconds in a row inside the plane disc going in, or by the hole underground.
  const inDisc = game.colonies.map((c) => ({ gen: new Uint32Array(c.n), t: new Float32Array(c.n), most: 0 }));
  const atHole = game.colonies.map((c) => ({ gen: new Uint32Array(c.n), t: new Float32Array(c.n), most: [0, 0] }));
  console.log(`seed ${seed}: plane ${world.plane.size.w}×${world.plane.size.h}, curtain ${world.curtain.size.w}×${world.curtain.size.h}, holes ${game.player.holeCells.map((h) => `(${h.px},${h.py})↔col ${h.col}`).join(", ")}`);
  for (let k = 1; k <= Math.round(seconds / DT); k++) {
    game.tick(DT);
    game.colonies.forEach((c, ci) => {
      const disc = c.layers[0].nest;
      const own = c.holeCells[c.params.nest];
      const D = inDisc[ci];
      const H = atHole[ci];
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        if (D.gen[i] !== c.gen[i]) {
          // A new ant in this slot: its clocks start afresh.
          D.gen[i] = H.gen[i] = c.gen[i];
          D.t[i] = H.t[i] = 0;
        }
        const x = c.x[i];
        const y = c.y[i];
        if (c.layer[i] === 0) {
          H.t[i] = 0;
          const going = c.carrying[i] === 1 || c.mode[i] === 2;
          if (going && Math.hypot(x - disc.x, y - disc.y) < disc.r) {
            D.t[i] += DT;
            if (D.t[i] > D.most) D.most = D.t[i];
          } else D.t[i] = 0;
        } else {
          D.t[i] = 0;
          const b = c.band(i);
          cellOf(x, y);
          if (b < 2 && hexDistance(CELL[0], CELL[1], own.col, own.row) <= 2) {
            H.t[i] += DT;
            if (H.t[i] > H.most[b]) H.most[b] = H.t[i];
          } else H.t[i] = 0;
        }
      }
    });
    if (k % EVERY === 0 || k === Math.round(seconds / DT)) {
      const t = Math.round(k * DT);
      game.colonies.forEach((c, ci) => {
        let plane = 0;
        let curtain = 0;
        let carrying = 0;
        let pinned = 0;
        const own = c.holeCells[c.params.nest];
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i]) continue;
          if (c.layer[i] === 0) {
            plane++;
            carrying += c.carrying[i];
          } else {
            curtain++;
            cellOf(c.x[i], c.y[i]);
            if (hexDistance(CELL[0], CELL[1], own.col, own.row) <= 1) pinned++;
          }
        }
        const larvae = c.brood.items.length;
        console.log(
          `  t=${String(t).padStart(3)} c${ci}: ants ${String(c.population).padStart(3)} (plane ${String(plane).padStart(3)}, curtain ${String(curtain).padStart(3)}, at hole ${pinned})` +
            ` up ${c.crossedUp} down ${c.crossedDown} carriedDown ${c.carriedDown} up-with-food ${c.carriedUp} carrying ${carrying}` +
            ` | stored ${c.stored} larder ${c.larder.toFixed(1)} births ${c.births} brood ${larvae} queen ${c.queen?.alive ? "alive" : "dead"}` +
            ` | lost ${c.losses} old ${c.diedOld} hungry ${c.diedHungry} | soilOut ${c.soilOut} buried ${c.buried}` +
            ` | longest in disc ${inDisc[ci].most.toFixed(1)} s, young at hole ${atHole[ci].most[0].toFixed(1)} s, middle ${atHole[ci].most[1].toFixed(1)} s`,
        );
      });
    }
  }
  console.log(`  plane food ${world.plane.foodLeft}/${world.plane.foodTotal} (regrown ${game.regrown}); ${((performance.now() - t0) / 1000).toFixed(0)} s wall`);
}
