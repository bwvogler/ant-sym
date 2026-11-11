import { test } from "node:test";
import assert from "node:assert/strict";
import { LIFESPAN, MODES, PI_DRIFT, PLANE, type Colony, type HoleCell } from "../colony.ts";
import { Game, gameRng } from "../game.ts";
import { centreX, centreY } from "../hex.ts";
import { generateOneWorld } from "../oneWorld.ts";

// One world's nest search (ja-lp4.11, docs/nest-search.md, PRD §55): a carrier whose vector ran out where no hole was
// runs loops out from that spot and back, each headed searchTurn on from the last and reaching further, the first
// searchLoops σ out (σ from its own trip). A rock-free small plane (160 × 100, seed 7) keeps the geometry clean: the
// player's hole at cell (48, 32), the carrier's vector ending 60 east of it, out of reach of the loops these tests watch.

const DT = 1 / 30;
const RETURN = MODES.indexOf("return");
const SIGMA_PER_CELL = PI_DRIFT / Math.SQRT2;

/** The loops as designed (PRD §55), whatever the defaults. */
const LOOPS: Partial<Colony["params"]> = { searchLoops: 0.5, searchGrow: 0.125, searchTurn: Math.PI * (3 - Math.sqrt(5)), searchPetal: Math.PI / 3, searchStall: 1 };

const game = (params: Partial<Colony["params"]> = LOOPS): Game => {
  const g = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 }, rockiness: 0 } }), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(7));
  for (const c of g.colonies) {
    for (let i = 0; i < c.n; i++) if (c.alive[i]) c.age[i] = 0.05 * LIFESPAN;
    Object.assign(c.params, { scoutRate: 0, raidScout: 0, ...params });
  }
  return g;
};

/** Ant 0 of the player, a carrier at its vector's end (`odo` walked, the end 60 east of its hole), facing east. Its origin. */
function lost(g: Game, odo: number): { c: Colony; ox: number; oy: number } {
  const c = g.player;
  const hc = c.holeCells[c.params.nest] as HoleCell;
  const ox = centreX(hc.px, hc.py) + 60;
  const oy = centreY(hc.py);
  c.age[0] = 0.5 * LIFESPAN;
  c.putAnt(0, PLANE, ox, oy);
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  c.heading[0] = 0;
  c.odoSurf[0] = odo;
  c.driftSurf[0] = 60 / odo;
  c.driftSurfY[0] = 0;
  return { c, ox, oy };
}

interface Leg {
  /** the leg's index (searchLeg) */
  n: number;
  /** where the ant was when it moved on to the next point, from its origin */
  x: number;
  y: number;
  /** its farthest from the origin on this leg */
  far: number;
  /** the search's reach on this leg */
  reach: number;
}

/** Tick for `seconds`, recording each leg of the loops as the ant finishes it. */
function legs(g: Game, c: Colony, ox: number, oy: number, seconds: number): Leg[] {
  const out: Leg[] = [];
  let n = -1;
  let far = 0;
  let reach = 0;
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    g.tick(DT);
    assert.equal(c.layer[0], PLANE, "still searching");
    const x = (c.x[0] as number) - ox;
    const y = (c.y[0] as number) - oy;
    const m = c.searchLeg[0] as number;
    if (c.search[0] === 0) continue;
    if (m !== n) {
      if (n >= 0) out.push({ n, x, y, far, reach });
      n = m;
      far = 0;
      reach = c.search[0] as number;
    }
    far = Math.max(far, Math.hypot(x, y));
  }
  return out;
}

test("loops: each loop goes out and comes back through the spot where the vector ran out", () => {
  const g = game();
  const { c, ox, oy } = lost(g, 200);
  const ls = legs(g, c, ox, oy, 40);
  const back = ls.filter((l) => l.n % 3 === 2);
  assert.ok(back.length >= 3, `${back.length} loops done`);
  for (const l of back) assert.ok(Math.hypot(l.x, l.y) < 2.5, `loop ${(l.n - 2) / 3} ended ${Math.hypot(l.x, l.y).toFixed(2)} from its origin`);
  // And it went out between: the leg out reached the loop's reach.
  for (const l of ls.filter((l) => l.n % 3 === 0)) assert.ok(l.far > l.reach - 2.5, `loop ${l.n / 3} went out to ${l.far.toFixed(1)} of ${l.reach.toFixed(1)}`);
});

