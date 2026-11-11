// Offline, no key: the U3a spike (ja-lp4.3, docs/one-world.md §6). Plays one world, colonies on the plane and the curtain
// crossing at their holes, on the local rule with no fungus landed, and prints a line a minute per colony: its ants on
// each layer, crossings each way, food carried down, stored, births, brood, deaths; the longest any carrier (or homing
// ant) has stayed inside its plane disc without going down, and the longest a young ant (band 0, which may not go out)
// and a middle-aged one (band 1) have stayed by the hole underground, within two cells of it. Homing on the plane (U3b,
// ja-lp4.3.2): the longest a carrier took from turning home (picking food up, on the plane) to going down its hole, and
// the share of homing trips ended down the hole that searched on the way (its belief missed: `search` non-zero). It checks
// the economy runs (food reaches the chambers, the queen lays, ants are born) and that nobody is stuck at a hole. The mound
// and the midden on the plane (U3c, ja-lp4.3.3): per colony, the spoil on the plane nearer its hole than any other (pellets,
// the cells they cover, the tallest, and the mound's radius: the 95th percentile of their distance from the hole, in cells),
// its corpses on the midden and their median distance from the hole.
//
// Usage: node scripts/lab/one-world-spike.mjs [seeds=1-3] [seconds=300] [ants=300]
import { CHUNK, CHUNK_BITS } from "../../web/src/colony/chunks.ts";
import { GAME_REGROW, Game, gameRng } from "../../web/src/colony/game.ts";
import { CELL, cellOf, hexDistance } from "../../web/src/colony/hex.ts";
import { generateOneWorld } from "../../web/src/colony/oneWorld.ts";

/** Colony c's mound and midden on the plane: spoil nearer its hole than any other's, and its midden's corpses. */
function moundOf(plane, c) {
  const holes = c.holeCells;
  const own = holes[c.params.nest];
  const far = [];
  let cells = 0;
  let top = 0;
  plane.spoil?.forEach((cx, cy, a) => {
    for (let j = 0; j < a.length; j++) {
      const h = a[j];
      if (!h) continue;
      const x = cx * CHUNK + (j & (CHUNK - 1));
      const y = cy * CHUNK + (j >> CHUNK_BITS);
      const d = hexDistance(x, y, own.px, own.py);
      if (holes.some((o) => hexDistance(x, y, o.px, o.py) < d)) continue;
      cells++;
      top = Math.max(top, h);
      for (let n = 0; n < h; n++) far.push(d);
    }
  });
  far.sort((a, b) => a - b);
  const md = [];
  for (const [key, n] of c.midden) for (let k = 0; k < n; k++) md.push(hexDistance(key % 65536, Math.floor(key / 65536), own.px, own.py));
  md.sort((a, b) => a - b);
  return { pellets: far.length, cells, top, radius: far.length ? far[Math.floor(0.95 * (far.length - 1))] : 0, midden: md.length, middenAt: md.length ? md[Math.floor((md.length - 1) / 2)] : NaN };
}

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
  // Per colony and ant slot: on the plane, seconds since it turned home (carrying, or in return), whether it carried food
  // and whether it searched this trip; the layer it was on last tick, so a trip that ends down the hole is seen.
  const trip = game.colonies.map((c) => ({ gen: new Uint32Array(c.n), t: new Float32Array(c.n), food: new Uint8Array(c.n), searched: new Uint8Array(c.n), was: new Uint8Array(c.n).fill(1), most: 0, trips: 0, searchTrips: 0 }));
  console.log(`seed ${seed}: plane ${world.plane.size.w}×${world.plane.size.h}, curtain ${world.curtain.size.w}×${world.curtain.size.h}, holes ${game.player.holeCells.map((h) => `(${h.px},${h.py})↔col ${h.col}`).join(", ")}`);
  for (let k = 1; k <= Math.round(seconds / DT); k++) {
    game.tick(DT);
    game.colonies.forEach((c, ci) => {
      const disc = c.layers[0].nest;
      const own = c.holeCells[c.params.nest];
      const D = inDisc[ci];
      const H = atHole[ci];
      const T = trip[ci];
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        if (D.gen[i] !== c.gen[i]) {
          // A new ant in this slot: its clocks start afresh.
          D.gen[i] = H.gen[i] = T.gen[i] = c.gen[i];
          D.t[i] = H.t[i] = T.t[i] = 0;
          T.food[i] = T.searched[i] = 0;
          T.was[i] = 1;
        }
        if (c.layer[i] === 1 && T.was[i] === 0 && T.t[i] > 0) {
          // Down the hole this tick: the trip home is over.
          T.trips++;
          if (T.searched[i]) T.searchTrips++;
          if (T.food[i] && T.t[i] > T.most) T.most = T.t[i];
        }
        if (c.layer[i] === 0 && (c.carrying[i] === 1 || c.mode[i] === 2)) {
          T.t[i] += DT;
          if (c.carrying[i]) T.food[i] = 1;
          if (c.search[i] !== 0) T.searched[i] = 1;
        } else {
          T.t[i] = 0;
          T.food[i] = T.searched[i] = 0;
        }
        T.was[i] = c.layer[i];
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
        const m = moundOf(world.plane, c);
        console.log(
          `  t=${String(t).padStart(3)} c${ci}: ants ${String(c.population).padStart(3)} (plane ${String(plane).padStart(3)}, curtain ${String(curtain).padStart(3)}, at hole ${pinned})` +
            ` up ${c.crossedUp} down ${c.crossedDown} carriedDown ${c.carriedDown} up-with-food ${c.carriedUp} carrying ${carrying}` +
            ` | stored ${c.stored} larder ${c.larder.toFixed(1)} births ${c.births} brood ${larvae} queen ${c.queen?.alive ? "alive" : "dead"}` +
            ` | lost ${c.losses} old ${c.diedOld} hungry ${c.diedHungry} | soilOut ${c.soilOut} buried ${c.buried}` +
            ` | mound ${m.pellets} pellets on ${m.cells} cells, top ${m.top}, radius ${m.radius} (95 %), spread ${c.looseDropped}, down to fill ${c.looseDown} | midden ${m.midden} at ${m.middenAt} cells` +
            ` | longest in disc ${inDisc[ci].most.toFixed(1)} s, young at hole ${atHole[ci].most[0].toFixed(1)} s, middle ${atHole[ci].most[1].toFixed(1)} s` +
            ` | home trips ${trip[ci].trips}, searched ${trip[ci].trips ? ((100 * trip[ci].searchTrips) / trip[ci].trips).toFixed(1) : "0.0"}%, longest carrier home ${trip[ci].most.toFixed(1)} s`,
        );
      });
    }
  }
  console.log(`  plane food ${world.plane.foodLeft}/${world.plane.foodTotal} (regrown ${game.regrown}); plane spoil ${world.plane.moundCells} pellets; ${((performance.now() - t0) / 1000).toFixed(0)} s wall`);
}
