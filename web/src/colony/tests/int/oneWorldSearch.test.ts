import { test } from "node:test";
import assert from "node:assert/strict";
import { HOLE_SIGHT, LIFESPAN, MODES, PI_DRIFT, PLANE, planeMoundReach, type Colony, type HoleCell } from "../../colony.ts";
import { Game, gameRng } from "../../game.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { encode } from "../../save.ts";
import { heapPlane, mulberry32 } from "../../world.ts";
import { DT } from "../builders.ts";

// One world's nest search (ja-lp4.11, docs/nest-search.md, PRD §56): a carrier whose vector ran out where no hole was
// runs loops out from that spot and back, each headed searchTurn on from the last and reaching further, the first
// searchLoops σ out (σ from its own trip). A rock-free small plane (160 × 100, seed 7) keeps the geometry clean: the
// player's hole at cell (48, 32), the carrier's vector ending 60 east of it, out of reach of the loops these tests watch.

const RETURN = MODES.indexOf("return");
const SIGMA_PER_CELL = PI_DRIFT / Math.SQRT2;

/** The loops as designed (PRD §56), whatever the defaults. */
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

// The mound's smell (ja-lp4.11.3): a searching ant on its own mound walks up its colony's smell to its hole.

const SMELL: Partial<Colony["params"]> = { ...LOOPS, moundSmell: 1 };

/** Heap `pellets` round colony k's hole as the game spreads them (2 + reach × √u out), and set its count; that hole. */
function mound(g: Game, k: number, pellets: number, heap = true): { x: number; y: number } {
  const c = g.colonies[k]!;
  const hc = c.holeCells[k] as HoleCell;
  const hx = centreX(hc.px, hc.py);
  const hy = centreY(hc.py);
  const holes = c.holeCells.map((h) => ({ x: h.px, y: h.py }));
  const rng = mulberry32(99);
  for (let p = 0; heap && p < pellets; p++) {
    const a = rng() * 2 * Math.PI;
    const r = 2 + planeMoundReach(p) * Math.sqrt(rng());
    cellOf(hx + r * Math.cos(a), hy + r * Math.sin(a));
    heapPlane(g.world!.plane, CELL[0] as number, CELL[1] as number, holes);
  }
  c.loadState({ fields: {}, private: { heaped: encode(pellets) } });
  return { x: hx, y: hy };
}

/** A spot `r` from (x, y), on spoil (or on bare ground, `bare`), toward `toward` radians or as near it as there is one. */
function spot(g: Game, x: number, y: number, r: number, toward: number, bare = false): { x: number; y: number } {
  for (let k = 0; k < 64; k++) {
    const a = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 32);
    const p = { x: x + r * Math.cos(a), y: y + r * Math.sin(a) };
    cellOf(p.x, p.y);
    if ((g.world!.plane.spoil!.get(CELL[0] as number, CELL[1] as number) > 0) !== bare) return p;
  }
  throw new Error("no such spot");
}

/** Ant 0 of colony k (the player's by default) at (x, y), carrying, its vector ending 60 east of its hole (walked 200), facing east; searching there (its first loop's leg out) if `searching`. */
function smeller(g: Game, x: number, y: number, searching: boolean, k = 0): Colony {
  const c = g.colonies[k]!;
  c.age[0] = 0.5 * LIFESPAN;
  c.putAnt(0, PLANE, x, y);
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  c.heading[0] = 0;
  c.odoSurf[0] = 200;
  c.driftSurf[0] = 0.3;
  c.driftSurfY[0] = 0;
  if (searching) {
    c.search[0] = 7;
    c.searchA[0] = 0;
    c.searchLeg[0] = 0;
  }
  return c;
}

/** Tick until ant 0 of c goes down (at most `seconds`); the seconds it took (NaN: it didn't) and its nearest to (x, y) on the plane. */
function watch(g: Game, c: Colony, seconds: number, x: number, y: number): { t: number; nearest: number } {
  let nearest = Infinity;
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    g.tick(DT);
    if (c.layer[0] !== PLANE) return { t: (k + 1) * DT, nearest };
    nearest = Math.min(nearest, Math.hypot((c.x[0] as number) - x, (c.y[0] as number) - y));
  }
  return { t: NaN, nearest };
}

test("smell: a searcher on its own mound, out of sight of its hole, walks up the smell to it and goes down", () => {
  const g = game(SMELL);
  const H = mound(g, 0, 1000);
  // 12 from the hole (sight is 6), on spoil; its loop's point lies east, 60 and more away.
  const P = spot(g, H.x, H.y, 12, 0);
  const c = smeller(g, P.x, P.y, true);
  const { t } = watch(g, c, 6, H.x, H.y);
  assert.ok(t > 0 && t < 4, `down its hole in ${t.toFixed(2)} s (12 cells at 7 a second)`);
  assert.equal(c.carriedDown, 1);
  assert.equal(c.x[0], centreX(c.holeCells[0]!.col, c.holeCells[0]!.row), "its own hole");
});

