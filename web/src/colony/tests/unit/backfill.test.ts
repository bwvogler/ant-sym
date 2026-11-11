import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseDig, Colony, DIG_FACE, GLANCE, refilled, soilFace, stub, tuneBackfill } from "../../colony.ts";
import { CELL, cellOf, centreX, centreY, nx, ny } from "../../hex.ts";
import { fillCell, mulberry32, OPEN, rockAt, SOIL, worldFromArrays, type WorldMap } from "../../world.ts";
import { nestAt, put } from "../hexmaps.ts";

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

test("a carrier detours into a stale branch, walks it to its end and fills it back from the tip, trip by trip; a live (scented) branch is never entered", () => {
  // A branch of three cells off the tunnel at (12, 6), going north-east: b1, b2, b3 (its tip).
  const b: [number, number][] = [];
  let x = 12;
  let y = 6;
  for (let k = 0; k < 3; k++) {
    const tx = nx(x, y, 5);
    y = ny(y, 5);
    x = tx;
    b.push([x, y]);
  }
  const [b1, b2, b3] = b as [[number, number], [number, number], [number, number]];
  const restore = tuneBackfill({ enterStale: 1 });
  try {
    const map = build(b);
    assert.equal(stub(map, b1[0], b1[1], 5), false, "the branch's cells can't be filled while it goes on");
    assert.equal(stub(map, b2[0], b2[1], 5), false);
    const c = carrierOn(map, path);
    run(c, 6);
    // Its tip is two cells in: only a carrier that walked on into the branch (#staleStep) is beside it.
    assert.equal(rockAt(map, b3[0], b3[1]), SOIL, "first trip: the branch's tip");
    assert.equal(rockAt(map, b2[0], b2[1]), OPEN);
    for (let trip = 2; trip <= 3; trip++) {
      start(c);
      run(c, 6);
    }
    assert.equal(rockAt(map, b2[0], b2[1]), SOIL, "then the cell before it");
    assert.equal(rockAt(map, b1[0], b1[1]), SOIL, "and back to the tunnel");
    assert.equal(c.soilFilled, 3);
    // A branch with scent in it (an ant digging there laid it on the way in) is in use.
    const live = build(b);
    const k = carrierOn(live, (_x, y) => (y === 6 ? 1 : 0.9));
    let entered = false;
    for (let t = 0; t < 30 * 5 && k.pellet[0] === 1; t++) {
      k.tick(1 / 30);
      if (k.y[0]! < centreY(6) - 0.6) entered = true;
    }
    assert.equal(rockAt(live, b3[0], b3[1]), OPEN, "live branch: not filled");
    assert.ok(!entered, "and not entered");
  } finally {
    restore();
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
  // No longer beside it: a follower pushed off its cell, its target two cells away across filled ground.
  {
    const map = build();
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(8), () => "return");
    put(c, 0, 12, 6);
    c.mode[0] = 2;
    c.tick(1 / 30);
    put(c, 0, 12, 6);
    c.wall[0] = 1;
    c.byCell[0] = 1;
    c.followT[0] = 1;
    c.gx[0] = 14; // two cells east along the tunnel: not a neighbour
    c.gy[0] = 6;
    c.gdir[0] = 0;
    c.tick(1 / 30);
    assert.ok(Math.abs((c.gx[0] as number) - 12) <= 1 && Math.abs((c.gy[0] as number) - 6) <= 1, `re-decided from its own cell: target (${c.gx[0]}, ${c.gy[0]})`);
  }
  // Grazing: right on its cell's edge, so the straight way to the next cell crosses a corner of the solid cell beside it.
  {
    // (13, 5) open, its south-west neighbour (13, 6) the tunnel; its west neighbour (12, 5) soil.
    const map = build([[13, 5]]);
    assert.equal(nx(13, 5, 2), 13);
    assert.equal(ny(5, 2), 6);
    // Find a start on (13, 5)'s edge from which a step towards (13, 6)'s centre lands in a solid cell.
    const step = 7 / 30;
    let sx = NaN;
    let sy = NaN;
    // Exactly on the edge it shares with its west neighbour (x = its centre − ½): off it, the straight way can't graze.
    for (let k = -280; k <= 280 && Number.isNaN(sx); k++) {
      const px = Math.fround(centreX(13, 5) - 0.5);
      const py = Math.fround(centreY(5) + k / 1000);
      cellOf(px, py);
      if (CELL[0] !== 13 || CELL[1] !== 5) continue;
      const h = Math.atan2(centreY(6) - py, centreX(13, 6) - px);
      cellOf(Math.fround(px + Math.cos(h) * step), Math.fround(py + Math.sin(h) * step));
      if (rockAt(map, CELL[0] as number, CELL[1] as number) !== OPEN) {
        sx = px;
        sy = py;
      }
    }
    assert.ok(!Number.isNaN(sx), "a grazing start exists");
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(7), () => "return");
    put(c, 0, 13, 5);
    c.mode[0] = 2;
    c.tick(1 / 30);
    c.x[0] = sx;
    c.y[0] = sy;
    c.wall[0] = 1;
    c.byCell[0] = 1;
    c.followT[0] = 1;
    c.gx[0] = 13;
    c.gy[0] = 6;
    c.gdir[0] = 2;
    let left = false;
    for (let k = 0; k < 30 * 3 && !left; k++) {
      c.tick(1 / 30);
      c.antCell(0);
      left = CELL[0] !== 13 || CELL[1] !== 5;
    }
    assert.ok(left, "it got off the edge and on to the next cell");
  }
});

