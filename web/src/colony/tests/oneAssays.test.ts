import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE, type Colony, type Layer } from "../colony.ts";
import { antsNear, Arena, at, cellRect, crossingProbe, heldProbe, nestFlowProbe, occupancyProbe, oneArena, onPlane, outingProbe, runGame, type RunSpec } from "../experiment.ts";
import { STRAINS } from "../fungus.ts";
import { Game, gameRng } from "../game.ts";
import { CELL, cellOf } from "../hex.ts";
import { CRUST, generateCurtain, type OneWorld } from "../oneWorld.ts";
import { cellAt } from "../transect.ts";
import { OPEN, rockAt } from "../world.ts";

// One world's assay harness (experiment.ts, docs/one-world.md U6a): arenas made the plane (oneArena), probes that count
// the plane's ants only, paint on the layer asked for.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

/** A small open arena with two nests 36 cells apart, a pile between. */
const arena = () => new Arena(60, 40, true).pile(30, 20, 3, 50).build([{ x: 12, y: 20, r: 3 }, { x: 48, y: 20, r: 3 }]);
const oneGame = (seed = 3, ants = 20): Game => new Game(oneArena(arena(), seed), { antCount: ants, rivalAnts: ants }, gameRng(seed));

test("oneArena: the arena is the plane, a hole at each nest open on both layers, the curtain dug under the line", () => {
  const plane = arena();
  const w: OneWorld = oneArena(plane, 5);
  assert.equal(w.plane, plane, "the arena itself is the plane");
  assert.ok(plane.spoil, "the plane has a mound to heap spoil on");
  assert.equal(plane.moundCells, 0);
  assert.equal(w.line.holes.length, 2);
  w.line.sHole.forEach((s, k) => {
    const n = plane.nests[k]!;
    cellOf(n.x, n.y);
    assert.deepEqual(w.line.holes[k], { x: CELL[0], y: CELL[1] }, `hole ${k} is nest ${k}'s cell`);
    assert.ok(cellAt(w.line, s));
    assert.equal(rockAt(plane, CELL[0]!, CELL[1]!), OPEN, `hole ${k} open on the plane`);
    assert.equal(rockAt(w.curtain, s, CRUST), OPEN, `hole ${k} open in the curtain's crust`);
    assert.ok(w.curtain.nests[k]?.entrance, `nest ${k} dug in the curtain`);
  });
  // One nest is a line too: one hole, its margins straight out.
  const solo = oneArena(new Arena(40, 30, true).build([{ x: 20, y: 15, r: 3 }]), 5);
  assert.equal(solo.line.holes.length, 1);
  assert.equal(rockAt(solo.curtain, solo.line.sHole[0]!, CRUST), OPEN);
});

test("oneArena: no buried food unless asked, so `stored` counts only food carried down from the plane", () => {
  const w = oneArena(arena(), 5);
  assert.equal(w.curtain.foodTotal, 0);
  assert.equal(w.curtain.foodLeft, 0);
  let food = 0;
  for (let y = 0; y < w.curtain.size.h; y++) for (let x = w.curtain.x0; x < w.curtain.x0 + w.curtain.size.w; x++) food += w.curtain.food.get(x, y);
  assert.equal(food, 0, "no food in any curtain cell");
  // Asked to keep it, the curtain is generateCurtain's, food and all (seed 5's has some).
  const kept = oneArena(arena(), 5, { buried: true });
  const ref = generateCurtain(5, kept.line);
  assert.ok(ref.foodTotal > 0, "seed 5's curtain buries food");
  assert.equal(kept.curtain.foodTotal, ref.foodTotal);
  assert.equal(kept.curtain.foodLeft, ref.foodLeft);
  // runGame's foodHome reads both layers' food; the plane's here.
  const { result } = runGame(onPlane({ seed: 5, seconds: 1 / 30, map: arena, game: { antCount: 5, rival: false } }));
  assert.equal(result.metrics["you.foodHome"], 0);
});

/** Ant i of c put on `layer` at world (x, y): a probe reads only these fields. */
const put = (c: Colony, i: number, layer: number, x: number, y: number) => {
  c.layer[i] = layer;
  c.x[i] = x;
  c.y[i] = y;
};

/** Every living ant of c but ants a and b moved far off on the plane, so the probes see only the two. */
const isolate = (c: Colony, a: number, b: number) => {
  for (let i = 0; i < c.n; i++) if (i !== a && i !== b) put(c, i, PLANE, 0.5, 0.5);
};

test("antsNear counts the plane's ants only in one world: a curtain ant at the same x, y is underground", () => {
  const g = oneGame();
  const c = g.player;
  const spot = at(30, 20);
  isolate(c, 0, 1);
  put(c, 0, PLANE, spot.x, spot.y);
  put(c, 1, CURTAIN, spot.x + 1, spot.y);
  assert.equal(antsNear(g, spot.x, spot.y, 4), 1, "the plane ant, not the curtain one");
  assert.equal(antsNear(g, spot.x, spot.y, 4, 0, CURTAIN), 1, "asked for the curtain, the curtain ant");
  assert.equal(antsNear(g, spot.x, spot.y, 4, 0, -1), 2, "every layer: both");
  put(c, 1, PLANE, spot.x + 1, spot.y);
  assert.equal(antsNear(g, spot.x, spot.y, 4), 2);
});

