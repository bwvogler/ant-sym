import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKFILL, Colony, stub } from "../colony.ts";
import { centreY, nx, ny } from "../hex.ts";
import { mulberry32, OPEN, rockAt, SOIL, worldFromArrays, type WorldMap } from "../world.ts";
import { nestAt, put } from "./hexmaps.ts";

// Leaf-cutter backfill (MR 12): unused space judged against the path, stale branches filled from the tip,
// fresh pellets drawing more. Hand-made maps, with scent laid by hand and held still (no evaporation or spread).

const W = 30;
const H = 12;

/** A tunnel along row 6 from the nest's chamber (west, x 2–4) to x = 20; `extra` cells opened too. */
function build(extra: [number, number][] = []): WorldMap {
  const rock = new Uint8Array(W * H).fill(SOIL);
  for (let x = 2; x <= 20; x++) rock[6 * W + x] = OPEN;
  for (let y = 5; y <= 7; y++) for (let x = 2; x <= 4; x++) rock[y * W + x] = OPEN;
  for (const [x, y] of extra) rock[y * W + x] = OPEN;
  return worldFromArrays({ w: W, h: H }, [nestAt(3, 6, 1.5)], { rock });
}

/** A one-ant colony whose scent stays where it is laid: `scent` per open cell (default `path` along row 6, 0 elsewhere). */
function carrierOn(map: WorldMap, scent: (x: number, y: number) => number, seed = 2): Colony {
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "return");
  c.ph.params.home = { evaporation: 0, diffusion: 0 };
  c.ph.params.food = { evaporation: 0, diffusion: 0 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rockAt(map, x, y) === OPEN) c.ph.fields.home.set(x, y, scent(x, y));
  start(c);
  return c;
}

/** Put the colony's ant at (16, 6) carrying a pellet home, well into its trip. */
function start(c: Colony): void {
  put(c, 0, 16, 6);
  c.heading[0] = Math.PI;
  c.mode[0] = 2;
  c.pellet[0] = 1;
  c.since[0] = 10;
}

function run(c: Colony, secs = 3): void {
  for (let t = 0; t < 30 * secs && c.pellet[0] === 1; t++) c.tick(1 / 30);
}

/** Whether open cells (ax, ay) and (bx, by) are joined through open ground. */
function joined(map: WorldMap, ax: number, ay: number, bx: number, by: number): boolean {
  const seen = new Set<number>([ay * W + ax]);
  const todo = [[ax, ay]];
  while (todo.length) {
    const [x, y] = todo.pop()!;
    if (x === bx && y === by) return true;
    for (let d = 0; d < 6; d++) {
      const tx = nx(x!, y!, d);
      const ty = ny(y!, d);
      if (rockAt(map, tx, ty) !== OPEN || seen.has(ty * W + tx)) continue;
      seen.add(ty * W + tx);
      todo.push([tx, ty]);
    }
  }
  return false;
}

const path = (_x: number, y: number) => (y === 6 ? 1 : 0);

test("unused is judged against the path: a side cell far fainter than the busy tunnel is filled, though its scent is well above FAINT; one nearly as busy is left", () => {
  const faint = build([[12, 5]]);
  const c = carrierOn(faint, (_x, y) => (y === 6 ? 1 : 0.3)); // 0.3: six times FAINT, under half the path's
  run(c);
  assert.equal(rockAt(faint, 12, 5), SOIL, "filled");
  assert.equal(c.soilFilled, 1);
  const busy = build([[12, 5]]);
  const k = carrierOn(busy, (_x, y) => (y === 6 ? 1 : 0.8));
  run(k);
  assert.equal(rockAt(busy, 12, 5), OPEN, "about as busy as the path: in use");
});

test("excess space: the edge of an unused gallery beside the tunnel is filled, and no fill ever cuts the way home", () => {
  // A gallery three rows deep (rows 5–7) along x 9–13, through which the tunnel runs.
  const extra: [number, number][] = [];
  for (let x = 9; x <= 13; x++) extra.push([x, 5], [x, 7]);
  const map = build(extra);
  for (let trip = 0; trip < 12; trip++) {
    const c = carrierOn(map, path, 3 + trip);
    run(c);
    assert.ok(joined(map, 16, 6, 3, 6), `trip ${trip}: the way home is open`);
  }
  let filled = 0;
  for (const [x, y] of extra) if (rockAt(map, x, y) === SOIL) filled++;
  assert.ok(filled >= 4, `${filled} of the gallery's 10 unused cells filled in 12 trips`);
  for (let x = 2; x <= 20; x++) assert.equal(rockAt(map, x, 6), OPEN, `the tunnel itself stays open at x ${x}`);
});

test("a cell whose open neighbours are two separate runs (a passage) is never fillable; one unbroken run is", () => {
  const map = build([[12, 5]]);
  assert.equal(stub(map, 12, 6, 5), false, "a cell of a one-wide tunnel: two runs");
  assert.equal(stub(map, 12, 5, 5), true, "a stub off it");
  assert.equal(stub(map, 20, 6, 5), true, "the tunnel's end");
});

