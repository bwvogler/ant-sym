// Offline, no key, no spend: how a founding queen's flight fares on the ENDLESS plane (PRD §66 E6 measured; ja-qpv.5, docs/endless-world.md §5, §9;
// docs/nest-spacing.md §4). The endless counterpart of scripts/lab/flight-failure.mjs. The colony is not changed: the flight length and the founding
// radius are arguments here (game.ts's FLIGHT_2D and FOUND_RADIUS are constants, so this calls the founding rule, lines.ts nearestValidIn, with them,
// as Game.settleAt does with the world's lines and sites).
//
// The model, per seed (generateEndlessWorld(seed, { regionChunks, density, wildGap })): the start line's two holes are the player's colonies. Round by
// round (a "grow" phase, up to --tries flights, until --colonies own colonies exist) a random own hole flies --flight cells in a seeded random
// direction and the founding rule places her (nearest allowed cell within --radius) or she is lost; a landing is applied (a new one-hole line, or the
// nearest line's end grown). Before each flight every wild site within --wake (280 = W, the fungus's wake distance) of an own hole wakes: it becomes a
// one-hole line of a wild colony (a "stranger"), is no longer a reserved site, and its end may be grown by a landing near it. Then every own hole
// flies --probes more flights from that final state, none applied (the lab's way): those flights are the tally. Reported per config, pooled over the
// seeds, and the WORST seed:
//   fail      flights that found no valid cell within the radius (and the share of failures whose intended point was refused by: a site within 1 U,
//             the line-clearance, the nest-ground rules of transect.ts, or no open ground)
//   new       landings that start a line of their own (rule 1) against `grow` (rule 2) one of the own lines or `join` a wild line (the founding
//             rule's own output, lines.ts called directly, not a distance test and not Game.settleAt with a live game), and `fall` = grows whose landing is farther than NEW_LINE_GAP from every hole (D1, ja-s994)
//   gap       landings by distance to the nearest stranger (a woken wild hole or a still-unwoken site) in units of U = 140 cells: < 0.6 U, 0.6-0.9 U
//             (biology's survival line: nest-spacing §2), 0.9-1.5 U, > 1.5 U, and the share pulled by the founding radius (moved from the intended
//             point) with the mean pull
// The plane's sites outside the flights' reach are never listed (only those within the flight, radius and a margin of the intended point; the real game
// lists the ones within 2 W of an awake colony: the same set for a flight of at most 2 U). Not modelled: ants, the fungus, a wild colony's own daughters.
//
// Usage: node scripts/lab/endless-flight.mjs [--seeds 1-10] [--flight 140,210,280,420] [--radius 70,140,210] [--region 4] [--density 1] [--wild-gap 140]
//        [--wake 280] [--tries 14] [--colonies 8] [--probes 12] [--json out.json] [--bounded]
// --bounded: the sanity check against flight-failure.mjs: the default 512 x 368 plane's box (4-cell edge not open), the lab's rule (transect.ts), the
// same grid of flights and radii, pooled over ends and interior (its two lists summed).
import { CELL, cellOf, centreX, centreY, mainGround, mulberry32, generateEndlessWorld } from "../../web/src/colony/index.ts";
import { applyFounding, canFoundIn, nearestValidIn, oneHoleLine, NEW_LINE_GAP } from "../../web/src/colony/lines.ts";
import { grow, makeTransect, nearestValid } from "../../web/src/colony/transect.ts";
import { writeFileSync } from "node:fs";
import { helpAndExit } from "../lib/usage.mjs";

helpAndExit(import.meta.url);

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? dflt : process.argv[i + 1];
};
const list = (s) => String(s).split(",").map(Number);
const seeds = (s) => {
  const out = [];
  for (const part of String(s).split(",")) {
    const [a, b = a] = part.split("-").map(Number);
    for (let k = a; k <= b; k++) out.push(k);
  }
  return out;
};
const SEEDS = seeds(arg("seeds", "1-10"));
const FLIGHTS = list(arg("flight", "140,210,280,420"));
const RADII = list(arg("radius", "70,140,210"));
const REGION = Number(arg("region", 4));
const DENSITY = Number(arg("density", 1));
const WILD_GAP = Number(arg("wild-gap", 140));
const WAKE = Number(arg("wake", 280));
const TRIES = Number(arg("tries", 14));
const COLONIES = Number(arg("colonies", 8));
const PROBES = Number(arg("probes", 12));
const U = 140;

if (process.argv.includes("--bounded")) {
  bounded();
  process.exit(0);
}

const cx = (c) => centreX(c.x, c.y);
const cy = (c) => centreY(c.y);
const GAP_BINS = ["<0.6U", "0.6-0.9U", "0.9-1.5U", ">1.5U"];
const binOf = (g) => (g < 0.6 * U ? 0 : g < 0.9 * U ? 1 : g < 1.5 * U ? 2 : 3);

