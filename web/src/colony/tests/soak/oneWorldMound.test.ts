import { test } from "node:test";
import assert from "node:assert/strict";
import { ChunkLayer } from "../../chunks.ts";
import { CURTAIN, LIFESPAN, MIDDEN_MIN, MIDDLE, MODES, PLANE, SWELL, type Colony, type HoleCell, type Layer } from "../../colony.ts";
import { STRAINS } from "../../fungus.ts";
import { Game, gameRng } from "../../game.ts";
import { CELL, cellOf, centreX, centreY, hexDistance, nx, ny } from "../../hex.ts";
import { generateOneWorld, type OneWorld } from "../../oneWorld.ts";
import { heapPlane, OPEN, rockAt, ROCK, worldFromArrays, type WorldMap } from "../../world.ts";

// One world U3c (ja-lp4.3.3; docs/one-world.md §4): the mound as a spoil height field on the plane (heapPlane: a 2D
// sandpile at the angle of repose, a ring round every hole that keeps it open), spoil carried out by the ant's own vector,
// pellets picked off it to spread or take down to backfill, and the midden on a ring set by the undertaker's vector, off
// the mound. A small plane (160 × 100) keeps the games quick: seed 7's player's hole is at cell (48, 32).

const DT = 1 / 30;
const RETURN = MODES.indexOf("return");
const FIGHT = MODES.indexOf("fight");
const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");
/** colony.ts's MIDDEN_MARK (private): the mark a corpse put on the midden lays on its cell at once. */
const MIDDEN_MARK = 20;

/** An all-open plane of w × h cells with an empty spoil layer. */
function openPlane(w: number, h: number): WorldMap {
  const map = worldFromArrays({ w, h }, [{ x: 1, y: 1, r: 1 }]);
  map.spoil = new ChunkLayer((n) => new Uint16Array(n), 0);
  map.moundCells = 0;
  return map;
}

/** Every cell of the plane with its spoil (only cells that hold some). */
function spoilCells(map: WorldMap): { x: number; y: number; h: number }[] {
  const out: { x: number; y: number; h: number }[] = [];
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++) {
      const h = map.spoil!.get(x, y);
      if (h > 0) out.push({ x, y, h });
    }
  return out;
}

/** Every open cell's ring cap: the most it may hold, a level less than its distance from the nearest hole. */
const capOf = (x: number, y: number, holes: { x: number; y: number }[]): number => Math.min(...holes.map((h) => hexDistance(x, y, h.x, h.y) - 1));

test("heapPlane: pellets dropped on one cell pile into a cone at the angle of repose, a level a cell at most", () => {
  const map = openPlane(64, 64);
  const holes = [{ x: 4, y: 4 }];
  for (let k = 0; k < 500; k++) assert.ok(heapPlane(map, 32, 32, holes), `pellet ${k} heaped`);
  const cells = spoilCells(map);
  assert.equal(map.moundCells, 500);
  assert.equal(cells.reduce((s, c) => s + c.h, 0), 500, "every pellet is on the plane, once");
  const peak = map.spoil!.get(32, 32);
  assert.equal(Math.max(...cells.map((c) => c.h)), peak, "highest where they were dropped");
  // A hex cone of slope 1 and height H holds H + 6·Σ d(H − d): 512 at H = 8. Piled at repose, 500 stand about that high.
  assert.ok(peak >= 7, `a cone ${peak} levels high`);
  for (const c of cells) {
    for (let d = 0; d < 6; d++) assert.ok(c.h - map.spoil!.get(nx(c.x, c.y, d), ny(c.y, d)) <= 1, `(${c.x}, ${c.y}): at most a level above each neighbour`);
    assert.ok(c.h <= peak - hexDistance(c.x, c.y, 32, 32) + 1, `(${c.x}, ${c.y}): under the cone's slope`);
  }
  // At repose: a full cone, no shallower than a level a cell (within one level of its slope), and nothing past its foot.
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const d = hexDistance(x, y, 32, 32);
      const h = map.spoil!.get(x, y);
      if (d < peak) assert.ok(h >= peak - d - 1, `(${x}, ${y}), ${d} out: ${h} levels, the cone's slope says ${peak - d}`);
      else assert.ok(d <= peak + 1 || h === 0, `(${x}, ${y}): past the cone's foot`);
    }
});

