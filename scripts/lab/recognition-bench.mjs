// Offline, no key: O3 of the odour-space assays (ja-zg1u.2, PRD §91): what one recognition tick costs today (the scalar code), by the number of occupied
// cells, so S1's sparse K-vector bands (ja-zg1u.3, .4) have a baseline and a budget to keep.
// A tick as the game takes it: Recognition.build over every ant, then, per living ant, look(its odour, its tolerance) and around(its cell, the map) (what
// the fights, the sense and the fungus read). Two colonies (odours 0 and 1, the start pair) of N / 2 ants each, one ant to a cell, so N cells are occupied
// (N = 10, 100, 1000), on an open 128 × 96 map; `--mixed` also gives every ant its own odour band (all 10 bands occupied, the worst case for the mask).
// Usage, from the repo root: node scripts/lab/recognition-bench.mjs [--mixed] [--reps 200]
import { CELL, Colony, Recognition, TOLERANCE, cellOf, centreX, centreY, mulberry32, worldFromArrays } from "../../web/src/colony/index.ts";

const mixed = process.argv.includes("--mixed");
const i = process.argv.indexOf("--reps");
const REPS = i < 0 ? 200 : Number(process.argv[i + 1]);
const map = worldFromArrays({ w: 128, h: 96 }, [
  { x: 8, y: 48, r: 2 },
  { x: 120, y: 48, r: 2 },
]);

function colonies(cells) {
  const out = [];
  for (let k = 0; k < 2; k++) {
    const n = Math.max(1, Math.round(cells / 2));
    const c = new Colony(map, { antCount: n, maxAnts: n, nest: k, odour: k }, mulberry32(7 + k));
    for (let a = 0; a < c.n; a++) {
      const slot = a * 2 + k; // interleaved: the two colonies share the block of cells
      const x = 10 + (slot % 100);
      const y = 10 + Math.floor(slot / 100);
      c.alive[a] = 1;
      c.x[a] = centreX(x, y);
      c.y[a] = centreY(y);
      if (mixed) c.odour[a] = ((a * 7 + k * 3) % 10) / 10 + 0.05;
    }
    out.push(c);
  }
  return out;
}

const hr = () => Number(process.hrtime.bigint()) / 1e6;
console.log(`recognition tick (build + look + around per ant), ${REPS} reps, ${mixed ? "all 10 odour bands" : "two odours"}`);
console.log("occupied cells | build ms | look+around ms (all ants) | tick ms");
for (const cells of [10, 100, 1000]) {
  const cs = colonies(cells);
  const rec = new Recognition();
  const run = () => {
    const t0 = hr();
    rec.build(cs);
    const t1 = hr();
    let s = 0;
    for (const c of cs)
      for (let a = 0; a < c.n; a++) {
        if (!c.alive[a]) continue;
        rec.look(c.odour, a * K, TOLERANCE);
        cellOf(c.x[a], c.y[a]);
        s += rec.around(CELL[0], CELL[1], map);
      }
    return [t1 - t0, hr() - t1, s];
  };
  for (let w = 0; w < 20; w++) run(); // warm up
  let b = 0;
  let l = 0;
  for (let r = 0; r < REPS; r++) {
    const [x, y] = run();
    b += x;
    l += y;
  }
  console.log(`${cells} | ${(b / REPS).toFixed(4)} | ${(l / REPS).toFixed(4)} | ${((b + l) / REPS).toFixed(4)}`);
}