/** One seed, one config: the tallies of its probe flights (and the grow phase's own, kept apart). */
function runSeed(seed, flight, radius) {
  const world = generateEndlessWorld(seed, { regionChunks: REGION, density: DENSITY, wildGap: WILD_GAP });
  const plane = world.plane.plane;
  const open = mainGround(world);
  const rng = mulberry32(seed * 7919 + flight);
  /** @type {{transect: any, salt: number, wild: boolean}[]} */
  let lines = world.lines.map((l) => ({ transect: l.line, salt: l.salt, wild: false }));
  const woken = new Set();
  const heading = (c) => 0.5 + (c.x * 131 + c.y * 71) * 1e-3; // a fixed heading per cell (the game draws it from hash01(seed, 100, cell): same kind of draw)
  const own = () => lines.filter((l) => !l.wild).flatMap((l) => l.transect.holes);
  const allHoles = () => lines.flatMap((l) => l.transect.holes.map((h) => ({ x: cx(h), y: cy(h), wild: l.wild })));

  function wake() {
    for (const h of own()) {
      const x = cx(h);
      const y = cy(h);
      for (const s of plane.sitesIn(x - WAKE, y - WAKE, x + WAKE, y + WAKE)) {
        const key = `${s.rx},${s.ry}`;
        if (woken.has(key) || Math.hypot(s.x - x, s.y - y) > WAKE) continue;
        woken.add(key);
        cellOf(s.x, s.y);
        const l = oneHoleLine(seed, { x: CELL[0], y: CELL[1] }, s.heading);
        lines.push({ ...l, wild: true });
      }
    }
  }
  const sitesNear = (x, y, d) => plane.sitesIn(x - d, y - d, x + d, y + d).filter((s) => !woken.has(`${s.rx},${s.ry}`));

  /** One flight from hole `h`: where she lands, or why not. Applies nothing. */
  function fly(h) {
    const a = rng() * 2 * Math.PI;
    const px = cx(h) + flight * Math.cos(a);
    const py = cy(h) + flight * Math.sin(a);
    cellOf(px, py);
    const p = { x: CELL[0], y: CELL[1] };
    const sites = sitesNear(px, py, radius + 330);
    const s = nearestValidIn(lines, sites, p, radius, open, heading, { newLines: true });
    if (!s) {
      const f = canFoundIn(lines, sites, p, open, heading(p), { newLines: true });
      return { ok: false, why: f.ok ? "none" : f.reason, sites };
    }
    const lx = cx(s.cell);
    const ly = cy(s.cell);
    let nearHole = Infinity;
    let nearStranger = Infinity;
    for (const o of allHoles()) {
      const d = Math.hypot(o.x - lx, o.y - ly);
      nearHole = Math.min(nearHole, d);
      if (o.wild) nearStranger = Math.min(nearStranger, d);
    }
    for (const t of sites) nearStranger = Math.min(nearStranger, Math.hypot(t.x - lx, t.y - ly));
    for (const t of sitesNear(lx, ly, 400)) nearStranger = Math.min(nearStranger, Math.hypot(t.x - lx, t.y - ly));
    const moved = Math.hypot(lx - px, ly - py);
    const kind = s.founding.kind === "new" ? "new" : lines[s.founding.line].wild ? "join" : nearHole > NEW_LINE_GAP ? "fall" : "grow";
    return { ok: true, kind, cell: s.cell, founding: s.founding, nearStranger, moved };
  }

  // grow phase: foundings applied (the tally of these is kept as `phase1`)
  const phase1 = { fail: 0, n: 0, new: 0, grow: 0, join: 0, fall: 0 };
  for (let i = 0; i < TRIES && own().length < COLONIES; i++) {
    wake();
    const holes = own();
    const r = fly(holes[Math.floor(rng() * holes.length)]);
    phase1.n++;
    if (!r.ok) {
      phase1.fail++;
      continue;
    }
    phase1[r.kind]++;
    const next = applyFounding(
      seed,
      lines.map((l) => ({ transect: l.transect, salt: l.salt })),
      r.cell,
      r.founding,
    );
    lines = next.map((l, k) => ({ ...l, wild: k < lines.length ? lines[k].wild : false }));
  }
  wake();

  // probes: from the final state, not applied
  const t = { n: 0, fail: 0, new: 0, grow: 0, join: 0, fall: 0, gap: [0, 0, 0, 0], pulled: 0, pull: 0, why: {} };
  for (const h of own())
    for (let j = 0; j < PROBES; j++) {
      const r = fly(h);
      t.n++;
      if (!r.ok) {
        t.fail++;
        t.why[r.why] = (t.why[r.why] ?? 0) + 1;
        continue;
      }
      t[r.kind]++;
      t.gap[binOf(r.nearStranger)]++;
      if (r.moved > 0.5) {
        t.pulled++;
        t.pull += r.moved;
      }
    }
  return { ...t, phase1, colonies: own().length, lines: lines.length, wild: lines.filter((l) => l.wild).length };
}

