import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, MODES, PLANE, type Colony, type HoleCell, type Layer } from "../colony.ts";
import { antsNear, Arena, at, cellRect, crossingProbe, F1_ANTS, F1_FAR, F1_NEAR, forage1, game1, heldProbe, nestFlowProbe, occupancyProbe, ONE_ASSAYS, oneArena, onPlane, outingProbe, R1_ANTS, R1_DETOUR, R1_FAR, R1_NEAR, R1_PILE, route1, runAssay, runGame, S1_PER_TRIP, S1_TRIPS, search1, specMap, type RunResult, type RunSpec } from "../experiment.ts";
import { STRAINS } from "../fungus.ts";
import { Game, gameRng, isOneWorld } from "../game.ts";
import { CELL, cellOf, centreX, centreY } from "../hex.ts";
import { CRUST, generateCurtain, generateOneWorld, type OneWorld } from "../oneWorld.ts";
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
  // runGame's foodHome is a share of both layers' food: the curtain's buried pockets kept here, so it counts.
  const spec = onPlane({ seed: 5, seconds: 1 / 30, map: arena, game: { antCount: 5, rival: false }, events: [{ at: 0, kind: "call", run: (g) => void (g.player.stored = 10) }] }, { buried: true });
  const { game, result } = runGame(spec);
  const curtainFood = game.world!.curtain.foodTotal;
  assert.ok(curtainFood > 0);
  assert.equal(result.metrics["you.foodHome"], game.player.stored / (game.world!.plane.foodTotal + curtainFood));
  // onPlane, like oneArena, buries nothing unless asked.
  const bare = specMap(onPlane({ seed: 5, seconds: 1, map: arena }));
  assert.ok(isOneWorld(bare) && bare.curtain.foodTotal === 0);
});

test("game1 (G1) scores the worst colony on both layers against the bound of 2", () => {
  const g = new Game(generateOneWorld(1), { antCount: 5, rivalAnts: 5 }, gameRng(1));
  const r = (metrics: Record<string, number>) => ({ seed: 1, metrics }) as unknown as RunResult;
  assert.equal(game1.score(r({ "you.maxHeld": 2, "rival.maxHeld": 1, "you.maxHeldPlane": 0 }), g).pass, 1);
  const s = game1.score(r({ "you.maxHeld": 1, "rival.maxHeld": 3, "rival.maxHeldPlane": 0 }), g);
  assert.equal(s.pass, 0, "3 held in the rival's tunnels fail the bound");
  assert.equal(s.maxHeld, 3);
  assert.equal(s.maxHeldPlane, 0);
});

test("ONE_ASSAYS: every one runs on one world, A6's open-ground control too", () => {
  for (const a of ONE_ASSAYS) {
    assert.ok(isOneWorld(specMap(a.spec(1))), a.id);
    if (a.control) assert.ok(isOneWorld(specMap(a.control(1))), `${a.id}'s control`);
  }
  assert.ok(ONE_ASSAYS.find((a) => a.id === "pass")?.control, "A6 runs its control");
});

test("S1 sets its carriers down on the plane at their vector's end, the miss growing with the trip, and scores them", () => {
  // One tick: the set-up has run (at t = 0) and nobody has gone far.
  const { game } = runGame({ ...search1.spec(2), seconds: 1 / 30 });
  const c = game.player;
  const hc = c.holeCells[c.params.nest] as HoleCell;
  const hx = centreX(hc.px, hc.py);
  const hy = centreY(hc.py);
  S1_TRIPS.forEach((T, j) => {
    let sq = 0;
    for (let i = j * S1_PER_TRIP; i < (j + 1) * S1_PER_TRIP; i++) {
      assert.equal(c.layer[i], PLANE);
      assert.equal(c.carrying[i], 1);
      assert.equal(c.mode[i], MODES.indexOf("return"));
      assert.equal(c.odoSurf[i], T, "its trip");
      // Its vector's end (where it stands, give or take a tick's walk) is the hole plus T × its drift.
      const ex = hx + T * (c.driftSurf[i] as number);
      const ey = hy + T * (c.driftSurfY[i] as number);
      assert.ok(Math.hypot((c.x[i] as number) - ex, (c.y[i] as number) - ey) < 1, `ant ${i} stands at its vector's end`);
      sq += (ex - hx) ** 2 + (ey - hy) ** 2;
    }
    const rms = Math.sqrt(sq / S1_PER_TRIP);
    assert.ok(rms > 0.05 * T && rms < 0.16 * T, `trip ${T}: RMS miss ${rms.toFixed(1)}, against PI_DRIFT × T = ${(0.1 * T).toFixed(0)}`);
  });
  // Scored over 20 s: most 100-cell carriers (a miss of ~10, sight 6) are home, and each share is a share.
  const r = runAssay(search1, 2, {}, 20);
  assert.ok((r.metrics["t100.home600"] as number) > 0.5, `t100 home in 20 s: ${r.metrics["t100.home600"]}`);
  for (const T of S1_TRIPS) for (const k of ["home120", "home600"]) assert.ok((r.metrics[`t${T}.${k}`] as number) >= 0 && (r.metrics[`t${T}.${k}`] as number) <= 1);
  assert.equal(r.metrics.pass, 0, "not all home in 20 s");
});