test("heapPlane: the ring round every hole keeps it open: after 500 pellets dropped on a hole, none above (distance − 1) of any", () => {
  const map = openPlane(64, 64);
  const holes = [
    { x: 24, y: 30 },
    { x: 30, y: 30 },
  ];
  for (let k = 0; k < 500; k++) assert.ok(heapPlane(map, 24, 30, holes), `pellet ${k} heaped`);
  for (let k = 0; k < 200; k++) assert.ok(heapPlane(map, 27, 30, holes), `pellet ${k} between the holes heaped`);
  assert.equal(map.moundCells, 700);
  for (const c of spoilCells(map)) assert.ok(c.h <= capOf(c.x, c.y, holes), `(${c.x}, ${c.y}) holds ${c.h}, its ring allows ${capOf(c.x, c.y, holes)}`);
  for (const h of holes) {
    assert.equal(map.spoil!.get(h.x, h.y), 0, "the hole is open");
    for (let d = 0; d < 6; d++) assert.equal(map.spoil!.get(nx(h.x, h.y, d), ny(h.y, d)), 0, "and every cell beside it");
  }
  // The crater's wall stands at the ring's slope: some cell holds as much as its ring allows.
  assert.ok(
    spoilCells(map).some((c) => c.h === capOf(c.x, c.y, holes) && c.h >= 3),
    "a crater wall at the ring's slope",
  );
});

test("heapPlane: food on a heaped cell stays on top, and rock takes no spoil", () => {
  const map = openPlane(32, 32);
  map.food.set(16, 16, 5);
  const rocky = worldFromArrays({ w: 32, h: 32 }, [{ x: 1, y: 1, r: 1 }], { rock: new Uint8Array(32 * 32).fill(ROCK) });
  rocky.spoil = new ChunkLayer((n) => new Uint16Array(n), 0);
  for (let k = 0; k < 30; k++) heapPlane(map, 16, 16, [{ x: 2, y: 2 }]);
  assert.ok(map.spoil!.get(16, 16) > 0, "spoil heaped on the food's cell");
  assert.equal(map.food.get(16, 16), 5, "the food is still there to take");
  assert.equal(heapPlane(rocky, 16, 16, [{ x: 2, y: 2 }]), null, "no room on rock");
  assert.equal(rocky.moundCells ?? 0, 0);
});

test("heapPlane: null once no cell within reach has room, every pellet before it counted", () => {
  const map = openPlane(9, 9);
  const holes = [{ x: 4, y: 4 }];
  let room = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) room += Math.max(0, capOf(x, y, holes));
  let placed = 0;
  while (heapPlane(map, 4, 4, holes)) assert.ok(++placed <= room, "never more than the ring allows");
  assert.equal(placed, room, `filled to the ring's limit (${room})`);
  assert.equal(map.moundCells, room);
  assert.equal(heapPlane(map, 0, 0, holes), null, "and full from anywhere");
});

// ——— in a game ———

const small = (seed = 7): OneWorld => generateOneWorld(seed, { plane: { size: { w: 160, h: 100 } } });
/** An age in band b (0 young, 1 middle-aged, 2 old) that every founder's lifespan outlasts. */
const ageOf = (b: 0 | 1 | 2) => [0.05, (0.15 + MIDDLE) / 2, 0.5][b]! * LIFESPAN;
/** A game of few ants, every founder young (they stay in) but those a test moves. */
function quiet(seed = 7): Game {
  const g = new Game(small(seed), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(seed));
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) if (c.alive[i]) c.age[i] = ageOf(0);
  return g;
}
const own = (c: Colony): HoleCell => c.holeCells[c.params.nest] as HoleCell;
const curtainHole = (h: HoleCell) => ({ x: centreX(h.col, h.row), y: centreY(h.row) });
const planeHole = (h: HoleCell) => ({ x: centreX(h.px, h.py), y: centreY(h.py) });
const holesOf = (c: Colony) => c.holeCells.map((h) => ({ x: h.px, y: h.py }));
/** How far ant i of c believes it is from home on the plane: from its hole plus odoSurf × drift (U3b's vector). */
function believed(c: Colony, i: number): number {
  const n = (c.layers[PLANE] as Layer).nest;
  const o = c.odoSurf[i] as number;
  return Math.hypot((c.x[i] as number) - (n.x + o * (c.driftSurf[i] as number)), (c.y[i] as number) - (n.y + o * (c.driftSurfY[i] as number)));
}
const cellOfAnt = (c: Colony, i: number): [number, number] => {
  cellOf(c.x[i] as number, c.y[i] as number);
  return [CELL[0] as number, CELL[1] as number];
};

