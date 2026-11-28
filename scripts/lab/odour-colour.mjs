// Offline, no key, no spend (ja-zg1u.8, S6, PRD §91, docs/odour-space.md "Play"): how well the colour of an odour tells colonies apart.
// For the wild sites of the real endless world (generateEndlessWorld, plane.sitesIn; odour of axis k = hash01(seed, odourSalt(k), rx, ry)), at K = 1 (the
// scalar tone, ink to warn, as before) and K = 4 (the Lab tone of ui/field/colour.ts), in the light and the dark theme, it prints:
//   - of the pairs of neighbouring sites (within DEFAULT_SLEEP.distance) that are strangers, the share whose drawn colours differ by CIEDE2000 >= 8 and >= 12;
//   - the same over pairs of any two sites of a box (a sample), which reach further than a border;
//   - of the pairs that are kin (within the tolerance), the share whose colours differ by less than 8 / 12 (kin that look alike);
//   - the share of strangers that look the same (< 5, below which two colours are hard to tell apart for an ant of a few pixels).
// The colours measured are the ones the field draws: the nest tone, on the grid of quantiseTone. 12 is "another colour at a glance"; the note's decision is that
// a stranger should usually show, not always (four numbers cannot all show in a colour of three).
// Usage, from the repo root: node scripts/lab/odour-colour.mjs [--seeds 1-10] [--box 3000] [--sample 20000] [--sets 1-10,11-20]
import { DEFAULT_SLEEP, generateEndlessWorld, hash01, odourSalt, STRANGER_EPS, TOLERANCE } from "../../web/src/colony/index.ts";
import { deltaE2000, odourToneRgb, quantiseTone, rgbToLab } from "../../web/src/ui/field/colour.ts";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? dflt : process.argv[i + 1];
};
const BOX = Number(arg("box", 3000));
const SAMPLE = Number(arg("sample", 20000));
const SETS = String(arg("sets", "1-10,11-20")).split(",");
const W = DEFAULT_SLEEP.distance;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// The page's --ink and --warn tokens (web/src/index.css), light and dark.
const THEMES = { light: [hex("#1f1d1a"), hex("#8a5300")], dark: [hex("#ece8df"), hex("#e6a44a")] };
const THRESHOLDS = [8, 12];

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
const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

/** What the colours of a list of odour pairs say: strangers shown at each threshold, kin that look alike, strangers that look the same. */
function tally(pairs, K, theme) {
  const [ink, warn] = THEMES[theme];
  const lab = (o) => rgbToLab(quantiseTone(odourToneRgb(ink, warn, o, 0, K)));
  const t = { strangers: 0, kin: 0, shown: THRESHOLDS.map(() => 0), alike: THRESHOLDS.map(() => 0), same: 0 };
  for (const [a, b] of pairs) {
    const e = deltaE2000(lab(a), lab(b));
    if (dist(a, b) > TOLERANCE + STRANGER_EPS) {
      t.strangers++;
      THRESHOLDS.forEach((th, i) => e >= th && t.shown[i]++);
      if (e < 5) t.same++;
    } else {
      t.kin++;
      THRESHOLDS.forEach((th, i) => e < th && t.alike[i]++);
    }
  }
  return t;
}
const add = (a, b) => ({
  strangers: a.strangers + b.strangers,
  kin: a.kin + b.kin,
  shown: a.shown.map((v, i) => v + b.shown[i]),
  alike: a.alike.map((v, i) => v + b.alike[i]),
  same: a.same + b.same,
});
const zero = () => ({ strangers: 0, kin: 0, shown: THRESHOLDS.map(() => 0), alike: THRESHOLDS.map(() => 0), same: 0 });
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) : "-");

const KINDS = ["neighbours", "any two sites"];
for (const set of SETS) {
  const [s0, s1 = s0] = set.split("-").map(Number);
  // One world a seed, its pairs made once; every K and theme reads them.
  const rows = new Map();
  const key = (K, theme, kind) => `${K}|${theme}|${kind}`;
  for (let seed = s0; seed <= s1; seed++) {
    const plane = generateEndlessWorld(seed).plane.plane;
    const sites = plane.sitesIn(-BOX, -BOX, BOX, BOX);
    const near = [];
    for (let i = 0; i < sites.length; i++)
      for (let j = i + 1; j < sites.length; j++) if (Math.hypot(sites[i].x - sites[j].x, sites[i].y - sites[j].y) <= W) near.push([i, j]);
    const rand = rng(seed * 31);
    const any = [];
    for (let n = 0; n < SAMPLE / (s1 - s0 + 1); n++) {
      const i = Math.floor(rand() * sites.length);
      const j = Math.floor(rand() * sites.length);
      if (i !== j) any.push([i, j]);
    }
    for (const K of [1, 4]) {
      const v = sites.map((s) => Array.from({ length: K }, (_, k) => hash01(seed, odourSalt(k), s.rx, s.ry)));
      for (const theme of ["light", "dark"])
        for (const kind of KINDS) {
          const pairs = (kind === KINDS[0] ? near : any).map(([i, j]) => [v[i], v[j]]);
          const t = tally(pairs, K, theme);
          const r = rows.get(key(K, theme, kind)) ?? { all: zero(), worst: 1 };
          r.all = add(r.all, t);
          if (t.strangers) r.worst = Math.min(r.worst, t.shown[1] / t.strangers);
          rows.set(key(K, theme, kind), r);
        }
    }
  }
  console.log(
    `\nseeds ${s0}-${s1}, box +-${BOX}, neighbour distance ${W}, tolerance ${TOLERANCE}; colours on the quantised grid; threshold CIEDE2000`,
  );
  console.log(
    "K | theme | pairs | strangers shown >= 8 | >= 12 | looks the same (< 5) | worst seed >= 12 | kin look alike (< 8) | (< 12) | kin pairs",
  );
  for (const K of [1, 4])
    for (const theme of ["light", "dark"])
      for (const kind of KINDS) {
        const { all, worst } = rows.get(key(K, theme, kind));
        console.log(
          [
            K,
            theme,
            kind,
            all.strangers + all.kin,
            pct(all.shown[0], all.strangers) + "%",
            pct(all.shown[1], all.strangers) + "%",
            pct(all.same, all.strangers) + "%",
            (100 * worst).toFixed(1) + "%",
            pct(all.alike[0], all.kin) + "%",
            pct(all.alike[1], all.kin) + "%",
            all.kin,
          ].join(" | "),
        );
      }
}
