import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, HOLE_SIGHT } from "../colony.ts";
import { Game } from "../game.ts";
import { CELL, cellOf, centreX, centreY, NE, nx, ny } from "../hex.ts";
import { generateSideWorld, generateWorld, groundTop, isSky, mulberry32, OPEN, rockAt, SOIL, updateSurface, type WorldMap } from "../world.ts";

// Nest slice 1 (docs/nest-and-home.md §3.1): in the side view an ant knows where home is only by its own drifting
// home vector, corrected by local cues (the hole in sight, a strong nest trail underground). Depth never drifts (gravity).

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

/** The walkway cell of column x: the open sky cell just above the ground. */
function walkway(map: WorldMap, x: number): number {
  for (let y = 0; y < map.size.h; y++) if (isSky(map, x, y) && rockAt(map, x, y) === OPEN) return y;
  return -1;
}

function onWalkway(c: Colony, x: number): void {
  const y = walkway(c.map, x);
  c.x[0] = centreX(x, y);
  c.y[0] = centreY(y);
}

test("the surface vector: its error grows with the way out, starts afresh coming up out of the hole, and is fixed on the way home", () => {
  const map = generateSideWorld(2, SMALL);
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(5), () => "explore");
  // Out of the hole onto the ground (a newborn is underground): the surface vector starts at zero, with this trip's drift.
  // In the hole first, then onto the walkway cell beside it: only its own hole starts the vector afresh (§40), so it
  // has to come up there, not be put down on the ground from the chamber.
  const ey = CELL[1] as number;
  c.x[0] = centreX(ex, ey);
  c.y[0] = centreY(ey);
  c.tick(1 / 30);
  c.x[0] = centreX(nx(ex, ey, NE), ny(ey, NE));
  c.y[0] = centreY(ny(ey, NE));
  c.heading[0] = 0;
  c.tick(1 / 30);
  assert.ok((c.odoSurf[0] as number) < 0.5, `fresh: ${c.odoSurf[0]}`);
  assert.notEqual(c.driftSurf[0], 0, "a drift drawn for the trip");
  // On along the ground, away from the hole (from its rim an explorer may turn back in).
  onWalkway(c, ex + 3);
  c.heading[0] = 0;
  for (let k = 0; k < 30 * 4; k++) c.tick(1 / 30);
  const out = c.odoSurf[0] as number;
  assert.ok(out > 10 && out <= c.params.speed * 4 + 1, `the way out counted: ${out.toFixed(1)}`);
  // Homing: the vector it walks home on is the one it brought out.
  c.mode[0] = 2;
  c.carrying[0] = 1;
  for (let k = 0; k < 30; k++) c.tick(1 / 30);
  assert.equal(c.odoSurf[0], out, "not counted on the way home");
});

test("a carrier whose vector is 12 cells off walks to where it believes the hole is, finds nothing, searches, and gets home", () => {
  const map = generateSideWorld(2, SMALL);
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  const ent = map.nest.entrance!;
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "return");
  onWalkway(c, ex + 40);
  c.tick(1 / 30); // up on the ground: the surface vector starts
  c.driftSurf[0] = 0.2;
  c.odoSurf[0] = 60; // believes the hole 12 east of it (beyond HOLE_SIGHT)
  c.carrying[0] = 1;
  c.mode[0] = 2;
  let nearBelief = Infinity;
  let searched = 0;
  let t = 0;
  for (; t < 30 * 60 && c.stored === 0; t++) {
    c.tick(1 / 30);
    if (c.search[0] === 0) nearBelief = Math.min(nearBelief, Math.abs((c.x[0] as number) - (ent.x + 12)));
    searched = Math.max(searched, Math.abs(c.search[0] as number));
  }
  assert.ok(12 > HOLE_SIGHT);
  assert.ok(nearBelief < 1.5, `it went where it believed the hole was (${nearBelief.toFixed(2)} off)`);
  assert.ok(searched > 0, "found nothing there, and searched");
  assert.equal(c.stored, 1, `then searched and got home (${(t / 30).toFixed(0)} s)`);
});

test("road signs: underground, a strong nest trail underfoot fades the in-nest memory's error; with none it stays", () => {
  const map = generateSideWorld(2, SMALL);
  const n = map.nest;
  const run = (scent: number) => {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(4), () => "return");
    // In the shaft, a little below the hole: underground, not in the chamber.
    const sx = n.entrance!.x;
    const sy = n.entrance!.y + 4;
    c.x[0] = sx;
    c.y[0] = sy;
    c.antCell(0);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) c.ph.depositCell("home", (CELL[0] as number) + dx, (CELL[1] as number) + dy, scent);
    c.odoNest[0] = 100;
    c.mode[0] = 2;
    for (let k = 0; k < 30 * 2; k++) {
      c.x[0] = sx; // held in place: only the correction is measured
      c.y[0] = sy;
      c.tick(1 / 30);
    }
    return c.odoNest[0] as number;
  };
  assert.ok(run(5) < 50, `strong trail: ${run(5).toFixed(1)}`);
  assert.ok(run(0) > 99, `no trail: ${run(0).toFixed(1)}`);
});

