// Offline, no key: what drawing one world's line in runs over its tiles (ja-lp4.17, docs/one-world.md §3) changes, for
// the PR and the note. On each seed's default world (generateOneWorld) the line grows by up to `foundings` foundings, each
// at the nearest spot the new rule allows to a flight FLIGHT_2D from a random end hole; at every stage it measures:
//  - turns: direction changes per 100 columns between holes, the old hex line's (hexLine) against the runs' (hexRuns);
//  - verdicts: of `flights` random flights from an end hole (0.5–1 × FOUND_RADIUS out, any way), how many land elsewhere
//    (another cell or end, or no landing at all) under the tile rule than under the old one between straight segments,
//    and how far;
//  - time: nearestValid's worst and median per flight under each rule (the pen asks it under the pointer).
// The old rule is `git show <base>:` of transect.ts and hex.ts, written to a temp folder and imported from there.
//
// Usage: node scripts/lab/line-runs.mjs [seeds=1-20] [flights=200] [foundings=3] [--base=main]
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FOUND_RADIUS } from "../../web/src/colony/game.ts";
import { centreX, centreY, CELL, cellOf } from "../../web/src/colony/hex.ts";
import { generateOneWorld, mainGround } from "../../web/src/colony/oneWorld.ts";
import * as now from "../../web/src/colony/transect.ts";
import { mulberry32 } from "../../web/src/colony/world.ts";

const flag = process.argv.find((a) => a.startsWith("--base="));
const base = flag ? flag.slice("--base=".length) : "main";
const [range = "1-20", flightArg = "200", foundArg = "3"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [lo, hi = lo] = range.split("-").map(Number);
const flights = Number(flightArg);
const foundings = Number(foundArg);

const dir = mkdtempSync(join(tmpdir(), "line-runs-"));
for (const f of ["transect.ts", "hex.ts"])
  writeFileSync(join(dir, f), execFileSync("git", ["show", `${base}:web/src/colony/${f}`], { encoding: "utf8" }));
const old = await import(pathToFileURL(join(dir, "transect.ts")).href);

/** Direction changes along columns lo … hi of line t. */
function turns(t, from, to) {
  let n = 0;
  let last = null;
  for (let s = from; s < to; s++) {
    const a = cellOfCol(t, s);
    const b = cellOfCol(t, s + 1);
    const way = `${b[1] - a[1]}:${(centreX(b[0], b[1]) - centreX(a[0], a[1])).toFixed(1)}`;
    if (last !== null && way !== last) n++;
    last = way;
  }
  return n;
}
function cellOfCol(t, s) {
  const i = s - t.sMin;
  return [t.cells[2 * i], t.cells[2 * i + 1]];
}

const same = (a, b) => (a === null) === (b === null) && (a === null || (a.cell.x === b.cell.x && a.cell.y === b.cell.y && a.end === b.end));
const quantile = (xs, q) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * q)] ?? 0;
const median = (xs) => quantile(xs, 0.5);

let cols = 0;
let turnsOld = 0;
let turnsNew = 0;
let asked = 0;
let moved = 0;
const reasons = { lost: 0, found: 0, elsewhere: 0 };
const shift = [];
const tOld = [];
const tNew = [];
for (let seed = lo; seed <= hi; seed++) {
  const world = generateOneWorld(seed);
  const ground = mainGround(world);
  const rng = mulberry32(seed * 104729);
  let holes = world.line.holes.map((h) => ({ x: h.x, y: h.y }));
  for (let stage = 0; stage <= foundings; stage++) {
    const tn = now.makeTransect(holes);
    const to = old.makeTransect(holes);
    for (let j = 1; j < holes.length; j++) {
      cols += tn.sHole[j] - tn.sHole[j - 1];
      turnsOld += turns(to, to.sHole[j - 1], to.sHole[j]);
      turnsNew += turns(tn, tn.sHole[j - 1], tn.sHole[j]);
    }
    let grown = null;
    for (let f = 0; f < flights; f++) {
      const v = rng() < 0.5 ? holes[0] : holes[holes.length - 1];
      const a = rng() * 2 * Math.PI;
      const r = FOUND_RADIUS * (0.5 + 0.5 * rng());
      cellOf(centreX(v.x, v.y) + r * Math.cos(a), centreY(v.y) + r * Math.sin(a));
      const p = { x: CELL[0], y: CELL[1] };
      let t0 = performance.now();
      const ro = old.nearestValid(to, p, FOUND_RADIUS, ground);
      tOld.push(performance.now() - t0);
      t0 = performance.now();
      const rn = now.nearestValid(tn, p, FOUND_RADIUS, ground);
      tNew.push(performance.now() - t0);
      asked++;
      if (!same(ro, rn)) {
        moved++;
        if (rn === null) reasons.lost++;
        else if (ro === null) reasons.found++;
        else {
          reasons.elsewhere++;
          shift.push(Math.hypot(centreX(ro.cell.x, ro.cell.y) - centreX(rn.cell.x, rn.cell.y), centreY(ro.cell.y) - centreY(rn.cell.y)));
        }
      }
      if (!grown && rn) grown = rn;
    }
    if (!grown || stage === foundings) break;
    holes = grown.end === "start" ? [grown.cell, ...holes] : [...holes, grown.cell];
  }
}

const pct = (n, d) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
console.log(`seeds ${lo}-${hi}, ${flights} flights a stage, up to ${foundings} foundings, old rule from ${base}`);
console.log(
  `turns per 100 columns between holes: hexLine ${((100 * turnsOld) / cols).toFixed(1)}, runs ${((100 * turnsNew) / cols).toFixed(1)} (${cols} columns)`,
);
console.log(
  `flights whose landing moved: ${moved} of ${asked} (${pct(moved, asked)}): elsewhere ${reasons.elsewhere}, lost now ${reasons.lost}, found now ${reasons.found}`,
);
console.log(
  `  moved by (world units): median ${median(shift).toFixed(1)}, 90th ${[...shift].sort((a, b) => a - b)[Math.floor(shift.length * 0.9)]?.toFixed(1)}, worst ${Math.max(0, ...shift).toFixed(1)}`,
);
console.log(
  `nearestValid ms: old median ${median(tOld).toFixed(3)} 99th ${quantile(tOld, 0.99).toFixed(2)} worst ${Math.max(...tOld).toFixed(2)}; tiles median ${median(tNew).toFixed(3)} 99th ${quantile(tNew, 0.99).toFixed(2)} worst ${Math.max(...tNew).toFixed(2)}`,
);