test("F1 sets foragers down at their hole, exploring, each with a spot 40-80 cells out on open ground, and scores their reach", () => {
  const { game } = runGame({ ...forage1.spec(2), seconds: 1 / 30 });
  const c = game.player;
  const hc = c.holeCells[c.params.nest] as HoleCell;
  const hx = centreX(hc.px, hc.py);
  const hy = centreY(hc.py);
  for (let i = 0; i < F1_ANTS; i++) {
    assert.equal(c.layer[i], PLANE);
    assert.equal(c.carrying[i], 0);
    assert.equal(c.mode[i], MODES.indexOf("explore"));
    assert.ok(Math.hypot((c.x[i] as number) - hx, (c.y[i] as number) - hy) < 5, `ant ${i} set down by its hole`);
  }
  // With fidelity on each forager remembers its spot (its find's offset from where it believed its hole), off none do.
  const spec = forage1.spec(2);
  const on = runGame({ ...spec, sides: { ...spec.sides, colony: { ...spec.sides?.colony, siteFidelity: 1 } }, seconds: 1 / 30 }).game.player;
  for (let i = 0; i < F1_ANTS; i++) {
    assert.ok(!Number.isNaN(on.foodX[i] as number), `ant ${i} remembers its spot`);
    assert.ok(Math.hypot(on.foodX[i] as number, on.foodY[i] as number) > F1_NEAR - 20 && Math.hypot(on.foodX[i] as number, on.foodY[i] as number) < F1_FAR + 20, `ant ${i}: the spot is about the spot's distance out`);
    assert.ok(Number.isNaN(c.foodX[i] as number), `ant ${i} knows nothing of its spot with fidelity off`);
  }
  // Two seconds: at 7 cells a second nobody is within sight of a spot 40 cells out. Over the full 30 s the shares are shares,
  // and the straight way to a spot's sight is at least F1_NEAR less the sight.
  const r = runAssay(forage1, 2, {}, 2);
  assert.equal(r.metrics.reach, 0, "no forager is at a spot 40 cells away in 2 s");
  const full = runAssay(forage1, 2, {});
  assert.ok((full.metrics.reach as number) >= 0 && (full.metrics.reach as number) <= 1);
  assert.ok((full.metrics.walked as number) >= F1_NEAR - 8 || Number.isNaN(full.metrics.walked), `walked ${full.metrics.walked}, at least the straight way to sight`);
  assert.ok(F1_NEAR < F1_FAR);
});

test("R1 puts one pile in a pocket (no clear line, a way round at least 1.8 times the straight line) and sets foragers out on the way to it", () => {
  const { game, result } = runGame({ ...route1.spec(4), seconds: 1 / 30 });
  const c = game.player;
  const plane = game.world!.plane;
  const hc = c.holeCells[c.params.nest] as HoleCell;
  const hx = centreX(hc.px, hc.py);
  const hy = centreY(hc.py);
  // Exactly one pile, of R1_PILE, and it is the only food on the plane.
  const piles: { x: number; y: number; v: number }[] = [];
  for (let y = 0; y < plane.size.h; y++) for (let x = 0; x < plane.size.w; x++) if (plane.food.get(x, y) > 0) piles.push({ x, y, v: plane.food.get(x, y) });
  assert.equal(piles.length, 1);
  assert.equal(piles[0]!.v, R1_PILE);
  assert.equal(plane.foodLeft, R1_PILE);
  const px = centreX(piles[0]!.x, piles[0]!.y);
  const py = centreY(piles[0]!.y);
  const d = Math.hypot(px - hx, py - hy);
  assert.ok(d >= R1_NEAR && d <= R1_FAR, `the pile is ${d.toFixed(1)} cells out`);
  assert.equal(result.metrics.dist, d);
  assert.ok((result.metrics.way as number) >= R1_DETOUR * d, `a way round of ${result.metrics.way} for ${d.toFixed(1)} straight`);
  let blocked = false;
  for (let t = 0; t < 1; t += 0.5 / d) {
    cellOf(hx + t * (px - hx), hy + t * (py - hy));
    if (rockAt(plane, CELL[0] as number, CELL[1] as number) !== OPEN) blocked = true;
  }
  assert.ok(blocked, "no clear straight line from the hole to the pile");
  // Foragers are out on the plane near the hole, exploring, empty-jawed, with a trip of 3 behind them and no path stored beyond that.
  for (let i = 0; i < R1_ANTS; i++) {
    assert.equal(c.layer[i], PLANE);
    assert.equal(c.carrying[i], 0);
    assert.equal(c.mode[i], MODES.indexOf("explore"));
    assert.ok((c.odoSurf[i] as number) >= 3 && (c.odoSurf[i] as number) < 4, `ant ${i}: a trip of 3 behind it`);
    assert.ok(Math.hypot((c.x[i] as number) - hx, (c.y[i] as number) - hy) < 5, `ant ${i} set down by its hole`);
  }
  // A seed with no pocket (1) has no pile, scores no pickups and reports no pass.
  const none = runAssay(route1, 1, {}, 1);
  assert.equal(none.metrics.pockets, 0);
  assert.equal(none.metrics.picked, 0);
  assert.ok(!("pass" in none.metrics));
});

test("R1 scores each pocket pickup's way home: the shares are shares", () => {
  assert.ok((runAssay(route1, 7, {}, 2).metrics.picked as number) === 0, "nobody is at a pile 30 cells out in 2 s");
  // A game that runs to R1_SECONDS scores the pickups of its first 120 s and each is home or not.
  const full = runAssay(route1, 7, {});
  assert.ok((full.metrics.picked as number) > 0 && (full.metrics.picked as number) <= R1_ANTS);
  for (const k of ["home120", "home300", "held"]) assert.ok((full.metrics[k] as number) >= 0 && (full.metrics[k] as number) <= 1, k);
  assert.ok((full.metrics.home120 as number) <= (full.metrics.home300 as number));
  assert.equal(full.metrics.wrong, 0);
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
