import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE, type Colony } from "../../colony.ts";
import { STRAINS } from "../../fungus.ts";
import { Game, gameRng, NO_ROOM } from "../../game.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { CRUST, generateCurtain, generateOneWorld, growWorld, STRIP, type OneWorld } from "../../oneWorld.ts";
import type { Flight } from "../../royal.ts";
import { cellAt, nearestValid } from "../../transect.ts";
import { AIR, disc, mulberry32, openCell, OPEN, reachable, reachableFrom, rockAt, type WorldMap } from "../../world.ts";

// Founding on the line (U4a, ja-lp4.4.1; docs/one-world.md §3): the world grows at an end, nothing already there moves,
// and a queen with nowhere to land is lost with the reason. One world on the default plane, with its real rock.

const DT = 1 / 30;
const FOOD = 2;

/** A one-world game of few ants (the geometry is what is tested; the colonies only need to live). */
const game = (seed: number, ants = 8): Game => new Game(generateOneWorld(seed), { antCount: ants, rivalAnts: ants, regrow: 0 }, gameRng(seed));

/** A flight from colony `mother` (as Colony.flown gives one), pending: found() and lose() take only pending flights. */
function fly(g: Game, mother: number): Flight {
  const m = g.colonies[mother]!;
  const f: Flight = { mother, x: m.nest.x, y: m.nest.y, load: 0, strain: 0, at: g.time, food: FOOD };
  g.flights.push(f);
  return f;
}

/** The curtain's ground and food below the strip in columns lo … hi, column by column. */
interface Below {
  lo: number;
  hi: number;
  rows: number;
  rock: Uint8Array;
  food: Float32Array;
}
function below(curtain: WorldMap, lo: number, hi: number): Below {
  const rows = curtain.size.h - CRUST;
  const rock = new Uint8Array((hi - lo + 1) * rows);
  const food = new Float32Array(rock.length);
  for (let s = lo; s <= hi; s++)
    for (let y = CRUST; y < curtain.size.h; y++) {
      rock[(s - lo) * rows + y - CRUST] = curtain.rock.get(s, y);
      food[(s - lo) * rows + y - CRUST] = curtain.food.get(s, y);
    }
  return { lo, hi, rows, rock, food };
}

/** Assert every column of `was` but those within 8 of `sNew` (where a new nest was dug) has the same ground and food in `now`. */
function sameBelow(was: Below, now: Below, sNew: number, label: string): void {
  for (let s = was.lo; s <= was.hi; s++) {
    if (Math.abs(s - sNew) <= 8) continue;
    for (let r = 0; r < was.rows; r++) {
      const i = (s - was.lo) * was.rows + r;
      const j = (s - now.lo) * now.rows + r;
      if (was.rock[i] !== now.rock[j] || was.food[i] !== now.food[j]) assert.fail(`${label}: column ${s}, row ${r + CRUST} changed: rock ${was.rock[i]} → ${now.rock[j]}, food ${was.food[i]} → ${now.food[j]}`);
    }
  }
}

/** The cells within a nest's royal chamber disc (as foundNest digs it). */
function chamberCells(map: WorldMap, k: number): Set<number> {
  const n = map.nests[k]!;
  const out = new Set<number>();
  disc(map, n.x, n.y, n.r + 1.5, (x, y) => out.add(y * 65536 + x));
  return out;
}

/**
 * The plane's main open ground: the open cells joined to the world's own first nest (colony 0's), as a flat array.
 * Kept per plane: plane rock never changes (it has no soil to dig).
 */
const mainRegions = new WeakMap<WorldMap, Uint8Array>();
function mainRegion(plane: WorldMap): Uint8Array {
  let r = mainRegions.get(plane);
  if (!r) {
    const n = plane.nests[0]!;
    r = reachable(plane, n.x, n.y, "open");
    mainRegions.set(plane, r);
  }
  return r;
}