/** Ant i of c, middle-aged, at the top of its shaft with spoil (a corpse: carry one first), heading up. */
function upWith(c: Colony, i: number): void {
  c.age[i] = ageOf(1);
  const at = curtainHole(own(c));
  c.putAnt(i, CURTAIN, at.x, at.y);
  c.pellet[i] = 1;
  c.mode[i] = RETURN;
  c.heading[i] = -Math.PI / 2;
}

test("one world: spoil carried up keeps going, out on the plane, and is heaped where its vector says it is far enough, not at the hole", () => {
  const g = quiet();
  const c = g.player;
  const plane = g.world!.plane;
  const i = 0;
  upWith(c, i);
  const out = c.soilOut;
  for (let k = 0; k < Math.round(2 / DT) && c.layer[i] !== PLANE; k++) g.tick(DT);
  assert.equal(c.layer[i], PLANE, "it went up");
  assert.equal(c.pellet[i], 1, "with its pellet");
  assert.equal(c.soilOut, out, "not put down at the hole");
  assert.equal(c.odoSurf[i], 0, "its vector afresh at its own hole");
  let far = NaN;
  for (let k = 0; k < Math.round(20 / DT) && c.pellet[i]; k++) {
    g.tick(DT);
    if (!c.pellet[i]) far = believed(c, i);
    assert.equal(c.layer[i], PLANE, "it never went back down with it");
  }
  assert.equal(c.pellet[i], 0, "put down within 20 s");
  assert.equal(c.soilOut, out + 1);
  assert.ok(far >= 2, `its vector put it ${far.toFixed(1)} out (spoilTo ≥ 2)`);
  assert.ok((c.odoSurf[i] as number) > 2, `the walk out counted (${(c.odoSurf[i] as number).toFixed(1)})`);
  const cells = spoilCells(plane);
  assert.equal(plane.moundCells, Math.floor(SWELL + 1e-9));
  const [ax, ay] = cellOfAnt(c, i);
  for (const s of cells) {
    assert.ok(hexDistance(s.x, s.y, own(c).px, own(c).py) >= 2, "not at the hole");
    assert.ok(hexDistance(s.x, s.y, ax, ay) <= 2, "heaped where it stood (or slid a cell or two)");
  }
});

