// Offline, no key: the side view's long-run economy and nest building (PRD §40, the F2 fix-up). Runs the app's own setup
// (generateSideWorld(seed), and Game with mulberry32(seed * 7919), as the page does at generation 0) headless on the
// local rule, and reports per colony at each checkpoint:
//   alive     workers alive                     born / old   births so far / deaths of old age so far
//   home      food home so far (stored), and its rate over the last window (food a second)
//   larder    food lying in the colony's chambers  brood   eggs / larvae / pupae
//   floor     the colony's chambers' floor, × its founding floor; chambers with cells
//   follow    mean ants in FOLLOW underground (sampled every second over the window): food scent followed in the nest
//   out>120   ants out over 120 s (since > 120), sampled every 10 s from 120 s: mean share / worst sample
//   ports     porter trips so far (and, where the checkout has them, foragers that handed their food on at reception)
//   dug / filled / out   cells dug, pellets put back (dug + loose off the mound), pellets brought out; loose down / back:
//             loose pellets taken down to fill, and of them carried back out having found nowhere
// and for the map: food left on the ground (walkway) and below it, and every fill and dig counted by a hook on the map
// (no sampling): fills of floor ground (see Colony #floorGround) and of other cells, how many of each were dug out again,
// and re-digs of filled cells as a share of all digs. It also checks food conservation every 10 s: map food + food in
// jaws + larder + Σ brood (1 + fed) + 4 × births stays at the food the map started with.
// A run is deterministic: the same arguments give the same numbers.
//
// Usage: node scripts/economy-bench.mjs [seeds=1-2] [seconds=3600] [ants per colony=600] [colonies=2] [every=600] [root=this repo] [small=0]
//   seeds: a list and/or ranges (1-6, or 1,3,5). root: another checkout to measure (its web/src/colony is imported), so
//   the same harness measures before and after a change. small=1: the tests' small map (256 × 160, ground 40 rows down);
//   or a size and ground row as W×H×ROW (e.g. 192x128x32).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const seeds = (args[0] ?? "1-2").split(",").flatMap((s) => {
  const [a, b] = s.split("-").map(Number);
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, k) => a + k);
});
const seconds = Number(args[1] ?? 3600);
const ants = Number(args[2] ?? 600);
const colonies = Number(args[3] ?? 2);
const every = Number(args[4] ?? 600);
const root = resolve(args[5] ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const sizeArg = args[6] ?? "0";
const small = sizeArg === "1" ? { size: { w: 256, h: 160 }, nestGap: 120, surface: 40 } : sizeArg.includes("x") ? (([w, h, surface]) => ({ size: { w, h }, nestGap: Math.round(w / 2), surface }))(sizeArg.split("x").map(Number)) : null;
const { Game } = await import(`${root}/web/src/colony/game.ts`);
const W = await import(`${root}/web/src/colony/world.ts`);
const { CELL, nx, ny } = await import(`${root}/web/src/colony/hex.ts`);

const DT = 1 / 30;
const FOLLOW = 1;
console.log(`economy-bench: seeds ${seeds.join(",")}, ${seconds} s, ${ants} ants × ${colonies}, ${small ? `map ${small.size.w}×${small.size.h}, ground row ${small.surface}` : "app map"}, root ${root}`);
for (const seed of seeds) {
  const map = W.generateSideWorld(seed, { ...(small ?? {}), nestCount: colonies });
  const g = new Game(map, { antCount: ants, rivalAnts: ants, rival: colonies > 1 }, W.mulberry32(seed * 7919));
  const cs = g.colonies;
  const ch = map.chambers; // none before nest slice 2: older checkouts are measured too
  const floor0 = cs.map((_, k) => ch?.floorOf[k] ?? 0);
  const floorGround = (x, y) => {
    if (!ch) return false;
    if (ch.at(nx(x, y, 4), ny(y, 4)) >= 0 || ch.at(nx(x, y, 5), ny(y, 5)) >= 0) return true;
    for (const d of [0, 3]) {
      const id = ch.at(nx(x, y, d), ny(y, d));
      if (id >= 0 && ch.list[id].floorRow === y) return true;
    }
    return false;
  };
  // Every fill and dig, by a hook on the map's time layers (fillCell stamps filledAt, digCell stamps dugAt).
  const fills = new Map(); // packed cell → { floor }
  const n = { fills: 0, floorFills: 0, digs: 0, redigs: 0, floorRedigs: 0, otherRedigs: 0 };
  const fset = map.filledAt.set.bind(map.filledAt);
  map.filledAt.set = (x, y, v) => {
    if (Number.isFinite(v) && v > 0) {
      const floor = floorGround(x, y);
      fills.set(y * 65536 + x, { floor });
      n.fills++;
      if (floor) n.floorFills++;
    }
    fset(x, y, v);
  };
  const dset = map.dugAt.set.bind(map.dugAt);
  map.dugAt.set = (x, y, v) => {
    n.digs++;
    const f = fills.get(y * 65536 + x);
    if (f) {
      n.redigs++;
      f.floor ? n.floorRedigs++ : n.otherRedigs++;
      fills.delete(y * 65536 + x);
    }
    dset(x, y, v);
  };
  const followSum = cs.map(() => 0);
  const outs = cs.map(() => []);
  let samples = 0;
  const lastHome = cs.map(() => 0);
  let worstDrift = 0;
  const conserved = () => {
    let s = map.foodLeft;
    for (const c of cs) {
      for (let i = 0; i < c.n; i++) if (c.alive[i] && c.carrying[i]) s += 1;
      s += c.larder + 4 * c.births;
      for (const b of c.brood?.items ?? []) s += 1 + b.fed;
    }
    return s - map.foodTotal;
  };
  const t0 = performance.now();
  const steps = Math.round(seconds / DT);
  for (let k = 1; k <= steps; k++) {
    g.tick(DT);
    if (k % 30) continue;
    const t = k / 30;
    samples++;
    cs.forEach((c, ci) => {
      let alive = 0;
      let out = 0;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        alive++;
        if (c.since[i] > 120) out++;
        if (c.mode[i] !== FOLLOW) continue;
        c.antCell(i);
        if (!W.isSky(map, CELL[0], CELL[1])) followSum[ci]++;
      }
      if (t >= 120 && t % 10 === 0) outs[ci].push(alive ? out / alive : 0);
    });
    if (t % 10 === 0) worstDrift = Math.max(worstDrift, Math.abs(conserved()));
    if (t % every !== 0) continue;
    let ground = 0;
    let below = 0;
    for (let y = 0; y < map.size.h; y++)
      for (let x = 0; x < map.size.w; x++) {
        const v = map.food.get(x, y);
        if (v > 0) W.isSky(map, x, y) ? (ground += v) : (below += v);
      }
    console.log(`seed ${seed} t ${t}: map food ${Math.round(ground)} on the ground, ${Math.round(below)} below (of ${Math.round(map.foodTotal)}); fills ${n.fills} (floor ${n.floorFills}); digs ${n.digs}, re-digs of fills ${n.redigs} (${((100 * n.redigs) / Math.max(1, n.digs)).toFixed(1)} % of digs; floor ${n.floorRedigs} = ${((100 * n.floorRedigs) / Math.max(1, n.floorFills)).toFixed(0)} % of floor fills, other ${n.otherRedigs} = ${((100 * n.otherRedigs) / Math.max(1, n.fills - n.floorFills)).toFixed(0)} %); conservation drift ≤ ${worstDrift.toExponential(1)}`);
    cs.forEach((c, ci) => {
      const [e, l, p] = c.brood?.counts() ?? [0, 0, 0];
      const mine = ch ? ch.list.filter((x) => x.colony === ci && x.cells > 0).length : 0;
      const o = outs[ci];
      const outText = o.length ? `${((100 * o.reduce((a, b) => a + b, 0)) / o.length).toFixed(2)} % / ${(100 * Math.max(...o)).toFixed(1)} %` : "–";
      const rate = (c.stored - lastHome[ci]) / every;
      lastHome[ci] = c.stored;
      console.log(
        `  c${ci}: alive ${c.population}  born ${c.births} / old ${c.diedOld ?? 0}  lost ${c.losses}  home ${Math.round(c.stored)} (${rate.toFixed(2)}/s)  larder ${c.larder.toFixed(0)}  brood ${e}/${l}/${p}  queen ${c.queen ? (c.queen.alive ? "yes" : "dead") : "none"}  floor ×${((ch?.floorOf[ci] ?? 0) / Math.max(1, floor0[ci])).toFixed(2)} in ${mine} chambers  out>120 ${outText}  follow ${(followSum[ci] / samples).toFixed(1)}  ports ${c.portTrips}  dug ${c.soilDug} filled ${c.soilFilled}+${c.looseFilled} out ${c.soilOut}${c.looseDown === undefined ? "" : `  loose down ${c.looseDown} back ${c.looseBack}`}${c.handedOn === undefined ? "" : `  handed on ${c.handedOn}`}`,
      );
      followSum[ci] = 0;
    });
    samples = 0;
  }
  console.log(`seed ${seed}: ${((performance.now() - t0) / steps).toFixed(2)} ms a tick`);
}
