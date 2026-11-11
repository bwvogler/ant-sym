import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, MODES, PLANE, type Colony, type Corpse } from "../../colony.ts";
import { localResponses, type Responses } from "../../responses.ts";
import { Game, gameRng } from "../../game.ts";
import { CELL, cellOf, centreX, centreY, discOffsets, hexDistance } from "../../hex.ts";
import { heapPlane, OPEN, rockAt } from "../../world.ts";
import { DT, ageOf, curtainHole, editPrivate, own, planeHole, smallOne } from "../builders.ts";

// One world U3c (ja-lp4.3.3): targeted guards for the plane's mound and midden gates that only the one-world golden held
// (review of #61, S1 and N1, N3, N5). Each fails with the gate it names removed. The small seed-7 plane of
// oneWorldMound.test.ts: the player's hole is at plane cell (48, 32).

const RETURN = MODES.indexOf("return");
const EXPLORE = MODES.indexOf("explore");
/** colony.ts's #soil codes (private): a dug pellet, and a loose one taken down to backfill. */
const SOIL_DUG = 0;
const SOIL_FILL = 2;

/** A game of few ants, every founder young (they stay in) but those a test moves. */
function quiet(seed = 7, ants = 10): Game {
  const g = new Game(smallOne(seed), { antCount: ants, rivalAnts: 10, regrow: 0 }, gameRng(seed));
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) if (c.alive[i]) c.age[i] = ageOf(0);
  return g;
}
const holesOf = (c: Colony) => c.holeCells.map((h) => ({ x: h.px, y: h.py }));
const cellOfAnt = (c: Colony, i: number): [number, number] => {
  cellOf(c.x[i] as number, c.y[i] as number);
  return [CELL[0] as number, CELL[1] as number];
};
/** Ant i of c, on the plane at (x, y), carrying a pellet of soil kind `soil`. */
function withPellet(c: Colony, i: number, x: number, y: number, soil: number): void {
  c.age[i] = ageOf(1);
  c.putAnt(i, PLANE, x, y);
  c.pellet[i] = 1;
  c.mode[i] = RETURN;
  editPrivate(c, ["soil"], (r) => ((r.soil as Uint8Array)[i] = soil));
}

/** Ant `dead` of c killed just below the top of its shaft, and ant u, middle-aged, put there until it has taken the corpse up. */
function undertaken(g: Game, c: Colony, dead: number, u: number): void {
  const at = curtainHole(own(c));
  c.putAnt(dead, CURTAIN, at.x, at.y + 1);
  c.kill(dead, false);
  c.age[u] = ageOf(1);
  for (let k = 0; k < Math.round(30 / DT) && !c.carriesCorpse(u); k++) {
    c.putAnt(u, CURTAIN, at.x, at.y + 1);
    c.mode[u] = EXPLORE;
    g.tick(DT);
  }
  assert.ok(c.carriesCorpse(u), `undertaker ${u} took the corpse up`);
}