/** The invariants after every founding (U4a's property tests). */
function check(w: OneWorld, g: Game, label: string): void {
  const { plane, curtain, line } = w;
  assert.equal(curtain.x0, line.sMin, `${label}: the curtain starts at the line's first column`);
  assert.equal(curtain.size.w, line.sMax - line.sMin + 1, `${label}: and ends at its last`);
  assert.equal(line.holes.length, curtain.nests.length, `${label}: a hole a nest`);
  assert.equal(plane.nests.length, curtain.nests.length);
  for (const c of g.colonies) {
    assert.equal(c.line, line, `${label}: every colony reads the line as it stands`);
    assert.equal(c.holeCells.length, curtain.nests.length);
    c.holeCells.forEach((h, k) => {
      // Every hole open on both layers, and its column s the line's: the plane cell over it is the hole.
      assert.equal(rockAt(plane, h.px, h.py), OPEN, `${label}: nest ${k}'s hole is open on the plane`);
      assert.equal(rockAt(curtain, h.col, h.row), OPEN, `${label}: and in the curtain's crust`);
      assert.equal(h.row, CRUST);
      const i = line.holes.findIndex((v) => v.x === h.px && v.y === h.py);
      assert.ok(i >= 0, `${label}: nest ${k}'s hole is on the line`);
      assert.equal(h.col, line.sHole[i], `${label}: at its column s`);
      assert.ok(cellAt(line, h.col) && CELL[0] === h.px && CELL[1] === h.py, `${label}: P(s) is the hole`);
    });
  }
  // The strip is sky over every column, the new ones included (the side view draws P(s) there); the holes are open under it.
  for (let s = line.sMin; s <= line.sMax; s++) if (curtain.rock.get(s, STRIP) !== AIR || curtain.sky!.get(s, STRIP) !== 1 || curtain.food.get(s, STRIP) !== 0) assert.fail(`${label}: the strip at column ${s} isn't sky`);
  // Every hole joins the plane's main open ground (D1, PR #62): the region the world's own first hole is in, so no
  // colony is founded in a pocket sealed off by rock.
  const main = mainRegion(plane);
  for (const h of line.holes) assert.ok(main[h.y * plane.size.w + h.x - plane.x0], `${label}: the hole at plane cell (${h.x}, ${h.y}) is in a pocket off the main open ground`);
  // No two royal chambers share a cell.
  const all = curtain.nests.map((_, k) => chamberCells(curtain, k));
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) assert.ok(![...all[a]!].some((cell) => all[b]!.has(cell)), `${label}: nests ${a} and ${b}'s royal chambers merge`);
}

/**
 * The food a growth adds (PR #62 review, S1): before any tick, the curtain's foodTotal and foodLeft are the food below the
 * crust, so a growth counts what it buries; and every food cell in the columns it added (outside `old`) is one some
 * colony can reach, walking or digging, so it buries none that no ant could ever take.
 */
function foodBooks(w: OneWorld, old: { sMin: number; sMax: number }, label: string): void {
  const { curtain } = w;
  const { x0 } = curtain;
  const { w: cw, h } = curtain.size;
  const reach = reachableFrom(curtain, curtain.nests, "diggable");
  let sum = 0;
  for (let s = x0; s < x0 + cw; s++)
    for (let y = CRUST; y < h; y++) {
      const v = curtain.food.get(s, y);
      if (!v) continue;
      sum += v;
      if ((s < old.sMin || s > old.sMax) && !reach[y * cw + s - x0]) assert.fail(`${label}: food ${v} at new column ${s}, row ${y}, which no colony can reach`);
    }
  assert.ok(Math.abs(curtain.foodTotal - sum) < 1e-6 * Math.max(1, sum), `${label}: foodTotal ${curtain.foodTotal} but ${sum} below the crust`);
  assert.ok(Math.abs(curtain.foodLeft - sum) < 1e-6 * Math.max(1, sum), `${label}: foodLeft ${curtain.foodLeft} but ${sum} below the crust`);
}