test("top-down maps keep no vector: homing there is exact, whatever the odometers say (colony.test.ts's homing tests, unchanged)", () => {
  // The odometers stay at zero there (path integration runs only in the side view)...
  const map = generateWorld(1);
  const c = new Colony(map, { antCount: 200 }, mulberry32(2));
  for (let k = 0; k < 30 * 20; k++) c.tick(1 / 30);
  for (let i = 0; i < c.n; i++) assert.equal(c.odoSurf[i]! + c.odoNest[i]!, 0);
  // ...and even set to a vector 60 cells off (as in the side view after a long trip), a carrier with a clear way home walks
  // straight there: the belief is the nest itself. (Before the review of #20 this test only checked the odometers, which
  // nothing on these maps writes.)
  // On the same map without soil: there, soil closes round the nest within 7–11 units in every direction.
  const open = generateWorld(1, { soil: 0 });
  const n = open.nest;
  const lone = new Colony(open, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "return");
  const d = 15;
  const a = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k * Math.PI) / 4).find((a) => {
    for (let s = 0; s <= d; s += 0.25) if (rockAt(open, ...cellAt(n.x + Math.cos(a) * s, n.y + Math.sin(a) * s)) !== OPEN) return false;
    return true;
  });
  assert.ok(a !== undefined, "a clear way to the nest");
  lone.x[0] = n.x + Math.cos(a) * d;
  lone.y[0] = n.y + Math.sin(a) * d;
  lone.heading[0] = a; // facing away
  lone.carrying[0] = 1;
  lone.mode[0] = 2;
  lone.odoSurf[0] = lone.odoNest[0] = 200;
  lone.driftSurf[0] = lone.driftNest[0] = 0.3;
  let t = 0;
  for (; t < 30 * 20 && lone.stored === 0; t++) lone.tick(1 / 30);
  assert.equal(lone.stored, 1, "home");
  assert.ok(t / 30 < (1.5 * d) / lone.params.speed + 1, `straight home: ${(t / 30).toFixed(1)} s for ${d} units at speed ${lone.params.speed}`);
});

/** The cell (x, y) world point (px, py) lies in. */
function cellAt(px: number, py: number): [number, number] {
  cellOf(px, py);
  return [CELL[0] as number, CELL[1] as number];
}

test("a homing ant whose vector is nearly right never searches: blocked anywhere but at its believed hole, it goes round (review of slice 1)", () => {
  // The first cut searched at any dead end on the ground: the offset grew a step per decision (3, −4.8, 7.7, … 50) and
  // sent ants 50–80 cells off. An ant whose vector is within 3 cells reaches its believed hole in sight of the real one.
  const g = new Game(generateSideWorld(5, { size: { w: 384, h: 200 }, nestCount: 1 }), { antCount: 300 }, mulberry32(5));
  const c = g.player;
  let samples = 0;
  let searching = 0;
  for (let t = 0; t < 30 * 60; t++) {
    g.tick(1 / 30);
    if (t % 30 === 0)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.mode[i] !== 2 || Math.abs(c.driftSurf[i]! * c.odoSurf[i]!) >= 3) continue;
        // On the ground line only, where its surface vector is what it homes by: underground it homes by its nest vector,
        // and a search there round a wrongly believed chamber is that vector's (a young porter, ja-xu6.1's runs).
        c.antCell(i);
        if (!isSky(g.map, CELL[0] as number, CELL[1] as number)) continue;
        samples++;
        if (c.search[i] !== 0) searching++;
      }
  }
  assert.ok(samples > 1000, `${samples} samples`);
  assert.equal(searching, 0, `${searching} of ${samples} were searching`);
});

/** A pillar of soil `high` rows tall standing on the ground in columns x0 .. x0 + wide − 1 (the walkway re-derived round it). */
function pillar(map: WorldMap, x0: number, wide: number, high: number): void {
  for (let x = x0; x < x0 + wide; x++) {
    const top = groundTop(map, x);
    for (let y = top - high; y < top; y++) {
      map.rock.set(x, y, SOIL);
      map.sky!.set(x, y, 0);
    }
  }
  for (let x = x0 - 3; x < x0 + wide + 3; x++) for (let y = groundTop(map, x0) - 3; y < groundTop(map, x0) + high + 3; y++) updateSurface(map, x, y);
  for (let x = x0 - 3; x < x0 + wide + 3; x++) for (let y = 0; y < map.size.h; y++) updateSurface(map, x, y);
}