test("smell: the same carrier not yet searching (homing on its full vector) crosses its mound and is not pulled in", () => {
  const g = game(SMELL);
  const H = mound(g, 0, 1000);
  const P = spot(g, H.x, H.y, 12, 0);
  const c = smeller(g, P.x, P.y, false);
  watch(g, c, 3, H.x, H.y);
  assert.equal(c.layer[0], PLANE, "still out");
  assert.ok(Math.hypot((c.x[0] as number) - H.x, (c.y[0] as number) - H.y) > 20, `it kept on toward its vector's end (now ${Math.hypot((c.x[0] as number) - H.x, (c.y[0] as number) - H.y).toFixed(1)} from the hole)`);
});

test("smell: a searcher within its mound's reach but on bare ground is not pulled (it feels no spoil underfoot)", () => {
  const g = game(SMELL);
  // The count says the mound reaches 16, but no pellet lies on the ground.
  const H = mound(g, 0, 1000, false);
  const P = spot(g, H.x, H.y, 12, 0, true);
  const c = smeller(g, P.x, P.y, true);
  watch(g, c, 3, H.x, H.y);
  assert.equal(c.layer[0], PLANE, "still out");
  assert.ok(Math.hypot((c.x[0] as number) - H.x, (c.y[0] as number) - H.y) > 14, "it went on with its loop");
});

test("smell: a searcher on the rival's mound is not pulled, to the rival's hole or its own", () => {
  const g = game(SMELL);
  // The rival's ant on the player's mound (seed 7's player's hole is mid-plane; the rival's ~115 east, in a corner), its
  // own mound as big: 12 from the player's hole on the side away from its own, on spoil, its loops starting where it stands.
  const V = mound(g, 0, 1000);
  mound(g, 1, 1000);
  const c = g.colonies[1]!;
  const hc = c.holeCells[1]!;
  const own = { x: centreX(hc.px, hc.py), y: centreY(hc.py) };
  const P = spot(g, V.x, V.y, 12, Math.atan2(V.y - own.y, V.x - own.x));
  smeller(g, P.x, P.y, false, 1);
  c.odoSurf[0] = 100;
  c.driftSurf[0] = (P.x - own.x) / 100;
  c.driftSurfY[0] = (P.y - own.y) / 100;
  const { t, nearest } = watch(g, c, 10, V.x, V.y);
  assert.ok(Number.isNaN(t), "it went down no hole");
  assert.ok(nearest > HOLE_SIGHT, `never nearer the player's hole than ${nearest.toFixed(1)}`);
  assert.ok(Math.hypot((c.x[0] as number) - P.x, (c.y[0] as number) - P.y) < 10, "it searched round where its vector ran out");
  assert.ok((c.search[0] as number) > 0, "searching");
});

test("loops: the first loop heads the way the ant faces when its vector runs out", () => {
  for (const face of [Math.PI / 2, -2]) {
    const g = game();
    const { c, ox, oy } = lost(g, 200);
    c.heading[0] = face;
    const ls = legs(g, c, ox, oy, 20);
    const a = ls.find((l) => l.n === 0);
    const b = ls.find((l) => l.n === 1);
    assert.ok(a && b, "the first loop's legs out and across");
    const head = Math.atan2(a.y + b.y, a.x + b.x);
    const off = Math.abs(Math.atan2(Math.sin(head - face), Math.cos(head - face)));
    assert.ok(off < 0.25, `facing ${face.toFixed(2)}, the first loop headed ${head.toFixed(2)}`);
  }
});

test("loops: a point counts as reached within LOOP_AT (2 cells), not only within 1", () => {
  const g = game();
  const { c, ox, oy } = lost(g, 200);
  // On the way back of loop 1 (leg 5: its point is the origin), 1.5 cells east of the origin, facing away.
  c.putAnt(0, PLANE, ox + 1.5, oy);
  c.search[0] = 10;
  c.searchA[0] = 0;
  c.searchLeg[0] = 5;
  c.heading[0] = 0;
  g.tick(DT);
  assert.equal(c.searchLeg[0], 6, "1.5 cells from its point, it moves on to the next loop");
});

test("loops: a stall skips to the next point (searchStall 1), or starts the next loop (searchStall 0)", () => {
  for (const [stall, want] of [[1, 5], [0, 6]] as const) {
    const g = game({ ...LOOPS, searchStall: stall });
    const { c, ox, oy } = lost(g, 200);
    // Partway out on loop 1 (leg 4, its leg across), far from its point and no nearer it for longer than SEARCH_STALL.
    c.putAnt(0, PLANE, ox - 5, oy);
    c.search[0] = 10;
    c.searchA[0] = 0;
    c.searchLeg[0] = 4;
    c.heading[0] = Math.PI;
    c.bestD[0] = 0;
    c.stallT[0] = 4; // past SEARCH_STALL (3 s), short of the tunnel walker's reset (TUNNEL_STALL + BY_VECTOR)
    g.tick(DT);
    assert.equal(c.searchLeg[0], want, `searchStall ${stall}: stalled on leg 4, it went to leg ${c.searchLeg[0]}`);
  }
});