test("one world: nobody picks spoil off the mound within ENTRANCE_ZONE of a hole (#pickPlane)", () => {
  // A mound of 400 pellets round the player's hole; 16 old explorers put on its spoil within the zone every half second.
  const g = quiet(7, 20);
  const c = g.player;
  const plane = g.world!.plane;
  const h = own(c);
  for (let k = 0; k < 400; k++) heapPlane(plane, h.px, h.py, holesOf(c));
  // Within ENTRANCE_ZONE (4) of a hole.
  const nearHole = (x: number, y: number) => c.holeCells.some((o) => Math.hypot(centreX(x, y) - centreX(o.px, o.py), centreY(y) - centreY(o.py)) < 4);
  const zone: [number, number][] = [];
  const o = discOffsets(3)[h.py & 1] as Int16Array;
  for (let k = 0; k < o.length; k += 2) {
    const x = h.px + (o[k] as number);
    const y = h.py + (o[k + 1] as number);
    if (plane.spoil!.get(x, y) > 0 && nearHole(x, y)) zone.push([x, y]);
  }
  assert.ok(zone.length >= 6, `${zone.length} spoil cells in the zone`);
  let inZone = 0;
  let entered = 0;
  const was = new Uint8Array(16);
  for (let k = 0; k < Math.round(120 / DT); k++) {
    if (k % 15 === 0)
      for (let i = 0; i < 16; i++) {
        if (c.pellet[i]) continue;
        const [x, y] = zone[(k / 15 + i) % zone.length]!;
        c.age[i] = ageOf(2);
        c.putAnt(i, PLANE, centreX(x, y), centreY(y));
        c.mode[i] = EXPLORE;
      }
    for (let i = 0; i < 16; i++) was[i] = c.pellet[i] as number;
    g.tick(DT);
    for (let i = 0; i < 16; i++) {
      if (c.layer[i] !== PLANE) continue;
      const [x, y] = cellOfAnt(c, i);
      if (!nearHole(x, y) || plane.spoil!.get(x, y) === 0) continue;
      entered++;
      if (!was[i] && c.pellet[i]) inZone++;
    }
  }
  assert.ok(entered > 10000, `explorers stood on spoil in the zone (${entered} ant-ticks)`);
  assert.equal(inZone, 0, `picked ${inZone} within the zone`);
});

test("one world: a loose pellet taken home to backfill homes on the plane by the ant's own vector, not to the true hole", () => {
  // 15 east of its hole, its vector off by 30 east (odoSurf 30 × drift 1): it believes its hole lies 15 farther east.
  const g = quiet();
  const c = g.player;
  const hole = planeHole(own(c));
  const i = 0;
  withPellet(c, i, hole.x + 15, hole.y, SOIL_FILL);
  c.odoSurf[i] = 30;
  c.driftSurf[i] = 1;
  c.driftSurfY[i] = 0;
  c.heading[i] = Math.PI / 2;
  const believed = { x: hole.x + 30, y: hole.y };
  const d0 = Math.hypot((c.x[i] as number) - believed.x, (c.y[i] as number) - believed.y);
  for (let k = 0; k < Math.round(2 / DT); k++) {
    g.tick(DT);
    assert.equal(c.pellet[i], 1, "it keeps its pellet");
    assert.equal(c.layer[i], PLANE);
  }
  const d1 = Math.hypot((c.x[i] as number) - believed.x, (c.y[i] as number) - believed.y);
  const fromHole = Math.hypot((c.x[i] as number) - hole.x, (c.y[i] as number) - hole.y);
  assert.ok(d1 < d0 - 4, `toward where it believes its hole is (${d0.toFixed(1)} → ${d1.toFixed(1)})`);
  assert.ok(fromHole > 19, `away from the true hole (${fromHole.toFixed(1)} from it)`);
});

test("one world: a loose pellet taken down to backfill that comes back up the hole is spoil (looseBack), heaped on the plane, not taken back down", () => {
  const g = quiet();
  const c = g.player;
  const plane = g.world!.plane;
  const at = curtainHole(own(c));
  const i = 0;
  c.age[i] = ageOf(1);
  const back = c.looseBack;
  const dropped = c.looseDropped;
  const up = c.crossedUp;
  // At the top of its shaft with it, facing up: put back there every half second while it is still in the curtain.
  for (let k = 0; k < Math.round(5 / DT) && c.layer[i] === CURTAIN; k++) {
    if (k % 15 === 0) {
      c.putAnt(i, CURTAIN, at.x, at.y);
      c.pellet[i] = 1;
      c.mode[i] = RETURN;
      c.heading[i] = -Math.PI / 2;
      editPrivate(c, ["soil"], (r) => ((r.soil as Uint8Array)[i] = SOIL_FILL));
    }
    g.tick(DT);
  }
  assert.equal(c.layer[i], PLANE, "it came up");
  assert.equal(c.crossedUp, up + 1, "up its hole");
  assert.equal(c.pellet[i], 1, "with its pellet");
  assert.equal(c.looseBack, back + 1, "counted back (looseBack)");
  assert.deepEqual(c.carriedPellets(), { dug: 0, loose: 1 });
  const mound = plane.moundCells ?? 0;
  const down = c.crossedDown;
  for (let k = 0; k < Math.round(20 / DT) && c.pellet[i]; k++) {
    g.tick(DT);
    assert.equal(c.layer[i], PLANE, "it never went back down with it");
  }
  assert.equal(c.pellet[i], 0, "put down within 20 s");
  assert.equal(c.crossedDown, down);
  assert.equal(c.looseDropped, dropped + 1, "dropped back on the mound");
  assert.equal(plane.moundCells, mound + 1, "heaped on the plane");
  const [ax, ay] = cellOfAnt(c, i);
  assert.ok(hexDistance(ax, ay, own(c).px, own(c).py) >= 2, "carried out from the hole");
});

