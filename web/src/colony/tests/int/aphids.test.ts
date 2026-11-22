import { test } from "node:test";
import assert from "node:assert/strict";
import { APHID, aphidCells, aphidCount, aphidLife, stepAphids, type AphidClump } from "../../aphids.ts";
import { APHIDS_EATEN_SAID, Builder } from "../../builder.ts";
import { Game } from "../../game.ts";
import { centreX, centreY } from "../../hex.ts";
import { PLANE } from "../../vocab.ts";
import { mulberry32, OPEN, rockAt, type WorldMap } from "../../world.ts";
import { smallOne } from "../builders.ts";

// The builder's aphid clump (docs/aphids.md "The mechanic", PRD §78, ja-nzkg.2): the aphids' body. Honeydew made on its cells
// at a rate by its aphids, up to a cap; a life that grows, then crashes; put down, grown by a drag, undone, saved.

const game = () => new Game(smallOne(7), { regrow: 0 }, mulberry32(3), [{ antCount: 20 }, { antCount: 20 }]);
const pt = (x: number, y: number) => ({ x: centreX(x, y), y: centreY(y) });

/** An open cell on the plane well away from the holes, with open cells round it. */
function openSpot(g: Game): { x: number; y: number } {
  const map = g.layers[PLANE] as WorldMap;
  const holes = g.colonies.map((c) => c.holeCells[c.params.nest]!);
  for (let y = 10; y < map.size.h - 10; y++)
    for (let x = 10; x < map.size.w - 10; x++) {
      let ok = map.food.get(x, y) === 0 && holes.every((h) => Math.hypot(h.px - x, h.py - y) > 12);
      for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3 && ok; dx++) ok = rockAt(map, x + dx, y + dy) === OPEN;
      if (ok) return pt(x, y);
    }
  throw new Error("no open spot");
}

test("the life curve: 1 when put down, APHID.peak at peakAt, 0 from endAt", () => {
  assert.equal(aphidLife(0), 1);
  assert.ok(Math.abs(aphidLife(APHID.peakAt) - APHID.peak) < 1e-9);
  assert.ok(aphidLife(APHID.peakAt / 2) > 1 && aphidLife(APHID.peakAt / 2) < APHID.peak);
  assert.ok(aphidLife((APHID.peakAt + APHID.endAt) / 2) < APHID.peak);
  assert.equal(aphidLife(APHID.endAt), 0);
  assert.equal(aphidLife(APHID.endAt + 10), 0);
});

test("a clump makes honeydew at its aphids' rate, on its emptiest cell, never past the cap", () => {
  const g = game();
  const map = g.layers[PLANE] as WorldMap;
  const o = openSpot(g);
  const b = new Builder(g);
  assert.ok(b.apply({ tool: "aphids", layer: PLANE, points: [o] }) > 0);
  const c = g.aphids[0]!;
  const cells = c.cells.length / 2;
  assert.equal(c.start, cells * APHID.perCell);
  const before = map.foodTotal;
  const w = { aphids: g.aphids, layers: g.layers };
  // Ten seconds: start × life × honey owed each second, in whole units laid (well under the cap; review of #243, S2).
  let owed = 0;
  for (let t = 1; t <= 10; t++) {
    stepAphids(w, 1);
    owed += c.start * aphidLife(t) * APHID.honey;
  }
  const made = map.foodTotal - before;
  assert.ok(made > 0 && made === Math.floor(owed + 1e-9), `made ${made}, owed ${owed}`);
  // Long enough that every cell would overflow: each holds no more than the cap.
  for (let k = 0; k < 200; k++) stepAphids(w, 0.5);
  for (let k = 0; k < c.cells.length; k += 2) assert.ok(map.food.get(c.cells[k]!, c.cells[k + 1]!) <= APHID.cellCap);
  assert.ok(map.food.get(c.cells[0]!, c.cells[1]!) > 0);
});

test("a clump's aphids grow, crash and go; its honeydew stays", () => {
  const g = game();
  const o = openSpot(g);
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [o] });
  const c = g.aphids[0]!;
  const w = { aphids: g.aphids, layers: g.layers };
  let peak = 0;
  for (let t = 0; t < APHID.endAt + 5; t += 1) {
    stepAphids(w, 1);
    if (w.aphids.length) peak = Math.max(peak, aphidCount(w.aphids[0]!));
  }
  assert.ok(peak > c.start * 2, `peak ${peak}`);
  assert.equal(w.aphids.length, 0, "gone once its aphids are");
  assert.ok((g.layers[PLANE] as WorldMap).food.get(c.cells[0]!, c.cells[1]!) > 0, "its honeydew lies on");
});

