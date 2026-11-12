#!/usr/bin/env node
// The tutorial's first host (ja-7x4, PRD §61): what becomes of the first ant the fungus gets into, as the page plays
// a fresh game (buildGame, the landing, the local rules, 30 steps a second). Offline, spends nothing.
//
// For each seed: the sim-seconds from the landing to the first host (load ≥ INFECTED, the Ink colony), and that ant's
// fate over the next `watch` seconds, whichever comes first: cleared (its load back to 0), died (old, hungry, or else,
// as the colony's counters tell), or still carrying the fungus at the end; and whether it went below (off the plane)
// first. The tutorial's waiting hint and its watch timeout are chosen by the worst seed.
//
// Usage: node scripts/tutorial-first-host.mjs [seeds=1-20] [watch=180] [ants=600]
import { INFECTED, PLANE } from "../web/src/colony/index.ts";
import { buildGame, GAME_STRAIN, LANDING_COLONY } from "../web/src/ui/useColony.ts";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const [range = "1-20", watchArg = "180", antsArg = "600"] = process.argv.slice(2);
const [lo, hi = lo] = range.split("-").map(Number);
const watch = Number(watchArg);
const antCount = Number(antsArg);
const DT = 1 / 30;
const WAIT = 300; // give up on a first host after this many seconds

const rows = [];
for (let seed = lo; seed <= hi; seed++) {
  const g = buildGame({ species: "generic", seed, antCount, rival: true, generation: 0 });
  g.land(LANDING_COLONY, GAME_STRAIN, { evolve: true });
  const c = g.colonies[LANDING_COLONY];
  let t = 0;
  let host = -1;
  while (host < 0 && t < WAIT) {
    g.tick(DT);
    t += DT;
    for (let i = 0; i < c.n; i++)
      if (c.alive[i] && c.load[i] >= INFECTED) {
        host = i;
        break;
      }
  }
  if (host < 0) {
    rows.push({ seed, first: null });
    continue;
  }
  const first = t;
  const gen = c.gen[host];
  let fate = "still";
  let at = watch;
  let below = null;
  let peak = c.load[host];
  for (let s = 0; s < watch; s += DT) {
    const old = c.diedOld;
    const hungry = c.diedHungry;
    g.tick(DT);
    if (!c.alive[host] || c.gen[host] !== gen) {
      fate = c.diedOld > old ? "died old" : c.diedHungry > hungry ? "died hungry" : "died";
      at = s;
      break;
    }
    peak = Math.max(peak, c.load[host]);
    if (below === null && c.layer[host] !== PLANE) below = s;
    if (c.load[host] === 0) {
      fate = "cleared";
      at = s;
      break;
    }
  }
  const hosts = g.fungus.census(c).infected;
  rows.push({ seed, first, fate, at, below, peak, hosts });
}

const f1 = (x) => (x === null ? "—" : x.toFixed(1));
console.log(`First host and its fate: seeds ${lo}–${hi}, ${antCount} + ${antCount} ants, watched ${watch} s after the first host\n`);
console.log("seed  first host (s)  fate         after (s)  below at (s)  peak load  Ink hosts then");
for (const r of rows) {
  if (r.first === null) console.log(`${String(r.seed).padStart(4)}  none in ${WAIT} s`);
  else
    console.log(
      `${String(r.seed).padStart(4)}  ${f1(r.first).padStart(14)}  ${r.fate.padEnd(11)}  ${f1(r.at).padStart(9)}  ${f1(r.below).padStart(12)}  ${r.peak.toFixed(3).padStart(9)}  ${String(r.hosts).padStart(14)}`,
    );
}
const found = rows.filter((r) => r.first !== null);
const by = (k) => found.filter((r) => r.fate === k);
const worst = (xs) => (xs.length ? Math.max(...xs).toFixed(1) : "—");
console.log(
  `\nfirst host: ${found.length}/${rows.length} seeds, worst ${worst(found.map((r) => r.first))} s; cleared ${by("cleared").length} (worst ${worst(by("cleared").map((r) => r.at))} s after), died ${found.filter((r) => r.fate.startsWith("died")).length}, still carrying ${by("still").length}; went below first ${found.filter((r) => r.below !== null && r.below < r.at).length}`,
);