test("one world: a corpse carrier killed on the plane leaves the corpse on the plane (layer PLANE, held by nobody), where no undertaker in the curtain takes it", () => {
  const g = quiet();
  const c = g.player;
  const at = curtainHole(own(c));
  const undertake = (dead: number, u: number) => undertaken(g, c, dead, u);
  const carriedBy = (u: number) => c.corpses.find((k) => k.held === u)!;
  // Carried up its hole: the corpse is on the plane with its undertaker (#middenSmell); killed there, it lies there (#die).
  undertake(5, 4);
  for (let k = 0; k < Math.round(10 / DT) && c.layer[4] !== PLANE; k++) g.tick(DT);
  assert.equal(c.layer[4], PLANE, "the undertaker came up with it");
  const a = carriedBy(4);
  assert.equal(a.layer, PLANE, "carried on the plane, the corpse is on the plane");
  g.tick(DT);
  const [ax, ay] = cellOfAnt(c, 4);
  c.kill(4);
  assert.equal(a.held, -1, "held by nobody");
  assert.equal(a.layer, PLANE, "it lies on the plane");
  assert.deepEqual([a.x, a.y], [ax, ay], "where its carrier fell");
  assert.ok(c.corpses.includes(a), "not on the midden: it lies there and rots");
  // Moved onto the plane and killed at once, before a tick (#middenSmell) could move its corpse: #die puts it there, at
  // the plane cell with the same coordinates as the curtain cell where the dead fall.
  undertake(7, 6);
  cellOf(at.x, at.y + 1);
  const [bx, by] = [CELL[0] as number, CELL[1] as number];
  const b = carriedBy(6);
  assert.equal(b.layer, CURTAIN, "picked up in the curtain");
  c.putAnt(6, PLANE, centreX(bx, by), centreY(by));
  c.kill(6);
  assert.equal(b.held, -1);
  assert.equal(b.layer, PLANE, "killed on the plane, its corpse is on the plane");
  assert.deepEqual([b.x, b.y], [bx, by]);
  // A middle-aged explorer in the curtain on that cell for 10 s: the plane's corpse is not its to take (#undertake).
  c.age[8] = ageOf(1);
  for (let k = 0; k < Math.round(10 / DT); k++) {
    if (k % 15 === 0) {
      c.putAnt(8, CURTAIN, at.x, at.y + 1);
      c.mode[8] = EXPLORE;
    }
    g.tick(DT);
    assert.equal(b.held, -1, "no undertaker in the curtain took it");
  }
  assert.equal(b.layer, PLANE);
  assert.ok(!c.carriesCorpse(8));
});

