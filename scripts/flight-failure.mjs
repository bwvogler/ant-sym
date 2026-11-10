// Offline, no key: how often a founding queen's flight fails under one world's founding rule (docs/one-world.md §3,
// docs/nest-spacing.md §4), by flight length and landing radius. Lines start from the default map's two nests, 140
// apart, and grow by flights from random nests (up to 6 holes, 12 tries); then every nest flies 20 times in seeded
// random directions. A flight fails when nearestValid finds no allowed cell within the radius. The plane is the
// default 512 × 368 with a 4-cell edge counted not open; the open map's rock (~22%) is NOT modelled, so real rates run
// somewhat higher.
//
// Measured 2026-11-08 (ja-lp4.10), 300 seeds: flight 140 with radius 70 failed 51% from end nests and 55% from interior
// ones; radius 140, 6% and 28% (chosen); radius 210, 1% and 7%. Rerun 2026-11-10 at HOLE_GAP_2D 16 (ja-tjo; it was 12):
// 51%/55%, 7%/28%, 1%/7%; flight 210 with radius 70, 79%/66%, with 140, 47%/45% (unchanged from 12). Rerun when the
// plane changes size (the endless world, ja-qpv, removes the edges that drive most failures at radius 70).
//
// --rock (measured 2026-11-10, seeds 1–20): flight 140 fails 53%/56% from end/interior nests at radius 70, 8%/27% at
// 140, 0%/6% at 210; flight 210, 76%/69% and 44%/45%.
// --rock: the founding-radius assay one-world §8 item 5 asks for (U4a): each seed's own plane, generateWorld(seed,
// OPEN_WORLD) as one world's is, with its rock (open = openCell(plane), the plane's edge included), and the line through
// its two nests' holes, as generateOneWorld makes it. Default seeds 1–20.
//
// Usage: node scripts/flight-failure.mjs [--rock] [seeds=300 (20 with --rock)] [width=512] [height=368]
import { CELL, cellOf, centreX, centreY } from "../web/src/colony/hex.ts";
import { grow, makeTransect, nearestValid } from "../web/src/colony/transect.ts";
import { generateWorld, mulberry32, OPEN_WORLD, openCell } from "../web/src/colony/world.ts";

const rock = process.argv.includes("--rock");
const args = process.argv.slice(2).filter((a) => a !== "--rock").map(Number);
const [seeds = rock ? 20 : 300, W = 512, H = 368] = args;
const box = (x, y) => x >= 4 && y >= 4 && x < W - 4 && y < H - 4;
let open = box;

/** The seed's own plane, and its line through its nests' holes (generateOneWorld's), with --rock; else the bare box. */
function start(seed) {
  if (!rock) return makeTransect([{ x: mid.x - 70, y: mid.y }, { x: mid.x + 70, y: mid.y }]);
  const plane = generateWorld(seed, { ...OPEN_WORLD, size: { w: W, h: H } });
  open = openCell(plane);
  return makeTransect(
    plane.nests.map((n) => {
      cellOf(n.x, n.y);
      return { x: CELL[0], y: CELL[1] };
    }),
  );
}

function fly(t, from, rng, dist, radius) {
  const a = rng() * 2 * Math.PI;
  cellOf(centreX(from.x, from.y) + dist * Math.cos(a), centreY(from.y) + dist * Math.sin(a));
  return nearestValid(t, { x: CELL[0], y: CELL[1] }, radius, open);
}

const mid = { x: Math.round(W / 2), y: Math.round(H / 2) };
for (const [dist, radius] of [[140, 70], [140, 140], [140, 210], [210, 70], [210, 140]]) {
  const tally = { end: [0, 0], interior: [0, 0] };
  let holes = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = mulberry32(seed);
    let t = start(seed);
    for (let i = 0; i < 12 && t.holes.length < 6; i++) {
      const f = fly(t, t.holes[Math.floor(rng() * t.holes.length)], rng, dist, radius);
      if (f) t = grow(t, f.end, f.cell);
    }
    holes += t.holes.length;
    t.holes.forEach((h, i) => {
      const kind = i === 0 || i === t.holes.length - 1 ? "end" : "interior";
      for (let j = 0; j < 20; j++) {
        tally[kind][0]++;
        if (!fly(t, h, rng, dist, radius)) tally[kind][1]++;
      }
    });
  }
  const pct = ([n, f]) => `${((100 * f) / Math.max(1, n)).toFixed(0)}% of ${n}`;
  console.log(`flight ${dist}, radius ${radius}: fail from ends ${pct(tally.end)}, from interior ${pct(tally.interior)}; mean holes ${(holes / seeds).toFixed(1)}`);
}