/** Seconds (up to `limit`) a lone carrier on the walkway `from` columns east of its hole takes to get its food home, with a vector `err` cells off (east +), on map `map`; the farthest east it went, and the widest its search grew. */
function carrierHome(map: WorldMap, from: number, err: number, limit: number, setup: (c: Colony) => void = () => {}): { t: number; east: number; home: boolean; searched: number } {
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "return");
  onWalkway(c, ex + from);
  c.tick(1 / 30); // up on the ground: the surface vector starts
  c.driftSurf[0] = err / 100;
  c.odoSurf[0] = 100;
  c.carrying[0] = 1;
  c.mode[0] = 2;
  setup(c);
  const x0 = c.x[0] as number;
  let east = x0;
  let searched = 0;
  let t = 0;
  for (; t < 30 * limit && c.stored === 0; t++) {
    c.tick(1 / 30);
    east = Math.max(east, c.x[0] as number);
    searched = Math.max(searched, Math.abs(c.search[0] as number));
  }
  return { t: t / 30, east: east - x0, home: c.stored === 1, searched };
}

test("Bug2 on the ground tries the other side: blocked by a pillar with the way over it on the side opposite the first hand, a carrier gets home (review of #20)", () => {
  // The way west to the hole is over a pillar 20 rows tall: too far round to feel (GROUND_LOOK), so the ant keeps the hand
  // it had. One hand climbs it; the other walks east along the flat ground, away. That one turns back after GROUND_FLIP
  // cells; with equal legs it turned again exactly where it started, at the pillar's foot, and shuttled for good.
  const runs = [-1, 1].map((hand) => {
    const map = generateSideWorld(2, SMALL);
    cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
    pillar(map, (CELL[0] as number) + 30, 2, 20);
    return carrierHome(map, 40, 0, 90, (c) => (c.hand[0] = hand));
  });
  for (const r of runs) assert.ok(r.home, `home (${r.t.toFixed(0)} s; it went ${r.east.toFixed(0)} east of where it started)`);
  assert.ok(Math.max(...runs.map((r) => r.east)) > 10, `one hand went the other way first (${runs.map((r) => r.east.toFixed(0)).join(", ")} cells east)`);
});

test("a carrier whose vector is far off still gets home: 90 and 150 cells either way, and a believed hole past the map's edge (review of #20)", () => {
  // The search kept within 80 cells of the believed hole: 86 cells off and more, a carrier never found it, and with the
  // belief past the map's edge it waited at the edge for good.
  const map0 = generateSideWorld(2);
  cellOf(map0.nest.entrance!.x, map0.nest.entrance!.y);
  const ex = CELL[0] as number;
  for (const err of [90, 150, -90, -150]) {
    const r = carrierHome(generateSideWorld(2), err > 0 ? 10 : -10, err, 400);
    assert.ok(r.home, `${err} cells off: home in ${r.t.toFixed(0)} s`);
  }
  // Near each end of the ground, believing the hole lies 20–60 cells beyond it: it searches from the end it can reach (the
  // belief is clamped to the ground), rather than waiting at the edge with nowhere nearer to go.
  const w = map0.size.w;
  for (const [from, err] of [
    [w - 30 - ex, w + 20 - ex],
    [w - 6 - ex, w + 60 - ex],
    [8 - ex, -ex - 40],
  ] as const) {
    const r = carrierHome(generateSideWorld(2), from, err, 400);
    assert.ok(r.searched > 0, `from column ${ex + from}, believing the hole at ${(ex + err).toFixed(0)}: it searched from the edge`);
    assert.ok(r.home, `from column ${ex + from}, believing the hole at ${(ex + err).toFixed(0)}: home in ${r.t.toFixed(0)} s`);
  }
});

test("only its own hole resets the surface vector: up out of another, the error stands (review of #20)", () => {
  const map = generateSideWorld(2, { ...SMALL, nestCount: 2 });
  const [own, other] = map.nests;
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(5), () => "explore");
  const up = (n: typeof own) => {
    // In the hole's cell (underground), then a step up onto the walkway beside it.
    c.x[0] = n!.entrance!.x;
    c.y[0] = n!.entrance!.y;
    c.mode[0] = 0;
    c.tick(1 / 30);
    c.odoSurf[0] = 50;
    c.driftSurf[0] = 0.3;
    cellOf(n!.entrance!.x, n!.entrance!.y);
    const hx = CELL[0] as number;
    const hy = CELL[1] as number;
    for (let d = 0; d < 6; d++) {
      const ax = nx(hx, hy, d);
      const ay = ny(hy, d);
      if (isSky(map, ax, ay) && rockAt(map, ax, ay) === OPEN) {
        c.x[0] = centreX(ax, ay);
        c.y[0] = centreY(ay);
        break;
      }
    }
    c.tick(1 / 30);
  };
  up(other);
  assert.ok((c.odoSurf[0] as number) >= 50, `up out of the rival's hole: the vector runs on (${c.odoSurf[0]})`);
  up(own);
  assert.ok((c.odoSurf[0] as number) < 1, `up out of its own: afresh (${c.odoSurf[0]})`);
});