test("one world: a spoil or corpse carrier on its own hole cell on the plane doesn't go back down", () => {
  const g = quiet();
  const c = g.player;
  const p = planeHole(own(c));
  // A corpse: carried up from below, it comes out on the hole's cell.
  const at = curtainHole(own(c));
  c.putAnt(5, CURTAIN, at.x, at.y + 1);
  c.kill(5, false);
  const u = 4;
  c.age[u] = ageOf(1);
  for (let k = 0; k < Math.round(30 / DT) && c.crossedUp === 0; k++) {
    if (!c.carriesCorpse(u)) {
      c.putAnt(u, CURTAIN, at.x, at.y + 1);
      c.mode[u] = MODES.indexOf("explore");
    }
    g.tick(DT);
  }
  assert.ok(c.carriesCorpse(u) && c.layer[u] === PLANE, "the undertaker came up with the corpse");
  const [ux, uy] = cellOfAnt(c, u);
  assert.deepEqual([ux, uy], [own(c).px, own(c).py], "onto its hole's cell");
  // Spoil: set on the hole's cell itself, facing every way.
  for (const [i, face] of [0, Math.PI / 2, Math.PI, -Math.PI / 2].entries()) {
    c.age[i] = ageOf(1);
    c.putAnt(i, PLANE, p.x, p.y);
    c.pellet[i] = 1;
    c.mode[i] = RETURN;
    c.heading[i] = face;
  }
  const down = c.crossedDown;
  const out = c.soilOut;
  const buried = c.buried;
  // Each is checked until it first puts its load down: after that, a pellet it picks off the mound to fill with goes down
  // its hole, as it should (U3c's pickers), which a change of the random stream can make happen within the 5 s (U4a).
  const carrying = new Set([0, 1, 2, 3, u]);
  let downWhileCarrying = 0;
  for (let k = 0; k < Math.round(5 / DT); k++) {
    const was = c.crossedDown;
    g.tick(DT);
    for (const i of [...carrying]) {
      if (!c.pellet[i]) carrying.delete(i);
      else assert.equal(c.layer[i], PLANE, `ant ${i}, carrying out, is still on the plane`);
    }
    if (carrying.size > 0) downWhileCarrying += c.crossedDown - was;
  }
  assert.equal(downWhileCarrying, 0, "none went down while any was still carrying out");
  assert.ok(c.crossedDown >= down);
  // And each walked its load out and put it down within the 5 s: the spoil set there by hand too (its walk out starts at
  // once: the pre-check before the mode choice, #carryOut).
  for (const i of [0, 1, 2, 3, u]) assert.ok(!carrying.has(i), `ant ${i} put its load down`);
  assert.equal(c.soilOut, out + 4, "the four pellets heaped on the plane");
  assert.equal(c.buried, buried + 1, "the corpse on the midden");
});

test("one world: a corpse carried up goes on the midden, off the mound and at least MIDDEN_MIN from home by the undertaker's vector; its mark and a Bloom host's spores are there", () => {
  const g = quiet();
  const c = g.player;
  const plane = g.world!.plane;
  const h = own(c);
  // A mound round the hole first, past MIDDEN_MIN: the midden must lie past it, not on it at MIDDEN_MIN.
  for (let k = 0; k < 1500; k++) heapPlane(plane, h.px, h.py, holesOf(c));
  const reach = Math.max(...spoilCells(plane).map((s) => hexDistance(s.x, s.y, h.px, h.py)));
  assert.ok(reach > MIDDEN_MIN + 2, `the mound reaches ${reach} cells out`);
  // A Bloom host dies just below the top of the shaft; a middle-aged undertaker takes it up and out.
  const at = curtainHole(h);
  const dead = 1;
  c.putAnt(dead, CURTAIN, at.x, at.y + 1);
  c.load[dead] = 1;
  c.strain[dead] = BLOOM;
  c.kill(dead, false);
  const i = 0;
  c.age[i] = ageOf(1);
  let far = NaN;
  let under = -1;
  for (let k = 0; k < Math.round(90 / DT) && c.buried === 0; k++) {
    if (!c.carriesCorpse(i) && c.layer[i] === CURTAIN) {
      c.putAnt(i, CURTAIN, at.x, at.y + 1);
      c.mode[i] = MODES.indexOf("explore");
    }
    g.tick(DT);
    if (c.buried > 0) {
      far = believed(c, i);
      const [x, y] = cellOfAnt(c, i);
      under = plane.spoil!.get(x, y);
    }
  }
  assert.equal(c.buried, 1, "on the midden within 90 s");
  assert.equal(c.corpses.length, 0);
  assert.equal(c.layer[i], PLANE, "the undertaker is out on the plane");
  assert.equal(c.midden.size, 1);
  const key = [...c.midden.keys()][0]!;
  const mx = key % 65536;
  const my = Math.floor(key / 65536);
  assert.ok(far >= MIDDEN_MIN, `by its vector ${far.toFixed(1)} from home`);
  assert.equal(under, 0, "no spoil underfoot where it put it down");
  assert.equal(plane.spoil!.get(mx, my), 0, "the midden's cell is off the mound");
  assert.ok(hexDistance(mx, my, h.px, h.py) >= reach - 2, `past the mound (${hexDistance(mx, my, h.px, h.py)} cells out; the mound reaches ${reach})`);
  assert.equal(rockAt(plane, mx, my), OPEN);
  const midden = (L: number) => (c.layers[L] as Layer).ph.fields.midden;
  // The full mark at once where it was put down (#dropPlane), not only the tenth a second it keeps laying (#middenSmell).
  const mark = midden(PLANE).get(mx, my);
  assert.ok(mark >= 0.9 * MIDDEN_MARK, `the plane's midden mark there (${mark.toFixed(2)}, MIDDEN_MARK ${MIDDEN_MARK})`);
  let curtainMark = 0;
  midden(CURTAIN).forEach((_, __, a) => (curtainMark += a.reduce((s, v) => s + v, 0)));
  assert.equal(curtainMark, 0, "and none in the curtain");
  assert.ok(g.fungus.spores.get(mx, my) > 0, "a Bloom host's spores on the plane there");
  // Tapering round it over MIDDEN_SPREAD; and it keeps smelling while the corpse lies on it (its middle is at the cap, so
  // read the taper's first ring, a quarter lower).
  let rx = -1;
  let ry = -1;
  for (let d = 0; d < 6 && rx < 0; d++) if (rockAt(plane, nx(mx, my, d), ny(my, d)) === OPEN) [rx, ry] = [nx(mx, my, d), ny(my, d)];
  const v0 = midden(PLANE).get(rx, ry);
  assert.ok(v0 > 0 && v0 < midden(PLANE).get(mx, my), `less beside it (${v0.toFixed(1)})`);
  for (let k = 0; k < Math.round(10 / DT); k++) g.tick(DT);
  assert.ok(midden(PLANE).get(rx, ry) > v0, "re-marked on the plane as time passes");
});