const out = [];
const pct = (a, b) => (b ? (100 * a) / b : 0);
console.log(
  `endless plane, seeds ${SEEDS[0]}-${SEEDS.at(-1)} (${SEEDS.length}), region ${REGION}x${REGION} chunks, density ${DENSITY}, wild gap ${WILD_GAP}, wake ${WAKE}, ${PROBES} probes per own hole`,
);
console.log(
  "flight radius |  fail% (worst seed) | new% grow% join% fall% | landings <0.6U 0.6-0.9U 0.9-1.5U >1.5U from a stranger | pulled% (mean cells) | own colonies, wild woken",
);
for (const flight of FLIGHTS)
  for (const radius of RADII) {
    const rows = SEEDS.map((s) => runSeed(s, flight, radius));
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const n = sum("n");
    const landed = n - sum("fail");
    const worst = Math.max(...rows.map((r) => pct(r.fail, r.n)));
    const gap = [0, 1, 2, 3].map((i) => rows.reduce((a, r) => a + r.gap[i], 0));
    const why = {};
    for (const r of rows) for (const [k, v] of Object.entries(r.why)) why[k] = (why[k] ?? 0) + v;
    const p1 = ["n", "fail", "new", "grow", "join", "fall"].map((k) => rows.reduce((a, r) => a + r.phase1[k], 0));
    const rec = {
      flight,
      radius,
      n,
      failPct: pct(sum("fail"), n),
      failWorstSeed: worst,
      perSeedFail: rows.map((r) => +pct(r.fail, r.n).toFixed(1)),
      newPct: pct(sum("new"), landed),
      growPct: pct(sum("grow"), landed),
      joinPct: pct(sum("join"), landed),
      fallPct: pct(sum("fall"), landed),
      gapPct: gap.map((g) => pct(g, landed)),
      pulledPct: pct(sum("pulled"), landed),
      meanPull: sum("pulled") ? sum("pull") / sum("pulled") : 0,
      why,
      phase1: Object.fromEntries(["n", "fail", "new", "grow", "join", "fall"].map((k, i) => [k, p1[i]])),
      colonies: sum("colonies") / rows.length,
      wild: sum("wild") / rows.length,
    };
    out.push(rec);
    console.log(
      `${String(flight).padStart(4)} ${String(radius).padStart(4)} | ${rec.failPct.toFixed(1).padStart(5)} (${worst.toFixed(1)}) | ${rec.newPct.toFixed(0)} ${rec.growPct.toFixed(0)} ${rec.joinPct.toFixed(0)} ${rec.fallPct.toFixed(0)} | ` +
        `${rec.gapPct.map((g) => g.toFixed(0).padStart(3)).join(" ")} | ${rec.pulledPct.toFixed(0)} (${rec.meanPull.toFixed(0)}) | ${rec.colonies.toFixed(1)}, ${rec.wild.toFixed(1)}  why ${JSON.stringify(why)} grow-phase ${JSON.stringify(rec.phase1)}`,
    );
  }
const file = arg("json", "");
if (file) writeFileSync(file, JSON.stringify({ args: process.argv.slice(2), out }, null, 1));

/** flight-failure.mjs's question on the bounded default plane's box, over the same grid, pooled over ends and interior. */
function bounded() {
  const W = 512;
  const H = 368;
  const box = (x, y) => x >= 4 && y >= 4 && x < W - 4 && y < H - 4;
  const n = SEEDS.length === 10 ? 300 : SEEDS.length;
  const mid = { x: Math.round(W / 2), y: Math.round(H / 2) };
  console.log(`bounded 512 x 368 box (no rock), seeds 1-${n}: fail pooled over end and interior nests, as flight-failure.mjs`);
  for (const flight of FLIGHTS)
    for (const radius of RADII) {
      let tried = 0;
      let failed = 0;
      const per = [];
      for (let seed = 1; seed <= n; seed++) {
        const rng = mulberry32(seed);
        let t = makeTransect([
          { x: mid.x - 70, y: mid.y },
          { x: mid.x + 70, y: mid.y },
        ]);
        const fly = (from) => {
          const a = rng() * 2 * Math.PI;
          cellOf(centreX(from.x, from.y) + flight * Math.cos(a), centreY(from.y) + flight * Math.sin(a));
          return nearestValid(t, { x: CELL[0], y: CELL[1] }, radius, box);
        };
        for (let i = 0; i < 12 && t.holes.length < 6; i++) {
          const f = fly(t.holes[Math.floor(rng() * t.holes.length)]);
          if (f) t = grow(t, f.end, f.cell);
        }
        let sf = 0;
        let sn = 0;
        for (const h of t.holes)
          for (let j = 0; j < 20; j++) {
            sn++;
            if (!fly(h)) sf++;
          }
        tried += sn;
        failed += sf;
        per.push((100 * sf) / sn);
      }
      console.log(
        `flight ${flight}, radius ${radius}: ${((100 * failed) / tried).toFixed(1)}% of ${tried} fail (worst seed ${Math.max(...per).toFixed(0)}%)`,
      );
    }
}
