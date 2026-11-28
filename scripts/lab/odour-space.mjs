// Offline, no key, no spend (ja-zg1u.2, S0, PRD §91, docs/odour-space.md): the odour-space assays that need no game, measuring what K = 1..4 odour axes
// would do to the wild world the endless plane really makes. Nothing here changes behaviour: it reads the plane (generateEndlessWorld, plane.sitesIn) and
// computes the symmetric distance d = sqrt(sum_k (o_k - t_k)^2) > TOLERANCE + STRANGER_EPS (the owner's choice, 2026-11-28; K = 1 is today's |o - t|).
//   Wild site axis k odour = hash01(seed, 101 + k, rx, ry) (axis 0 is today's salt 101); the start colonies sit on the main diagonal, (0,..,0) and (1,..,1).
//   Neighbours = wild site pairs within DEFAULT_SLEEP.distance (W = 280, the wake distance), over the sites in a box of ±BOX units round the origin.
// Per K it prints: kin share among neighbour pairs; share of wild colonies that are strangers to BOTH start colonies; the largest mutual-stranger set:
//   (a) in the unit cube by random packing (the note's ~78 at K = 4: draws accepted while a stranger to every accepted one), (b) among a world's sites, and
//   (c) among one site and its neighbours (the most any single border holds). Also the uniform-draw Monte Carlo the note's table came from, for comparison.
// Usage, from the repo root: node scripts/lab/odour-space.mjs [--seeds 1-10] [--box 3000] [--pack 40] [--draws 40000]
import { DEFAULT_SLEEP, generateEndlessWorld, hash01, STRANGER_EPS, TOLERANCE } from "../../web/src/colony/index.ts";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? dflt : process.argv[i + 1];
};
const [s0, s1 = s0] = String(arg("seeds", "1-10")).split("-").map(Number);
const BOX = Number(arg("box", 3000));
const PACK = Number(arg("pack", 40));
const DRAWS = Number(arg("draws", 40000));
const W = DEFAULT_SLEEP.distance;
const KS = [1, 2, 3, 4];

/** Whether odour vectors a and b are strangers (symmetric Euclidean). */
export function stranger(a, b) {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s) > TOLERANCE + STRANGER_EPS;
}

/** A seeded generator (mulberry32 form, local: the lab must not depend on a game stream). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Greedy random packing: visit the vectors in random order, keep one that is a stranger to every one kept. */
function packSize(vs, rand) {
  const order = vs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const kept = [];
  for (const i of order) if (kept.every((o) => stranger(vs[i], o))) kept.push(vs[i]);
  return kept.length;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

const rows = Object.fromEntries(KS.map((K) => [K, { pairs: 0, kin: 0, wild: 0, both: 0, cube: [], world: [], border: [], perSeed: [] }]));

for (let seed = s0; seed <= s1; seed++) {
  const plane = generateEndlessWorld(seed).plane.plane;
  const sites = plane.sitesIn(-BOX, -BOX, BOX, BOX);
  const near = sites.map(() => []);
  const pairs = [];
  for (let i = 0; i < sites.length; i++)
    for (let j = i + 1; j < sites.length; j++)
      if (Math.hypot(sites[i].x - sites[j].x, sites[i].y - sites[j].y) <= W) {
        pairs.push([i, j]);
        near[i].push(j);
        near[j].push(i);
      }
  for (const K of KS) {
    const r = rows[K];
    const v = sites.map((s) => Array.from({ length: K }, (_, k) => hash01(seed, 101 + k, s.rx, s.ry)));
    const lo = Array(K).fill(0);
    const hi = Array(K).fill(1);
    let kin = 0;
    for (const [i, j] of pairs) if (!stranger(v[i], v[j])) kin++;
    let both = 0;
    for (const o of v) if (stranger(o, lo) && stranger(o, hi)) both++;
    r.pairs += pairs.length;
    r.kin += kin;
    r.wild += sites.length;
    r.both += both;
    r.perSeed.push([seed, pairs.length ? kin / pairs.length : 0, both / sites.length]);
    const rand = rng(seed * 7919 + K);
    r.world.push(mean(Array.from({ length: 20 }, () => packSize(v, rand))));
    let best = 0;
    for (let i = 0; i < sites.length; i++) {
      const local = [v[i], ...near[i].map((j) => v[j])];
      best = Math.max(best, ...Array.from({ length: 10 }, () => packSize(local, rand)));
    }
    r.border.push(best);
  }
}
// The note's reference Monte Carlo: uniform odours in the unit cube, K axes.
const rand = rng(12345);
for (const K of KS) {
  const draw = () => Array.from({ length: K }, rand);
  for (let t = 0; t < PACK; t++) rows[K].cube.push(packSize(Array.from({ length: DRAWS }, draw), rand));
  rows[K].uniformKin = mean(Array.from({ length: 200000 }, () => (stranger(draw(), draw()) ? 0 : 1)));
  rows[K].uniformBoth = mean(
    Array.from({ length: 200000 }, () => {
      const o = draw();
      return stranger(o, Array(K).fill(0)) && stranger(o, Array(K).fill(1)) ? 1 : 0;
    }),
  );
}

console.log(`seeds ${s0}-${s1}, box ±${BOX}, W ${W}, tolerance ${TOLERANCE}, wild sites ${rows[1].wild}, neighbour pairs ${rows[1].pairs}`);
console.log(
  "K | kin share of neighbour pairs | wild strangers to both start colonies | worst seed (both) | mutual strangers: cube pack | in a world | one border | uniform kin | uniform both",
);
for (const K of KS) {
  const r = rows[K];
  const worst = Math.min(...r.perSeed.map((p) => p[2]));
  console.log(
    [
      K,
      (r.kin / r.pairs).toFixed(4),
      ((100 * r.both) / r.wild).toFixed(1) + "%",
      (100 * worst).toFixed(1) + "%",
      mean(r.cube).toFixed(1),
      mean(r.world).toFixed(1),
      `${mean(r.border).toFixed(1)} (max ${Math.max(...r.border)})`,
      r.uniformKin.toFixed(4),
      (100 * r.uniformBoth).toFixed(1) + "%",
    ].join(" | "),
  );
}