test("occupancy and crossing probes count the plane's ants only in one world", () => {
  const g = oneGame();
  const c = g.player;
  isolate(c, 0, 1);
  const gate = cellRect(26, 18, 34, 22);
  const occ = occupancyProbe({ gate });
  const cross = crossingProbe({ gate });
  const mid = (gate.x0 + gate.x1) / 2;
  const y = (gate.y0 + gate.y1) / 2;
  // Both ants walk across the gate's middle, one on each layer at the same x, y.
  for (const x of [mid - 2, mid - 1, mid + 1, mid + 2]) {
    put(c, 0, PLANE, x, y);
    put(c, 1, CURTAIN, x, y);
    occ.tick(g, 1);
    cross.tick(g, 1);
  }
  assert.equal(occ.summary(g).gate, 4, "4 s of the plane ant; none of the curtain one");
  assert.equal(cross.summary(g).gatePasses, 1, "one passage, the plane ant's");
});

test("outingProbe in one world: outside is on the plane, past the plane's nest; every curtain ant is in", () => {
  const g = oneGame();
  const c = g.player;
  const disc = (c.layers[PLANE] as Layer).nest;
  const probe = outingProbe(disc, { All: [0, 1] });
  for (let i = 0; i < c.n; i++) put(c, i, PLANE, disc.x, disc.y);
  // Ant 0 out on the plane, ant 1 in the curtain at the same x, y.
  put(c, 0, PLANE, disc.x + disc.r + 10, disc.y);
  put(c, 1, CURTAIN, disc.x + disc.r + 10, disc.y);
  g.time = 0.5;
  probe.tick(g, 1);
  g.time = 1;
  probe.tick(g, 1);
  const m = probe.summary(g);
  assert.equal(m.outsideAll, 1 / c.population, "one ant outside: the plane one");
  assert.equal(m.departsAll, 60, "one trip out in the 1-s window, per minute");
});

test("heldProbe(PLANE) counts carriers on the plane only; by default every layer", () => {
  const g = oneGame();
  const c = g.player;
  const all = heldProbe();
  const plane = heldProbe(PLANE, "Plane");
  for (let i = 0; i < c.n; i++) c.carrying[i] = 0;
  // Two foragers holding food past STUCK_AFTER, one on each layer.
  c.carrying[0] = 1;
  c.carrying[1] = 1;
  c.layer[0] = PLANE;
  c.layer[1] = CURTAIN;
  c.since[0] = c.since[1] = 200;
  g.time = 130;
  all.tick(g, 1);
  plane.tick(g, 1);
  assert.equal(all.summary(g)["you.maxHeld"], 2);
  assert.equal(plane.summary(g)["you.maxHeldPlane"], 1);
});

test("an assay's paint lands on the plane in one world, and Game.paintSpores on the layer asked", () => {
  const spot = at(30, 20);
  const spec: RunSpec = onPlane({ seed: 3, seconds: 1 / 30, map: arena, game: { antCount: 5, rival: false }, events: [{ at: 0, kind: "paint", channel: "alarm", x: spot.x, y: spot.y, r: 2, amount: 5 }] });
  const { game } = runGame(spec);
  const c = game.player;
  const read = (l: number) => (c.layers[l] as Layer).ph.read("alarm", spot.x, spot.y);
  assert.ok(read(PLANE) > 1, `alarm on the plane: ${read(PLANE)}`);
  assert.equal(read(CURTAIN), 0, "none in the curtain");
  // Spores by the royal chamber (the unity guard's paint): on the curtain, none on the plane there.
  const g = oneGame();
  const nest = (g.player.layers[CURTAIN] as Layer).nest;
  g.paintSpores(nest.x, nest.y, nest.r + 2, 3, 0.3, GARDEN, CURTAIN);
  cellOf(nest.x, nest.y);
  const [cx, cy] = [CELL[0]!, CELL[1]!];
  assert.ok(g.fungus.sporesOn(CURTAIN)!.spores.get(cx, cy) > 0, "spores in the curtain by the chamber");
  let planeSpores = 0;
  g.fungus.sporesOn(PLANE)!.spores.forEach((_x, _y, a) => {
    for (const v of a) planeSpores += v;
  });
  assert.equal(planeSpores, 0, "none on the plane");
  // The default stays the plane (layer 0), as before.
  const h = oneGame();
  const p = at(30, 20);
  h.paintSpores(p.x, p.y, 2, 3, 0, GARDEN);
  cellOf(p.x, p.y);
  assert.ok(h.fungus.sporesOn(PLANE)!.spores.get(CELL[0]!, CELL[1]!) > 0);
});

test("nestFlowProbe reads the curtain's chambers in one world (A8)", () => {
  const g = oneGame();
  const ch = g.world!.curtain.chambers!;
  const royal = ch.list.find((k) => k.colony === 0 && k.role === "royal")!;
  royal.food = 4;
  const probe = nestFlowProbe();
  g.time = 300;
  probe.tick(g, 1);
  assert.equal(probe.summary(g).beyond, 1, "the food lies past reception, in the royal chamber");
});