/** Found once, by the lab beyond an end or by a flight from a random colony, and check what growth must keep. Returns whether a colony was founded. */
function foundOnce(w: OneWorld, g: Game, r: () => number, label: string): boolean {
  const old = w.line;
  const kept = below(w.curtain, old.sMin, old.sMax);
  const n = g.colonies.length;
  let k: number;
  if (r() < 0.5) {
    try {
      k = g.foundBeyond(r() < 0.5 ? "start" : "end", 8);
    } catch (e) {
      assert.match(String(e), /no room/);
      k = -1;
    }
  } else k = g.found(fly(g, Math.floor(r() * n)));
  if (k < 0) {
    assert.equal(w.line, old, `${label}: nothing founded, nothing grown`);
    assert.equal(g.colonies.length, n);
    return false;
  }
  assert.equal(k, n);
  // The shared columns keep their ground and food, but where the new nest was dug (its shaft and chamber lie within 8
  // columns of its hole, which can be in the old end's margin).
  const sNew = g.colonies[k]!.holeCells[g.colonies[k]!.params.nest]!.col;
  sameBelow(kept, below(w.curtain, old.sMin, old.sMax), sNew, label);
  check(w, g, label);
  if (g.time === 0) foodBooks(w, old, label);
  return true;
}

test("founding property test: on the default planes of seeds 1–20, random foundings beyond the ends and by flights keep every hole open, the line and holes agreed, the shared columns' ground and food, and royal chambers apart", () => {
  let founded = 0;
  let tries = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = game(seed, 2);
    const w = g.world!;
    check(w, g, `seed ${seed}, start`);
    foodBooks(w, w.line, `seed ${seed}, start`);
    const r = mulberry32(seed * 977);
    for (let j = 0; j < 4; j++) {
      tries++;
      if (foundOnce(w, g, r, `seed ${seed}, founding ${j}`)) founded++;
    }
  }
  console.log(`# ${founded} of ${tries} foundings landed`);
  assert.ok(founded >= 40, `${founded} of ${tries} foundings landed`);
});

test("after foundings at both ends and by flights, 30 s run with every colony alive, the strip guard holding", () => {
  for (const seed of [1, 2]) {
    const g = game(seed);
    const w = g.world!;
    const r = mulberry32(seed * 31);
    g.foundBeyond("start", 8);
    g.foundBeyond("end", 8);
    for (let j = 0; j < 3; j++) foundOnce(w, g, r, `seed ${seed}`);
    assert.ok(g.colonies.length >= 4, `seed ${seed}: ${g.colonies.length} colonies`);
    for (let k = 0; k < Math.round(30 / DT); k++) {
      g.tick(DT);
      if (k % 30) continue;
      for (const c of g.colonies)
        for (let i = 0; i < c.n; i++)
          if (c.alive[i] && c.layer[i] === CURTAIN) {
            cellOf(c.x[i]!, c.y[i]!);
            assert.ok(CELL[1]! >= CRUST, `seed ${seed}: an underground ant on the curtain's surface rows`);
          }
    }
    g.colonies.forEach((c, k) => assert.ok(!Game.beaten(c) && (c.population > 0 || c.queen?.alive), `seed ${seed}: colony ${k} lives`));
    check(w, g, `seed ${seed}, after 30 s`);
  }
});

test("growth at V₀ and at V_k keeps every existing s in place, and the new columns are the curtain's own ground", () => {
  for (const seed of [1, 3]) {
    const w = generateOneWorld(seed);
    const open = openCell(w.plane);
    for (const end of ["start", "end"] as const) {
      const old = w.line;
      const v = end === "start" ? old.holes[0]! : old.holes[old.holes.length - 1]!;
      const spot = nearestValid(old, { x: v.x + (end === "start" ? -90 : 90), y: v.y }, 140, open);
      assert.ok(spot && spot.end === end, `seed ${seed}: a founding beyond the ${end}`);
      const kept = below(w.curtain, old.sMin, old.sMax);
      const holes = old.sHole.slice();
      const entranceCol = (j: number) => {
        const e = w.curtain.nests[j]!.entrance!;
        cellOf(e.x, e.y);
        return CELL[0]!;
      };
      const cols = w.curtain.nests.map((_, j) => entranceCol(j));
      const k = growWorld(w, end, spot.cell);
      const line = w.line;
      // Nothing renumbered: the old holes keep their s, at either end, and the curtain's x0 is the new line's sMin.
      assert.deepEqual(end === "start" ? line.sHole.slice(1) : line.sHole.slice(0, -1), holes, `seed ${seed}: the old holes keep their s`);
      assert.equal(w.curtain.x0, line.sMin);
      if (end === "start") assert.ok(line.sMin < old.sMin, "growing at V₀ lowers x0");
      else assert.equal(line.sMin, old.sMin, "growing at the end leaves x0");
      cols.forEach((col, j) => assert.equal(entranceCol(j), col, `seed ${seed}: nest ${j}'s hole stays at its s`));
      assert.equal(entranceCol(k), line.sHole[end === "start" ? 0 : line.sHole.length - 1], "the new nest is at the new hole's s");
      const sNew = line.sHole[end === "start" ? 0 : line.sHole.length - 1]!;
      sameBelow(kept, below(w.curtain, old.sMin, old.sMax), sNew, `seed ${seed}`);
      // The new columns' ground (rock and soil, not reachability's food) is what a curtain generated along the grown line has.
      const order = w.curtain.nests.map((n) => {
        cellOf(n.entrance!.x, n.entrance!.y);
        return line.sHole.indexOf(CELL[0]!);
      });
      const colonies = line.sHole.map((_, i) => order.indexOf(i));
      const fresh = generateCurtain(seed, line, colonies);
      for (let s = line.sMin; s <= line.sMax; s++) {
        if (s >= old.sMin && s <= old.sMax) continue;
        for (let y = 0; y < w.curtain.size.h; y++) if (w.curtain.rock.get(s, y) !== fresh.rock.get(s, y)) assert.fail(`seed ${seed}: new column ${s}, row ${y}: ${w.curtain.rock.get(s, y)}, generated ${fresh.rock.get(s, y)}`);
      }
    }
  }
});