test("loops: each reaches further than the last, the first σ/2 out and σ/8 more a loop, σ from the trip walked", () => {
  // How far out each loop's leg out ended (its point, reached within LOOP_AT), and the farthest the loop went.
  const reaches = (odo: number): { out: number[]; far: number[] } => {
    const g = game();
    const { c, ox, oy } = lost(g, odo);
    const ls = legs(g, c, ox, oy, 60);
    const out = ls.filter((l) => l.n % 3 === 0).map((l) => Math.hypot(l.x, l.y));
    const far: number[] = [];
    for (const l of ls) far[Math.floor(l.n / 3)] = Math.max(far[Math.floor(l.n / 3)] ?? 0, l.far);
    return { out: out.slice(0, 4), far: far.slice(0, 4) };
  };
  const short = reaches(200);
  const long = reaches(400);
  const sigma = SIGMA_PER_CELL * 200;
  assert.ok(short.out.length >= 4 && long.out.length >= 3, `${short.out.length} and ${long.out.length} loops`);
  short.out.forEach((r, k) => {
    const want = sigma * (0.5 + k / 8);
    assert.ok(Math.abs(r - want) < 2, `200-cell trip, loop ${k}: out to ${r.toFixed(1)}, against ${want.toFixed(1)}`);
    assert.ok(short.far[k]! < want + 3, `loop ${k} stayed within its reach (${short.far[k]!.toFixed(1)})`);
  });
  for (let k = 1; k < short.out.length; k++) assert.ok(short.out[k]! > short.out[k - 1]!, `loop ${k} reaches further than loop ${k - 1}`);
  // Twice the trip, twice the reach.
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(long.out[k]! / short.out[k]! - 2) < 0.3, `loop ${k}: ${long.out[k]!.toFixed(1)} after 400 cells, ${short.out[k]!.toFixed(1)} after 200`);
});

test("loops: successive loops head the golden angle apart (each loop's way out, at its widest)", () => {
  const g = game();
  const { c, ox, oy } = lost(g, 200);
  const ls = legs(g, c, ox, oy, 40);
  // A loop's heading: the middle of its two far points (the ends of its legs out and across).
  const heads: number[] = [];
  for (const a of ls) {
    const b = ls.find((l) => l.n === a.n + 1);
    if (a.n % 3 === 0 && b) heads.push(Math.atan2(a.y + b.y, a.x + b.x));
  }
  assert.ok(heads.length >= 3, `${heads.length} loops`);
  for (let k = 1; k < heads.length; k++) {
    const turn = (((heads[k]! - heads[k - 1]!) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    assert.ok(Math.abs(turn - (c.params.searchTurn as number)) < 0.15, `loop ${k} turned ${((turn * 180) / Math.PI).toFixed(0)}° on from loop ${k - 1}`);
  }
});

test("loops off (searchLoops 0): U3b's spiral, each point a quarter turn on and SEARCH_GROW^(1/4) wider", () => {
  const g = game({ searchLoops: 0 });
  const { c } = lost(g, 200);
  const seen: { s: number; a: number }[] = [];
  for (let k = 0; k < Math.round(20 / DT); k++) {
    g.tick(DT);
    const s = c.search[0] as number;
    if (s !== 0 && (seen.length === 0 || seen[seen.length - 1]!.s !== s)) seen.push({ s, a: c.searchA[0] as number });
    assert.equal(c.searchLeg[0], 0, "no loops counted");
  }
  assert.ok(seen.length >= 4, `${seen.length} points`);
  assert.equal(seen[0]!.s, 3, "the first at SEARCH_START");
  for (let k = 1; k < seen.length; k++) {
    assert.ok(Math.abs(seen[k]!.s / seen[k - 1]!.s - Math.sqrt(Math.sqrt(1.6))) < 1e-5, `point ${k}: ${seen[k]!.s} after ${seen[k - 1]!.s}`);
    assert.ok(Math.abs(seen[k]!.a - seen[k - 1]!.a - Math.PI / 2) < 1e-5, `point ${k} a quarter turn on`);
  }
});