test("a drag grows one clump; undo takes the drag's cells, then the clump", () => {
  const g = game();
  const o = openSpot(g);
  const b = new Builder(g);
  b.begin();
  assert.ok(b.apply({ tool: "aphids", layer: PLANE, points: [o] }, true) > 0);
  const first = g.aphids[0]!.cells.length;
  assert.ok(b.apply({ tool: "aphids", layer: PLANE, points: [{ x: o.x + 2.5, y: o.y }] }, true) > 0);
  assert.equal(g.aphids.length, 1, "one clump");
  assert.ok(g.aphids[0]!.cells.length > first, "grown");
  assert.equal(g.aphids[0]!.start, (g.aphids[0]!.cells.length / 2) * APHID.perCell);
  assert.ok(b.undo());
  assert.equal(g.aphids.length, 0, "one undo takes the whole drag");
});

test("aphids go only on open ground", () => {
  const g = game();
  const map = g.layers[PLANE] as WorldMap;
  let rock: { x: number; y: number } | null = null;
  for (let y = 5; y < map.size.h - 5 && !rock; y++)
    for (let x = 5; x < map.size.w - 5 && !rock; x++) {
      let all = true;
      for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2 && all; dx++) all = rockAt(map, x + dx, y + dy) !== OPEN;
      if (all) rock = pt(x, y);
    }
  assert.ok(rock, "a patch of rock");
  assert.equal(new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [rock!] }), 0);
  assert.equal(g.aphids.length, 0);
});

test("aphidCells: the living clumps' cells on a layer", () => {
  const clump: AphidClump = { layer: PLANE, cells: [3, 4, 5, 6], start: 6, eaten: 0, age: 0, owed: 0 };
  const s = aphidCells([clump], PLANE);
  assert.ok(s.has((4 + 0x8000) * 0x10000 + (3 + 0x8000)));
  assert.equal(s.size, 2);
  assert.equal(aphidCells([clump], PLANE + 1).size, 0);
  assert.equal(aphidCells([{ ...clump, eaten: 6 }], PLANE).size, 0, "a clump with no aphids left has none");
});

test("a game's clumps save and load; a game with none saves as before", () => {
  const g = game();
  assert.ok(!("aphids" in g.save()), "no aphids, no field");
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [openSpot(g)] });
  for (let k = 0; k < 30 * 20; k++) g.tick(1 / 30);
  const saved = JSON.parse(JSON.stringify(g.save()));
  const h = game();
  h.load(saved);
  assert.deepEqual(h.aphids, g.aphids);
  for (let k = 0; k < 30 * 5; k++) {
    g.tick(1 / 30);
    h.tick(1 / 30);
  }
  assert.deepEqual(h.aphids, g.aphids, "and step alike after");
});

test("the aphid odour: built from the living clumps, gone with them; an ant within range smells it and turns toward it", () => {
  const g = game();
  const c = g.colonies[0]!;
  const o = openSpot(g);
  g.tick(1 / 30);
  assert.equal(g.aphidOdour.dist, null, "no clump, no odour");
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [o] });
  g.tick(1 / 30);
  assert.ok(g.aphidOdour.dist, "built");
  assert.equal(c.aphidOdour, g.aphidOdour, "the colonies share it");
  // An ant 4 units east of the clump's centre, heading north: the strongest smell is west, so it turns toward the clump.
  const i = [...Array(c.n).keys()].find((j) => c.alive[j])!;
  c.bind(PLANE);
  c.x[i] = o.x + 4;
  c.y[i] = o.y;
  const north = -Math.PI / 2;
  assert.ok(c.smellsAphids(i, north, Math.PI / 4, 1), "smelt within range");
  assert.ok(c.plumeTurn < 0, `turned toward the clump (west of north): ${c.plumeTurn}`);
  // Out of its range it smells nothing.
  c.x[i] = o.x + c.params.aphidPlume + 6;
  assert.ok(!c.smellsAphids(i, north, Math.PI / 4, 1));
  // A species deaf to it (aphidPlume 0, the desert ant's) smells nothing even beside the clump.
  c.x[i] = o.x + 2;
  const keep = c.params.aphidPlume;
  c.params.aphidPlume = 0;
  assert.ok(!c.smellsAphids(i, north, Math.PI / 4, 1));
  c.params.aphidPlume = keep;
  c.bind(c.home);
  // Undone, the clump's odour goes at the next tick.
  g.aphids.length = 0;
  g.tick(1 / 30);
  assert.equal(g.aphidOdour.dist, null);
});