test("a flight with no room within her radius is lost: the game says why, and her body is booked to her mother", () => {
  const g = game(1);
  const before = g.world!.line;
  const m = g.player;
  const eaten = m.eaten;
  const f = fly(g, 0);
  // Far off the plane: nowhere within FOUND_RADIUS is open ground.
  assert.equal(g.found(f, { x: -5000, y: -5000 }), -1);
  assert.deepEqual(g.lastLoss, { flight: f, reason: NO_ROOM });
  assert.equal(m.eaten, eaten + FOOD, "her reserve leaves with her, booked to her mother");
  assert.equal(g.world!.line, before, "the line didn't grow");
  assert.equal(g.colonies.length, 2);
  assert.equal(g.flights.length, 0);
  // And one that lands: her daughter founds alone, her queen in the curtain.
  let k = -1;
  for (let j = 0; j < 8 && k < 0; j++) k = g.found(fly(g, j % 2));
  assert.ok(k >= 2, "some flight landed");
  const d = g.colonies[k]!;
  assert.ok(d.founding && d.queen?.alive && d.population === 0);
});

test("a colony founded beyond an end starts its ants in the curtain, with its queen in its royal chamber", () => {
  const g = game(2);
  const k = g.foundBeyond("end", 30);
  const c: Colony = g.colonies[k]!;
  assert.equal(c.population, 30);
  for (let i = 0; i < c.n; i++) if (c.alive[i]) assert.equal(c.layer[i], CURTAIN, `ant ${i} starts underground`);
  assert.ok(c.queen);
  cellOf(c.queen.x, c.queen.y);
  assert.equal(g.world!.curtain.chambers!.list[g.world!.curtain.chambers!.at(CELL[0]!, CELL[1]!)]?.role, "royal");
  // The plane above it is its own layer: its nest there is the disc round its hole.
  const h = c.holeCells[c.params.nest]!;
  const pn = c.layers[PLANE]!.nest;
  assert.deepEqual([pn.x, pn.y], [centreX(h.px, h.py), centreY(h.py)]);
});

test("the fungus's spores in the curtain stay on their cells when the curtain grows at V₀ (Fungus.regrid)", () => {
  const g = game(1);
  const c = g.player;
  const h = c.holeCells[c.params.nest]!;
  // Spores a few rows down the player's shaft, in the curtain.
  g.fungus.paint([], centreX(h.col, CRUST + 3), centreY(CRUST + 3), 2, 3, 0, STRAINS.findIndex((s) => s.id === "bloom"), CURTAIN);
  const n = g.fungus.sporeCells;
  assert.ok(n > 0);
  g.foundBeyond("start", 8);
  assert.ok(g.world!.curtain.x0 < -64, "the curtain grew at V₀");
  // A step reads each spore cell back from its key: a stale key reads an empty cell, and forgets it at once.
  for (let k = 0; k < 10; k++) g.tick(DT);
  assert.ok(g.fungus.sporeCells >= n - 2, `${g.fungus.sporeCells} of ${n} spore cells still there`);
});