/** A one-ant colony of explorers on `map`, its ant at cell (x, y) heading east; it lays no scent. */
function explorerOn(map: WorldMap, x: number, y: number, seed = 4): Colony {
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "explore");
  put(c, 0, x, y);
  c.heading[0] = 0;
  c.mode[0] = 0;
  return c;
}

test("a pellet put back is not dug out again: not as a tunnel's end, not as the cell an explorer was walking to, not as any face", () => {
  // The tunnel's tip (20, 6) is filled back: (19, 6) is a dead end now, and an explorer walking east reaches it.
  {
    const map = build();
    const c = explorerOn(map, 15, 6);
    c.tick(1 / 30);
    assert.ok(fillCell(map, 20, 6, c.time));
    let reached = false;
    for (let k = 0; k < 30 * 20; k++) {
      c.tick(1 / 30);
      c.antCell(0);
      reached ||= CELL[0] === 19 && CELL[1] === 6;
    }
    assert.ok(reached, "it walked to the new dead end");
    assert.equal(rockAt(map, 20, 6), SOIL, "the filled tip stays filled");
    for (let d = 0; d < 6; d++) {
      const x = nx(19, 6, d);
      const y = ny(6, d);
      if (x !== 18) assert.equal(rockAt(map, x, y), SOIL, `and the dead end it left is not dug on either (${x}, ${y}): the colony is filling that branch back`);
    }
    // Long after (BACKFILL.hold), it is ground like any other.
    assert.ok(!refilled(map, 20, 6, c.time + 601));
  }
  // An explorer walking into a side cell (not a face it chose to dig) that is filled as it goes.
  {
    const map = build([[12, 5]]);
    const c = explorerOn(map, 12, 6);
    c.tick(1 / 30);
    put(c, 0, 12, 6);
    c.gx[0] = 12;
    c.gy[0] = 5;
    c.gdir[0] = 5;
    c.digAim[0] = NaN;
    assert.ok(fillCell(map, 12, 5, c.time));
    c.tick(1 / 30);
    assert.ok(!(c.gx[0] === 12 && c.gy[0] === 5), "it decides afresh, not on into the filled cell");
    for (let k = 0; k < 30 * 10; k++) c.tick(1 / 30);
    assert.equal(rockAt(map, 12, 5), SOIL, "the side cell stays filled");
  }
  // The pure rules: chooseDig never picks a fresh fill, and soilFace only glances off one.
  {
    const map = build();
    assert.ok(fillCell(map, 20, 6, 100));
    for (const u of [0.01, 0.5, 0.99]) assert.notEqual(chooseDig(map, 19, 6, 0, u, 100.5), 0, "east, straight on, is the fresh fill: never that");
    assert.equal(chooseDig(map, 19, 6, 0, 0.5), 0, "with no clock (long after): east");
    const a = { x: centreX(19, 6), y: centreY(6) };
    assert.equal(soilFace(map, a.x, a.y, a.x + 0.6, a.y, 0, 20, 6, 100.5), GLANCE);
    assert.equal(soilFace(map, a.x, a.y, a.x + 0.6, a.y, 0, 20, 6), DIG_FACE);
  }
});