test("tenders defend: an ant touching a clump stands on a threat, as on home ground; away from both it doesn't; tendDefend 0, never", () => {
  const run = (off: number, tend: number) => {
    const g = game();
    const c = g.colonies[0]!;
    c.params.tendDefend = tend;
    const o = openSpot(g);
    new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [o] });
    for (let k = 0; k < 30 * 5; k++) g.tick(1 / 30);
    const i = [...Array(c.n).keys()].find((j) => c.alive[j] && c.layer[j] === PLANE && !c.carrying[j]);
    assert.ok(i !== undefined, "an ant out on the plane");
    // Set down on the clump or `off` units east of it (still off home ground), with a threat well past defendAt.
    c.putAnt(i!, PLANE, o.x + off, o.y);
    c.threat[i!] = 20 * c.params.defendAt;
    g.tick(1 / 30);
    return c.stanceOf(i!);
  };
  assert.equal(run(0, 1), "defend", "on the clump it defends");
  assert.equal(run(5, 1), "forage", "a few cells off it (smelling it, not touching it), it doesn't");
  assert.equal(run(14, 1), "forage", "far off it, away from home, it doesn't");
  assert.equal(run(0, 0), "forage", "tendDefend 0: not even on the clump");
});

test("aphids eaten: a take on a living aphid cell is an aphid with the chance aphidPrey; the honeydew stays; elsewhere never", () => {
  const g = game();
  const c = g.colonies[0]!;
  const map = g.layers[PLANE] as WorldMap;
  const o = openSpot(g);
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [o] });
  g.tick(1 / 30);
  const clump = g.aphids[0]!;
  const [x, y] = [clump.cells[0]!, clump.cells[1]!];
  c.bind(PLANE);
  c.params.aphidPrey = 1;
  const food = map.food.get(x, y);
  assert.ok(c.preyAphid(x, y), "certain at chance 1");
  assert.equal(clump.eaten, 1);
  assert.equal(map.food.get(x, y), food, "the honeydew stays");
  // Off the clump (a cell beside it is not an aphid cell): never, whatever the chance.
  let off: [number, number] | null = null;
  for (let dx = 1; dx < 12 && !off; dx++) {
    const cx = x + dx;
    if (!clumpCellsOf(clump).has(`${cx},${y}`)) off = [cx, y];
  }
  assert.ok(off && !c.preyAphid(off[0], off[1]));
  c.params.aphidPrey = 0;
  assert.ok(!c.preyAphid(x, y), "aphidPrey 0: never");
  c.bind(c.home);
});

function clumpCellsOf(clump: AphidClump): Set<string> {
  const s = new Set<string>();
  for (let k = 0; k < clump.cells.length; k += 2) s.add(`${clump.cells[k]},${clump.cells[k + 1]}`);
  return s;
}

test("watch: aphids found, some eaten, all gone, each said once; an undone clump says nothing", () => {
  const g = game();
  const c = g.colonies[0]!;
  const b = new Builder(g);
  const o = openSpot(g);
  b.apply({ tool: "aphids", layer: PLANE, points: [o] });
  const clump = g.aphids[0]!;
  assert.deepEqual(b.watch(), [], "nothing yet");
  // An ant of colony 0 carrying food on one of its cells: found.
  const i = [...Array(c.n).keys()].find((j) => c.alive[j])!;
  c.putAnt(i, PLANE, centreX(clump.cells[0]!, clump.cells[1]!), centreY(clump.cells[1]!));
  c.carrying[i] = 0;
  assert.deepEqual(b.watch(), [], "an ant there with empty jaws has not found it");
  c.carrying[i] = 1;
  assert.deepEqual(b.watch(), [{ kind: "aphidsFound", colony: 0 }]);
  assert.deepEqual(b.watch(), [], "once");
  clump.eaten = APHIDS_EATEN_SAID;
  assert.deepEqual(b.watch(), [{ kind: "aphidsEaten" }]);
  assert.deepEqual(b.watch(), []);
  g.aphids.length = 0; // its aphids gone (stepAphids drops it)
  assert.deepEqual(b.watch(), [{ kind: "aphidsGone" }]);
  assert.deepEqual(b.watch(), []);
  // Put down and undone: never gone, never found.
  b.apply({ tool: "aphids", layer: PLANE, points: [o] });
  assert.ok(b.undo());
  assert.deepEqual(b.watch(), []);
});