test("a carrier detours into a stale branch and fills it back from the tip, trip by trip; a live (scented) branch is never entered", () => {
  const b1x = nx(12, 6, 5);
  const b1y = ny(6, 5);
  const b2x = nx(b1x, b1y, 5);
  const b2y = ny(b1y, 5);
  const saved = BACKFILL.enterStale;
  BACKFILL.enterStale = 1;
  try {
    const map = build([
      [b1x, b1y],
      [b2x, b2y],
    ]);
    assert.equal(stub(map, b1x, b1y, 5), false, "the branch's first cell can't be filled while the branch goes on");
    const c = carrierOn(map, path);
    run(c, 5);
    assert.equal(rockAt(map, b2x, b2y), SOIL, "first trip: the branch's tip");
    assert.equal(rockAt(map, b1x, b1y), OPEN);
    start(c);
    run(c, 5);
    assert.equal(rockAt(map, b1x, b1y), SOIL, "second trip: the cell before it, back to the tunnel");
    assert.equal(c.soilFilled, 2);
    // A branch with scent in it (an ant digging there laid it on the way in) is in use.
    const live = build([
      [b1x, b1y],
      [b2x, b2y],
    ]);
    const k = carrierOn(live, (_x, y) => (y === 6 ? 1 : 0.9));
    let entered = false;
    for (let t = 0; t < 30 * 5 && k.pellet[0] === 1; t++) {
      k.tick(1 / 30);
      if (k.y[0]! < centreY(6) - 0.6) entered = true;
    }
    assert.equal(rockAt(live, b2x, b2y), OPEN, "live branch: not filled");
    assert.ok(!entered, "and not entered");
  } finally {
    BACKFILL.enterStale = saved;
  }
});

test("fresh pellets draw more: a side cell too busy to fill on its own is filled next to a pellet put down moments ago", () => {
  const plain = build([[12, 5]]);
  const c = carrierOn(plain, (_x, y) => (y === 6 ? 1 : 0.7)); // above half the path's: not stale by itself
  run(c);
  assert.equal(rockAt(plain, 12, 5), OPEN, "no fresh pellet near: left");
  const fresh = build([[12, 5]]);
  const k = carrierOn(fresh, (_x, y) => (y === 6 ? 1 : 0.7));
  fresh.filledAt.set(13, 4, 0); // a neighbour of (12, 5) filled just now (it is soil: a pellet in place)
  run(k);
  assert.equal(rockAt(fresh, 12, 5), SOIL, "beside a fresh pellet: filled");
});

test("wall-following through ground being filled: a target cell filled meanwhile, one no longer beside the ant, or a step grazing a solid cell never pins it", () => {
  // Filled target: a homing ant following the tunnel wall by cell, steering for the stub at (12, 5), which is filled.
  {
    const map = build([[12, 5]]);
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(5), () => "return");
    put(c, 0, 12, 6);
    c.mode[0] = 2;
    c.tick(1 / 30);
    put(c, 0, 12, 6);
    c.wall[0] = 1;
    c.byCell[0] = 1;
    c.gx[0] = 12;
    c.gy[0] = 5;
    c.gdir[0] = 5;
    c.heading[0] = -1;
    map.rock.set(12, 5, SOIL);
    const x0 = c.x[0]!;
    for (let k = 0; k < 30 * 5; k++) c.tick(1 / 30);
    assert.ok(Math.abs(c.x[0]! - x0) > 2, `filled target: moved ${Math.abs(c.x[0]! - x0).toFixed(2)} along the tunnel in 5 s`);
  }
  // By touch into a tunnel: a homing ant that met rock in the open and followed it by touch, now in a one-cell tunnel, follows by cell.
  {
    const map = build();
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(6), () => "return");
    put(c, 0, 12, 6);
    c.mode[0] = 2;
    c.tick(1 / 30);
    put(c, 0, 12, 6);
    c.wall[0] = 1;
    c.byCell[0] = 0;
    c.followT[0] = 1;
    c.tick(1 / 30);
    assert.equal(c.byCell[0], 1, "by cell in a tunnel");
  }
  // Grazing: on the edge of its cell, the straight way to the next cell crossing a corner of the solid cell beside it.
  {
    // Rows 5 (odd) and 6: (13, 5) open with (12, 5) soil to its west; (13, 6) below-left open. (13, 6) is (13, 5)'s south-west neighbour.
    const map = build([[13, 5]]);
    assert.equal(nx(13, 5, 2), 13);
    assert.equal(ny(5, 2), 6);
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(7), () => "return");
    put(c, 0, 13, 5);
    c.mode[0] = 2;
    c.tick(1 / 30);
    c.x[0] = 13; // the west edge of (13, 5), whose centre is at x 13.5 (odd rows sit half a cell right)
    c.y[0] = centreY(5) - 0.1;
    c.wall[0] = 1;
    c.byCell[0] = 1;
    c.followT[0] = 1;
    c.gx[0] = 13;
    c.gy[0] = 6;
    c.gdir[0] = 2;
    let left = false;
    for (let k = 0; k < 30 * 3 && !left; k++) {
      c.tick(1 / 30);
      left = c.y[0]! > centreY(5) + 0.45;
    }
    assert.ok(left, "it got off the edge and on to the next cell");
  }
});