test("one world: a spoil or corpse carrier on the plane that never gets far enough puts its load down where it stands after its give-up time", () => {
  // Both set a walk out no plane allows (spoilTo 10⁶): the spoil carrier gives up after SPOIL_GIVE_UP (15 s), the
  // undertaker after CORPSE_GIVE_UP (60 s), and each puts its load down where it stands (the corpse on the midden there).
  const g = quiet();
  const c = g.player;
  const hole = planeHole(own(c));
  undertaken(g, c, 5, 4);
  for (let k = 0; k < Math.round(10 / DT) && c.layer[4] !== PLANE; k++) g.tick(DT);
  assert.equal(c.layer[4], PLANE, "the undertaker came up with it");
  withPellet(c, 0, hole.x + 3, hole.y, SOIL_DUG);
  c.heading[0] = 0;
  g.tick(DT);
  const unreachable = (r: Record<string, unknown>) => {
    (r.spoilTo as Float32Array)[0] = 1e6;
    (r.spoilTo as Float32Array)[4] = 1e6;
  };
  editPrivate(c, ["spoilTo"], unreachable);
  const out = c.soilOut;
  const buried = c.buried;
  let spoilAt = NaN;
  let corpseAt = NaN;
  for (let k = 1; k <= Math.round(65 / DT) && (Number.isNaN(spoilAt) || Number.isNaN(corpseAt)); k++) {
    g.tick(DT);
    if (Number.isNaN(spoilAt) && !c.pellet[0]) spoilAt = k * DT;
    if (Number.isNaN(corpseAt) && !c.pellet[4]) corpseAt = k * DT;
    // Until each has put its load down (after that the spoil carrier goes home, and may come up with a new pellet).
    if (Number.isNaN(spoilAt)) assert.equal(c.layer[0], PLANE, "ant 0 is still out with it");
    if (Number.isNaN(corpseAt)) assert.equal(c.layer[4], PLANE, "ant 4 is still out with it");
  }
  assert.ok(spoilAt > 14 && spoilAt < 16, `the spoil put down at ${spoilAt.toFixed(1)} s`);
  assert.equal(c.soilOut, out + 1, "heaped on the plane");
  assert.ok(corpseAt > 58 && corpseAt < 61, `the corpse put down at ${corpseAt.toFixed(1)} s`);
  assert.equal(c.buried, buried + 1, "on the midden where it stood");
});

test("one world: an explorer spreads spoil only from a flank; off a flat mound top it only takes pellets home to backfill (#pickPlane)", () => {
  // A plateau of spoil three levels high, radius PLATEAU cells, out on open ground far from every hole, kept flat every
  // tick; 16 old explorers put within two cells of its middle every half second walk at most a few cells before that.
  const PLATEAU = 10;
  const g = quiet(7, 20);
  const c = g.player;
  const plane = g.world!.plane;
  const h = own(c);
  const disc = (x: number, y: number, r: number): [number, number][] => {
    const o = discOffsets(r)[y & 1] as Int16Array;
    const out: [number, number][] = [];
    for (let k = 0; k < o.length; k += 2) out.push([x + (o[k] as number), y + (o[k + 1] as number)]);
    return out;
  };
  let mid: [number, number] | null = null;
  for (let d = 2 * PLATEAU; d < 60 && !mid; d++)
    for (const [x, y] of disc(h.px, h.py, d)) {
      if (hexDistance(x, y, h.px, h.py) !== d || holesOf(c).some((o) => hexDistance(x, y, o.x, o.y) < 2 * PLATEAU)) continue;
      if (disc(x, y, PLATEAU + 1).every(([tx, ty]) => tx >= 0 && ty >= 0 && tx < plane.size.w && ty < plane.size.h && rockAt(plane, tx, ty) === OPEN)) {
        mid = [x, y];
        break;
      }
    }
  assert.ok(mid, "open ground for the plateau");
  const top = disc(mid[0], mid[1], PLATEAU);
  const flatten = (): void => {
    for (const [x, y] of top) {
      plane.moundCells = (plane.moundCells ?? 0) + 3 - plane.spoil!.get(x, y);
      plane.spoil!.set(x, y, 3);
    }
  };
  const start = disc(mid[0], mid[1], 2);
  const picked = c.loosePicked;
  const down = c.looseDown;
  let onTop = 0;
  for (let k = 0; k < Math.round(120 / DT); k++) {
    if (k % 15 === 0)
      for (let i = 0; i < 16; i++) {
        if (c.pellet[i]) continue;
        const [x, y] = start[(k / 15 + i) % start.length]!;
        c.age[i] = ageOf(2);
        c.putAnt(i, PLANE, centreX(x, y), centreY(y));
        c.mode[i] = EXPLORE;
      }
    flatten();
    g.tick(DT);
    for (let i = 0; i < 16; i++) {
      if (c.layer[i] !== PLANE) continue;
      const [x, y] = cellOfAnt(c, i);
      if (hexDistance(x, y, mid[0], mid[1]) < PLATEAU) onTop++;
    }
  }
  const fills = c.looseDown - down;
  const spreads = c.loosePicked - picked - fills;
  assert.ok(onTop > 30000, `explorers walked the plateau (${onTop} ant-ticks)`);
  assert.ok(fills >= 3, `${fills} pellets taken off it to backfill: they were asking`);
  assert.equal(spreads, 0, `${spreads} picked up to spread off a flat top`);
});

