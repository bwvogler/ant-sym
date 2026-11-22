// Offline, no key (ja-lp4.19, PRD §79): one G1 game with piErrorLaw <law> on both colonies, and a read-only probe of the home
// vector. At each ant's turn for home on the plane it records the vector's miss (the believed hole's offset from the real one),
// the ant's distance from its hole and its reach out (the farthest it has been this trip, kept by the probe for both laws);
// at each death on the plane, whether it was defending and how far from its hole it was. Writes JSON for the tables of §79.
// Usage (from the repo root): node scripts/lab/pi-error.mjs <seed> <law 0|1> <seconds> <out.json> [piErrorAt]
import { writeFileSync } from "node:fs";
import { ONE_ASSAYS, runAssay } from "../../web/src/colony/experiment.ts";
import { PLANE, RETURN } from "../../web/src/colony/vocab.ts";
import { homeDistPlane, piSpan } from "../../web/src/colony/homing.ts";

const [seedS, lawS, secS, out, atS] = process.argv.slice(2);
if (!out) {
  console.log("Usage: node scripts/lab/pi-error.mjs <seed> <law 0|1> <seconds> <out.json> [piErrorAt]");
  process.exit(seedS === "--help" ? 0 : 1);
}
const set = { piErrorLaw: Number(lawS), piErrorAt: atS ? Number(atS) : 50 };
const game1 = ONE_ASSAYS.find((a) => a.id === "game1");
const rows = { turn: [], death: [] };
const prev = [];
const reach = [];
const miss = (c, i) => {
  const s = piSpan(c, i);
  return Math.hypot(s * c.driftSurf[i] + c.carriedX[i], s * c.driftSurfY[i] + c.carriedY[i]);
};
const probe = {
  tick(game) {
    game.colonies.forEach((c, k) => {
      const P = (prev[k] ??= []);
      const M = (reach[k] ??= []);
      const was = c.cur;
      c.bind(PLANE);
      const hx = c.nest.x;
      const hy = c.nest.y;
      for (let i = 0; i < c.n; i++) {
        const p = P[i];
        const alive = c.alive[i] === 1;
        const onPlane = alive && c.layer[i] === PLANE;
        if (onPlane) {
          const d = Math.hypot(c.x[i] - hx, c.y[i] - hy);
          if (!p || c.odoSurf[i] < p.odo) M[i] = 0;
          if (c.mode[i] !== RETURN) M[i] = Math.max(M[i] ?? 0, d);
        }
        const now = onPlane
          ? {
              odo: c.odoSurf[i],
              err: miss(c, i),
              d: Math.hypot(c.x[i] - hx, c.y[i] - hy),
              mode: c.mode[i],
              def: c.defending[i],
              hd: homeDistPlane(c, i),
            }
          : null;
        if (p && now && p.mode !== RETURN && now.mode === RETURN)
          rows.turn.push({ k, t: game.time, r: M[i] ?? 0, odo: now.odo, err: now.err, d: now.d, carrying: c.carrying[i] });
        if (p && !alive) rows.death.push({ k, i, t: game.time, odo: p.odo, err: p.err, d: p.d, hd: p.hd, def: p.def });
        P[i] = now;
      }
      c.bind(was);
    });
  },
  summary: () => ({}),
};
let lost = [];
const assay = {
  ...game1,
  spec: (sd) => ({ ...game1.spec(sd), probes: [...(game1.spec(sd).probes ?? []), probe] }),
  score: (r, g) => {
    lost = g.colonies.map((c) => c.losses);
    return game1.score(r, g);
  },
};
const t0 = Date.now();
const res = runAssay(assay, Number(seedS), { colony: set, rival: set }, Number(secS));
writeFileSync(out, JSON.stringify({ seed: Number(seedS), law: set.piErrorLaw, at: set.piErrorAt, metrics: res.metrics, lost, rows }));
console.log(`seed ${seedS} law ${lawS}: ${((Date.now() - t0) / 1000).toFixed(0)} s, lost ${lost}, maxHeld ${res.metrics.maxHeld}`);