test("one world: a rival raider on the plane shies from the colony's midden", () => {
  // The player's midden mark painted on the plane 20 cells east of its hole; the rival's raiders walk at it from the west.
  const reach = (painted: boolean): number => {
    const g = quiet();
    const c = g.player;
    const r = g.rival!;
    const h = own(c);
    const mx = centreX(h.px + 20, h.py);
    const my = centreY(h.py);
    if (painted) c.paint("midden", mx, my, 3, 20, PLANE);
    let inside = 0;
    for (let n = 0; n < 6; n++) {
      const i = n;
      r.age[i] = ageOf(2);
      r.putAnt(i, PLANE, mx - 10, my + (n - 2.5) * 0.8);
      r.mode[i] = FIGHT;
      r.recruited[i] = 1;
      r.heading[i] = 0;
    }
    for (let k = 0; k < Math.round(3 / DT); k++) {
      g.tick(DT);
      for (let i = 0; i < 6; i++) if (r.alive[i] && r.layer[i] === PLANE && Math.hypot((r.x[i] as number) - mx, (r.y[i] as number) - my) < 2) inside++;
    }
    return inside;
  };
  const without = reach(false);
  const withIt = reach(true);
  assert.ok(without > 30, `with no midden, raiders walk over the spot (${without} ant-ticks)`);
  assert.ok(withIt < without / 3, `with the midden there, they keep off it (${withIt} against ${without})`);
});