test("one world: a corpse the ant puts down at will (carry 'put down') goes on the midden only out on its ring; near its hole it lies there", () => {
  // Owner (2026-11-09, review of #61 D1): Jev's "put down" or "drop and run" for an undertaker on the plane makes a
  // midden only where its walk out would have (at least MIDDEN_MIN from home by its own vector, off the mound); anywhere
  // else the corpse lies on the plane, unmarked, as one whose carrier died there.
  const g = quiet();
  const c = g.player;
  const hole = planeHole(own(c));
  const putDown: Responses = { ...localResponses, carry: () => "put down" };
  const upWith = (dead: number, u: number): Corpse => {
    undertaken(g, c, dead, u);
    for (let k = 0; k < Math.round(10 / DT) && c.layer[u] !== PLANE; k++) g.tick(DT);
    assert.equal(c.layer[u], PLANE, `undertaker ${u} came up with it`);
    return c.corpses.find((k) => k.held === u)!;
  };
  // At its hole: it lies there.
  const a = upWith(5, 4);
  const [ax, ay] = cellOfAnt(c, 4);
  const middens = c.midden.size;
  const buried = c.buried;
  c.responses = putDown;
  g.tick(DT);
  c.responses = localResponses;
  assert.ok(!c.carriesCorpse(4), "put down");
  assert.equal(a.held, -1);
  assert.equal(a.layer, PLANE);
  assert.ok(Math.abs(a.x - ax) <= 1 && Math.abs(a.y - ay) <= 1, "where it stood");
  assert.ok(c.corpses.includes(a), "it lies there");
  assert.equal(c.midden.size, middens, "no midden at its hole");
  assert.equal(c.buried, buried);
  // Out on its ring (12 east of the hole, off the mound): on the midden.
  const b = upWith(7, 6);
  c.putAnt(6, PLANE, hole.x + 12, hole.y);
  const [bx, by] = cellOfAnt(c, 6);
  assert.equal(g.world!.plane.spoil!.get(bx, by), 0, "off the mound");
  c.responses = putDown;
  g.tick(DT);
  c.responses = localResponses;
  assert.ok(!c.carriesCorpse(6), "put down");
  assert.ok(!c.corpses.includes(b), "off the ground");
  assert.equal(c.buried, buried + 1, "on the midden");
  assert.equal(c.midden.size, middens + 1);
  // Far enough out by its vector but on the mound (spoil underfoot): it lies there.
  const d = upWith(3, 2);
  c.putAnt(2, PLANE, hole.x, hole.y + 12);
  const [dx, dy] = cellOfAnt(c, 2);
  heapPlane(g.world!.plane, dx, dy, holesOf(c));
  assert.ok(g.world!.plane.spoil!.get(dx, dy) > 0, "on the mound");
  c.responses = putDown;
  g.tick(DT);
  c.responses = localResponses;
  assert.ok(!c.carriesCorpse(2), "put down");
  assert.ok(c.corpses.includes(d), "it lies there");
  assert.equal(c.buried, buried + 1, "not on the midden");
  assert.equal(c.midden.size, middens + 1);
});