test("a one-world flight replays: two games on the same seed fly the same flights to the same holes and the same losses (PR #62 review, S2)", () => {
  const run = () => {
    const g = game(1, 2);
    const out: string[] = [];
    // Flights from both colonies, landing where the game's stream sends each: a hole on the line, or lost with a reason.
    for (let j = 0; j < 6; j++) {
      const k = g.found(fly(g, j % 2));
      out.push(k < 0 ? `lost: ${g.lastLoss?.reason}` : `colony ${k}`);
    }
    return { sHole: g.world!.line.sHole.slice(), lastLoss: g.lastLoss?.reason ?? null, out, colonies: g.colonies.length };
  };
  const a = run();
  const b = run();
  assert.ok(a.colonies > 2, `some flight landed: ${a.out.join("; ")}`);
  assert.deepEqual(b.sHole, a.sHole, "the line's holes are where the first game put them");
  assert.equal(b.lastLoss, a.lastLoss);
  assert.deepEqual(b.out, a.out);
});

test("founding mid-game, 20 s in: every colony's way out (its out-field) is rebuilt over the grown curtain, and the game plays on (PR #62 review, S3)", () => {
  // 40 ants a colony, so ants are underground on their way out often enough to need the field soon after the founding.
  const g = game(1, 40);
  const w = g.world!;
  for (let k = 0; k < Math.round(20 / DT); k++) g.tick(DT);
  const built = g.colonies.map((c) => c.layers[CURTAIN]!.outDist?.length ?? 0);
  assert.ok(built.every((n) => n > 0), "every colony has built its out-field before the founding");
  const old = w.line;
  g.foundBeyond("start", 8);
  assert.ok(w.line.sMin < old.sMin, "the curtain grew at V₀");
  check(w, g, "after the founding");
  // The field is built lazily, when an ant first needs the way out: tick until colonies have rebuilt it since the founding.
  const at = g.time;
  const { x0 } = w.curtain;
  const { w: cw, h } = w.curtain.size;
  const rebuilt = new Set<number>();
  for (let k = 0; k < Math.round(10 / DT); k++) {
    g.tick(DT);
    g.colonies.forEach((c, j) => {
      const L = c.layers[CURTAIN]!;
      if (!L.outDist || L.outAt <= at) return;
      // Cell (x, y) is at y·w + x − x0 of the curtain as it stands: a field kept from before reads every cell wrong.
      assert.equal(L.outDist.length, cw * h, `colony ${j}'s out-field, rebuilt at ${L.outAt.toFixed(2)} s, covers the grown curtain`);
      assert.equal(L.outDist[L.entranceRow * cw + L.entranceCol - x0], 0, `colony ${j}'s out-field starts at its hole`);
      rebuilt.add(j);
    });
  }
  assert.ok(rebuilt.size > 0, "some colony needed its way out, and rebuilt its out-field, in the 10 s after the founding");
  g.colonies.forEach((c, k) => assert.ok(!Game.beaten(c) && (c.population > 0 || c.queen?.alive), `colony ${k} lives`));
  check(w, g, "10 s after the founding");
});

test("a founding joins the plane's main open ground: on seed 19 the lab's founding beyond the start no longer lands in a 17-cell pocket sealed by rock (PR #62 review, D1)", () => {
  const g = game(19, 2);
  const w = g.world!;
  const k = g.foundBeyond("start", 2);
  const h = g.colonies[k]!.holeCells[g.colonies[k]!.params.nest]!;
  const { plane } = w;
  const main = mainRegion(plane);
  assert.equal(main[h.py * plane.size.w + h.px - plane.x0], 1, `the hole at plane cell (${h.px}, ${h.py}) is on the main open ground`);
  // The rule's spot moved: the old rule's (any open cell) was plane cell (100, 25), in a pocket of 17 cells.
  assert.notDeepEqual([h.px, h.py], [100, 25]);
  const own = reachable(plane, centreX(h.px, h.py), centreY(h.py), "open");
  let cells = 0;
  for (const c of own) cells += c;
  assert.ok(cells > 100_000, `the new colony can walk ${cells} cells of the surface`);
});