test("one world over 200 s: the mound's books balance, it stays round the hole with every hole open, spreaders carry spoil outward and backfillers take it down", () => {
  const g = new Game(small(), { antCount: 150, rivalAnts: 150, regrow: 0 }, gameRng(7));
  const plane = g.world!.plane;
  // Per ant: the distance from its hole where it picked a pellet off the mound (NaN none), and whether it went down with it.
  const picked = g.colonies.map((c) => new Float32Array(c.n).fill(NaN));
  const wasPellet = g.colonies.map((c) => new Uint8Array(c.n));
  const wasLayer = g.colonies.map((c) => Uint8Array.from(c.layer));
  const spreads: number[] = [];
  let fillDown = 0;
  for (let k = 1; k <= Math.round(200 / DT); k++) {
    g.tick(DT);
    g.colonies.forEach((c, ci) => {
      const h = own(c);
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const [x, y] = cellOfAnt(c, i);
        // Picked up on the plane (nothing else gives an ant a pellet there).
        if (c.layer[i] === PLANE && c.pellet[i] && !wasPellet[ci]![i] && wasLayer[ci]![i] === PLANE) picked[ci]![i] = hexDistance(x, y, h.px, h.py);
        if (wasLayer[ci]![i] === PLANE && c.layer[i] === CURTAIN && wasPellet[ci]![i] && c.pellet[i]) {
          fillDown++;
          picked[ci]![i] = NaN;
        }
        if (c.layer[i] === PLANE && wasPellet[ci]![i] && !c.pellet[i] && !Number.isNaN(picked[ci]![i] as number)) {
          spreads.push(hexDistance(x, y, h.px, h.py) - (picked[ci]![i] as number));
          picked[ci]![i] = NaN;
        }
        wasPellet[ci]![i] = c.pellet[i] as number;
        wasLayer[ci]![i] = c.layer[i] as number;
      }
    });
    if (k % 300 !== 0) continue;
    let mound = 0;
    for (const c of g.colonies) {
      const carried = c.carriedPellets();
      mound += Math.floor(c.soilOut * SWELL + 1e-9) - c.moundLost - c.loosePicked + c.looseDropped;
      assert.equal(c.soilDug, c.soilOut + c.soilFilled + carried.dug + c.soilLost, "dug = brought out + filled + carried + lost");
      assert.equal(c.loosePicked, c.looseDropped + c.looseFilled + carried.loose + c.looseLost, "loose picked up = dropped + filled + carried + lost");
    }
    const cells = spoilCells(plane);
    assert.equal(cells.reduce((s, c) => s + c.h, 0), plane.moundCells, "the plane's count is the spoil on it");
    assert.equal(plane.moundCells, mound, "both colonies' soil out × SWELL, less what was taken off, plus what was put back");
  }
  const holes = holesOf(g.player);
  const cells = spoilCells(plane);
  for (const s of cells) assert.ok(s.h <= capOf(s.x, s.y, holes), `(${s.x}, ${s.y}): within its ring's cap`);
  for (const c of g.colonies) {
    assert.ok(c.soilOut > 40, `colony ${c.params.nest}: ${c.soilOut} pellets brought out`);
    assert.equal(c.moundLost, 0);
    // Its mound: the spoil nearer its hole than the other's. Centred on the hole, and spread out from it.
    const h = own(c);
    let n = 0;
    let sx = 0;
    let sy = 0;
    const far: number[] = [];
    for (const s of cells) {
      const d = hexDistance(s.x, s.y, h.px, h.py);
      if (holes.some((o) => hexDistance(s.x, s.y, o.x, o.y) < d)) continue;
      n += s.h;
      sx += s.h * (centreX(s.x, s.y) - centreX(h.px, h.py));
      sy += s.h * (centreY(s.y) - centreY(h.py));
      far.push(d);
    }
    assert.ok(n > 40, `colony ${c.params.nest}: ${n} pellets on its mound`);
    assert.ok(Math.hypot(sx / n, sy / n) < 4, `colony ${c.params.nest}: the mound's centre is ${Math.hypot(sx / n, sy / n).toFixed(1)} from its hole`);
    far.sort((a, b) => a - b);
    assert.ok((far[Math.floor(far.length / 2)] as number) >= 3, `colony ${c.params.nest}: spoil carried out from the hole (median ${far[Math.floor(far.length / 2)]} cells)`);
  }
  assert.ok(spreads.length >= 4, `${spreads.length} pellets spread`);
  const mean = spreads.reduce((s, d) => s + d, 0) / spreads.length;
  assert.ok(mean > 3, `spread outward, ${mean.toFixed(1)} cells on average`);
  assert.ok(fillDown >= 1, `${fillDown} loose pellets taken down a hole to backfill`);
});
