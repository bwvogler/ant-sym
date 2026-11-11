// Offline, no key: how well the side view's ants get about. Runs the app's own setup (generateSideWorld(seed), and
// Game with mulberry32(seed * 7919), as the page does at generation 0) headless on the local rule, and reports per
// colony what reviews have measured by hand (PRD §40):
//   food      food home (stored)                          births  workers born from pupae
//   alive     workers alive at the end
//   out>120   ants out over 120 s (since > 120), sampled every 10 s from 120 s: mean share / worst sample
//   car>120   foragers holding food over 120 s (carrying it home from outside): at the end / most at any 10 s sample
//   carMax    longest any forager at the end has held its food (s)
//   port>120  porters (food moved between chambers, nest slice 5) holding it over 120 s, by their own hold clock (since
//             becoming a porter; `since` isn't reset then, so an ant that rested inside counted at once: review of #36):
//             at the end / most at any sample
//   stuck     ant-seconds of ants that haven't left their cell for 20 s or more (sampled every second), split into
//             ground  on the ground line (sky cells), homing        tip  underground, exploring (dead-end tips: #25)
//             other   the rest underground
//   hole      ants still for 20 s or more on the ground within 3 columns of any hole, at the end (the freeze above it)
//   stuck60   ants still for 60 s or more at the end, anywhere
// A run is deterministic: the same arguments give the same numbers.
//
// Usage: node scripts/lab/side-bench.mjs [seeds=1-6] [seconds=600] [ants per colony=600] [colonies=2] [root=this repo]
//   seeds: a list and/or ranges (1-6, or 1,3,5). root: another checkout to measure (its web/src/colony is imported),
//   so the same harness measures before and after a change.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const seeds = (args[0] ?? "1-6").split(",").flatMap((s) => {
  const [a, b] = s.split("-").map(Number);
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, k) => a + k);
});
const seconds = Number(args[1] ?? 600);
const ants = Number(args[2] ?? 600);
const colonies = Number(args[3] ?? 2);
const root = resolve(args[4] ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
const { Game } = await import(`${root}/web/src/colony/game.ts`);
const W = await import(`${root}/web/src/colony/world.ts`);
const { CELL, cellOf } = await import(`${root}/web/src/colony/hex.ts`);

const DT = 1 / 30;
// Porters exist since nest slice 5; an older checkout has no way to tell them, and counts every carrier a forager.
const porter = (c, i) => typeof c.porting === "function" && c.porting(i);
const RETURN = 2;
const EXPLORE = 0;
const pct = (v) => `${(100 * v).toFixed(1)} %`;
const totals = [];
console.log(`side-bench: seeds ${seeds.join(",")}, ${seconds} s, ${ants} ants × ${colonies} colon${colonies === 1 ? "y" : "ies"}, root ${root}`);
for (const seed of seeds) {
  const map = W.generateSideWorld(seed, colonies === 1 ? { nestCount: 1 } : { nestCount: colonies });
  const g = new Game(map, { antCount: ants, rivalAnts: ants }, W.mulberry32(seed * 7919));
  const cs = g.colonies;
  const holes = map.nests.map((n) => (cellOf(n.entrance.x, n.entrance.y), CELL[0]));
  const st = cs.map((c) => ({
    last: new Int32Array(c.n).fill(-1),
    still: new Float32Array(c.n),
    hold: new Float32Array(c.n),
    out: [],
    carEndMax: 0,
    portPeak: 0,
    stuck: { ground: 0, tip: 0, other: 0 },
  }));
  const t0 = performance.now();
  const steps = Math.round(seconds / DT);
  for (let k = 1; k <= steps; k++) {
    g.tick(DT);
    if (k % 30) continue;
    const t = k / 30;
    cs.forEach((c, ci) => {
      const s = st[ci];
      let alive = 0;
      let out = 0;
      let car = 0;
      let port = 0;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) {
          s.still[i] = 0;
          s.hold[i] = 0;
          s.last[i] = -1;
          continue;
        }
        alive++;
        if (c.since[i] > 120) out++;
        s.hold[i] = c.carrying[i] && porter(c, i) ? s.hold[i] + 1 : 0; // sampled once a second
        if (c.carrying[i] && porter(c, i)) {
          if (s.hold[i] > 120) port++;
        } else if (c.carrying[i] && c.since[i] > 120) car++;
        c.antCell(i);
        const key = CELL[1] * 65536 + CELL[0];
        s.still[i] = key === s.last[i] ? s.still[i] + 1 : 0;
        s.last[i] = key;
        if (s.still[i] >= 20) {
          const sky = W.isSky(map, CELL[0], CELL[1]);
          if (sky && c.mode[i] === RETURN) s.stuck.ground++;
          else if (!sky && c.mode[i] === EXPLORE) s.stuck.tip++;
          else if (!sky) s.stuck.other++;
          else s.stuck.ground++;
        }
      }
      if (t >= 120 && t % 10 === 0) {
        s.out.push(alive ? out / alive : 0);
        s.carEndMax = Math.max(s.carEndMax, car);
        s.portPeak = Math.max(s.portPeak, port);
      }
    });
  }
  const ms = (performance.now() - t0) / steps;
  const rows = cs.map((c, ci) => {
    const s = st[ci];
    let car = 0;
    let port = 0;
    let carMax = 0;
    let hole = 0;
    let stuck60 = 0;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      if (c.carrying[i] && porter(c, i)) {
        if (s.hold[i] > 120) port++;
      } else if (c.carrying[i]) {
        if (c.since[i] > 120) car++;
        carMax = Math.max(carMax, c.since[i]);
      }
      c.antCell(i);
      if (s.still[i] >= 60) stuck60++;
      if (s.still[i] >= 20 && W.isSky(map, CELL[0], CELL[1]) && holes.some((h) => Math.abs(CELL[0] - h) <= 3)) hole++;
    }
    const outMean = s.out.length ? s.out.reduce((a, b) => a + b, 0) / s.out.length : 0;
    const outWorst = s.out.length ? Math.max(...s.out) : 0;
    const r = { seed, colony: ci, food: c.stored, births: c.births, alive: c.population, outMean, outWorst, car, carPeak: s.carEndMax, carMax, port, portPeak: s.portPeak, ...s.stuck, hole, stuck60 };
    totals.push(r);
    return r;
  });
  for (const r of rows)
    console.log(
      `seed ${seed} c${r.colony}: food ${Math.round(r.food)}  births ${r.births}  alive ${r.alive}  out>120 ${pct(r.outMean)} / ${pct(r.outWorst)}  car>120 ${r.car} / ${r.carPeak}  carMax ${r.carMax.toFixed(0)} s  port>120 ${r.port} / ${r.portPeak}  stuck ground ${r.ground} tip ${r.tip} other ${r.other}  hole ${r.hole}  stuck60 ${r.stuck60}`,
    );
  console.log(`seed ${seed}: ${ms.toFixed(2)} ms a tick`);
}
const sum = (f) => totals.reduce((a, r) => a + f(r), 0);
const max = (f) => Math.max(...totals.map(f));
console.log(
  `all: food ${Math.round(sum((r) => r.food))}  births ${sum((r) => r.births)}  out>120 mean ${pct(sum((r) => r.outMean) / totals.length)} (worst ${pct(max((r) => r.outWorst))})  car>120 at end ${sum((r) => r.car)} (most in one colony ${max((r) => r.car)}, peak sample ${max((r) => r.carPeak)})  port>120 at end ${sum((r) => r.port)} (peak ${max((r) => r.portPeak)})  stuck ground ${sum((r) => r.ground)} tip ${sum((r) => r.tip)} other ${sum((r) => r.other)}  hole ${sum((r) => r.hole)}  stuck60 ${sum((r) => r.stuck60)}`,
);