test("contact is the clump's cells and the ring beside them, no further (review of #243, N5)", () => {
  const g = game();
  const c = g.colonies[0]!;
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [openSpot(g)] });
  for (let k = 0; k < 30 * 5; k++) g.tick(1 / 30);
  const dist = g.aphidOdour.dist!;
  const map = g.layers[PLANE] as WorldMap;
  const { w } = map.size;
  /** A cell at `d` steps from the clump. */
  const at = (d: number) => {
    const k = dist.findIndex((v) => v === d);
    assert.ok(k >= 0, `a cell ${d} from the clump`);
    const col = k % w;
    const y = (k - col) / w;
    return pt(col + map.x0, y);
  };
  const i = [...Array(c.n).keys()].find((j) => c.alive[j] && c.layer[j] === PLANE)!;
  c.bind(PLANE);
  for (const [d, want] of [
    [0, true],
    [1, true],
    [2, false],
  ] as const) {
    const p = at(d);
    c.x[i] = p.x;
    c.y[i] = p.y;
    assert.equal(c.atAphids(i), want, `${d} from the clump`);
  }
  c.bind(c.home);
});

test("a clump whose cells are all full makes nothing, and owes nothing after (review of #243, N5)", () => {
  const g = game();
  const map = g.layers[PLANE] as WorldMap;
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [openSpot(g)] });
  const c = g.aphids[0]!;
  const w = { aphids: g.aphids, layers: g.layers };
  for (let k = 0; k < c.cells.length; k += 2) map.food.set(c.cells[k]!, c.cells[k + 1]!, APHID.cellCap);
  const before = map.foodTotal;
  stepAphids(w, 30);
  assert.equal(map.foodTotal, before);
  assert.equal(c.owed, 0, "what is not taken is not made");
});

test("an aphid taken is carried home as food of quality 1, not honeydew's (review of #243, N5)", () => {
  const g = game();
  const c = g.colonies[0]!;
  c.params.aphidPrey = 1;
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [openSpot(g)] });
  for (let k = 0; k < 30 * 3; k++) g.tick(1 / 30);
  const clump = g.aphids[0]!;
  const map = g.layers[PLANE] as WorldMap;
  let cell = -1;
  for (let k = 0; k < clump.cells.length && cell < 0; k += 2) if (map.food.get(clump.cells[k]!, clump.cells[k + 1]!) > 0) cell = k;
  assert.ok(cell >= 0, "honeydew on a cell");
  const x = clump.cells[cell]!;
  const y = clump.cells[cell + 1]!;
  // Empty-jawed foragers set down on that cell: within a few ticks one takes, and with chance 1 it takes an aphid.
  const outs = [...Array(c.n).keys()].filter((j) => c.alive[j] && c.layer[j] === PLANE && !c.carrying[j]).slice(0, 5);
  const eaten0 = clump.eaten;
  const total0 = map.foodTotal;
  for (let t = 0; t < 10 && clump.eaten === eaten0; t++) {
    for (const j of outs) if (!c.carrying[j]) c.putAnt(j, PLANE, centreX(x, y), centreY(y));
    g.tick(1 / 30);
  }
  assert.ok(clump.eaten > eaten0, "an aphid was taken");
  const taker = outs.find((j) => c.carrying[j]);
  assert.ok(taker !== undefined);
  assert.equal(c.quality[taker!], 1);
  // Each aphid taken is counted as food, as honeydew is (review of #243, N4, N9); honeydew made meanwhile counts too.
  assert.ok(map.foodTotal - total0 >= clump.eaten - eaten0, "aphids taken count in foodTotal");
});

test("a loaded game's clumps are watched: gone, they say so (review of #243, N7)", () => {
  const g = game();
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [openSpot(g)] });
  const h = game();
  h.load(JSON.parse(JSON.stringify(g.save())));
  const b = new Builder(h);
  assert.deepEqual(b.watch(), [], "found and eaten are not said again for a loaded clump");
  h.aphids.length = 0;
  assert.deepEqual(b.watch(), [{ kind: "aphidsGone" }]);
});

test("the odour follows the terrain at once, so a save loads the same one (review of #243, S1, S4)", () => {
  const g = game();
  const b = new Builder(g);
  const s = openSpot(g);
  b.apply({ tool: "aphids", layer: PLANE, points: [s] });
  for (let k = 0; k < 30; k++) g.tick(1 / 30);
  const before = Int16Array.from(g.aphidOdour.dist!);
  // A rock three cells off the clump, between two ticks of one period.
  b.apply({ tool: "rock", layer: PLANE, points: [{ x: s.x + 3 * (centreX(1, 0) - centreX(0, 0)), y: s.y }] });
  g.tick(1 / 30);
  assert.notDeepEqual(g.aphidOdour.dist, before, "the rock moved the odour");
  const h = game();
  h.load(JSON.parse(JSON.stringify(g.save())));
  g.tick(1 / 30);
  h.tick(1 / 30);
  assert.deepEqual(h.aphidOdour.dist, g.aphidOdour.dist);
});