test("a carrier never drops its pellet back into the cell it dug it from (even with no youth guard: BACKFILL.young 0)", () => {
  const restore = tuneBackfill({ young: 0 });
  try {
    carrierKeepsItsDig();
  } finally {
    restore();
  }
});

function carrierKeepsItsDig(): void {
  const map = build();
  const before = new Set<number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rockAt(map, x, y) === OPEN) before.add(y * W + x);
  const c = explorerOn(map, 17, 6, 9);
  for (let k = 0; k < 30 * 20 && c.pellet[0] === 0; k++) c.tick(1 / 30);
  assert.equal(c.pellet[0], 1, "it dug at the tunnel's end");
  let dx = -1;
  let dy = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rockAt(map, x, y) === OPEN && !before.has(y * W + x)) [dx, dy] = [x, y];
  assert.ok(dx >= 0, "the dug cell");
  assert.ok(stub(map, dx, dy, 5), "a dead end, fillable by shape");
  // Held up beside it well into its trip home, its pellet's cell unscented and the tunnel it stands in busy.
  c.ph.params.home = { evaporation: 0, diffusion: 0 };
  c.ph.params.food = { evaporation: 0, diffusion: 0 };
  for (let x = 2; x <= 20; x++) c.ph.fields.home.set(x, 6, 1);
  c.ph.fields.home.set(dx, dy, 0);
  put(c, 0, 20, 6);
  c.heading[0] = Math.PI;
  c.since[0] = 10;
  run(c, 1);
  assert.equal(rockAt(map, dx, dy), OPEN, "the cell it dug stays open");
  assert.equal(c.soilFilled, 0);
}

test("fresh digging is the frontier, not excess: a stale side cell dug in the last BACKFILL.young seconds is left; dug long before, it is filled", () => {
  const young = build([[12, 5]]);
  young.dugAt.set(12, 5, -10);
  const c = carrierOn(young, path);
  run(c);
  assert.equal(rockAt(young, 12, 5), OPEN, "dug 10 s ago: left open");
  const old = build([[12, 5]]);
  old.dugAt.set(12, 5, -400);
  const k = carrierOn(old, path);
  run(k);
  assert.equal(rockAt(old, 12, 5), SOIL, "dug 400 s ago and unused since: filled");
});

test("a carrier never turns back the way it came into a 'stale branch': the path behind it smells fainter only because home scent fades away from the nest", () => {
  const restore = tuneBackfill({ enterStale: 1 });
  try {
    // Busy up to x = 15, fainter beyond (an old stretch out to the tip at 20): from 15, the way behind is under half of here.
    const map = build();
    const c = carrierOn(map, (x, y) => (y !== 6 ? 0 : x <= 15 ? 1 : 0.3));
    c.since[0] = 2.6;
    let east = c.x[0]!;
    let turned = false;
    for (let t = 0; t < 30 * 4 && c.pellet[0] === 1; t++) {
      c.tick(1 / 30);
      if (c.x[0]! > east + 0.3) turned = true;
      east = Math.min(east, c.x[0]!);
    }
    assert.ok(!turned, "it walked on home, never back east");
    assert.equal(rockAt(map, 20, 6), OPEN, "and filled nothing at the tunnel's far end");
  } finally {
    restore();
  }
});
