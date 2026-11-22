import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE, type Colony, type HoleCell, type Layer } from "../../colony.ts";
import { MODES } from "../../vocab.ts";
import {
  antsNear,
  Arena,
  at,
  cellRect,
  crossingProbe,
  F1_ANTS,
  F1_FAR,
  F1_NEAR,
  forage1,
  game1,
  heldProbe,
  lifecycleOne,
  marchProbe,
  MARCH_REACH,
  nestFlowProbe,
  occupancyProbe,
  defendWalked,
  ONE_ASSAYS,
  oneAssay,
  passWalked,
  oneArena,
  onPlane,
  outingProbe,
  ONE_PENDING,
  raidFindAssay,
  raidProbe,
  raidStopAssay,
  R1_ANTS,
  R1_DETOUR,
  R1_FAR,
  R1_NEAR,
  R1_PILE,
  route1,
  runAssay,
  runGame,
  S1_PER_TRIP,
  S1_TRIPS,
  search1,
  specMap,
  type RunResult,
  type RunSpec,
} from "../../experiment.ts";
import { STRAINS } from "../../fungus.ts";
import { Game, gameRng, isOneWorld } from "../../game.ts";
import { piSpanOf } from "../../homing.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { CRUST, generateCurtain, generateOneWorld, type OneWorld } from "../../oneWorld.ts";
import { cellAt } from "../../transect.ts";
import { OPEN, rockAt } from "../../world.ts";

// One world's assay harness (experiment.ts, docs/one-world.md U6a): arenas made the plane (oneArena), probes that count
// the plane's ants only, paint on the layer asked for.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

/** A small open arena with two nests 36 cells apart, a pile between. */
const arena = () =>
  new Arena(60, 40, true).pile(30, 20, 3, 50).build([
    { x: 12, y: 20, r: 3 },
    { x: 48, y: 20, r: 3 },
  ]);
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
  for (let y = 0; y < w.curtain.size.h; y++)
    for (let x = w.curtain.x0; x < w.curtain.x0 + w.curtain.size.w; x++) food += w.curtain.food.get(x, y);
  assert.equal(food, 0, "no food in any curtain cell");
  // Asked to keep it, the curtain is generateCurtain's, food and all (seed 5's has some).
  const kept = oneArena(arena(), 5, { buried: true });
  const ref = generateCurtain(5, kept.line);
  assert.ok(ref.foodTotal > 0, "seed 5's curtain buries food");
  assert.equal(kept.curtain.foodTotal, ref.foodTotal);
  assert.equal(kept.curtain.foodLeft, ref.foodLeft);
  // runGame's foodHome is a share of both layers' food: the curtain's buried pockets kept here, so it counts.
  const spec = onPlane(
    {
      seed: 5,
      seconds: 1 / 30,
      map: arena,
      game: { antCount: 5, rival: false },
      events: [{ at: 0, kind: "call", run: (g) => void (g.player.stored = 10) }],
    },
    { buried: true },
  );
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
      // Its vector's end (where it stands, give or take a tick's walk) is the hole plus the span × its drift: a trip T out
      // (piErrorLaw 1: the span by the distance out, ~21√T).
      const span = piSpanOf(c.params.piErrorLaw, c.params.piErrorAt, T, T);
      const ex = hx + span * c.driftSurf[i];
      const ey = hy + span * c.driftSurfY[i];
      assert.ok(Math.hypot(c.x[i] - ex, c.y[i] - ey) < 1, `ant ${i} stands at its vector's end`);
      sq += (ex - hx) ** 2 + (ey - hy) ** 2;
    }
    const rms = Math.sqrt(sq / S1_PER_TRIP);
    const span = piSpanOf(c.params.piErrorLaw, c.params.piErrorAt, T, T);
    assert.ok(
      rms > 0.05 * span && rms < 0.16 * span,
      `trip ${T}: RMS miss ${rms.toFixed(1)}, against PI_DRIFT × span = ${(0.1 * span).toFixed(0)}`,
    );
  });
  // Scored over 20 s: most 100-cell carriers (a miss of ~21 by the distance out, sight 6) are home, and each share is a share.
  const r = runAssay(search1, 2, {}, 20);
  assert.ok(r.metrics["t100.home600"] > 0.5, `t100 home in 20 s: ${r.metrics["t100.home600"]}`);
  for (const T of S1_TRIPS) for (const k of ["home120", "home600"]) assert.ok(r.metrics[`t${T}.${k}`] >= 0 && r.metrics[`t${T}.${k}`] <= 1);
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
    assert.ok(Math.hypot(c.x[i] - hx, c.y[i] - hy) < 5, `ant ${i} set down by its hole`);
  }
  // With fidelity on each forager remembers its spot (its find's offset from where it believed its hole), off none do.
  const spec = forage1.spec(2);
  const on = runGame({ ...spec, sides: { ...spec.sides, colony: { ...spec.sides?.colony, siteFidelity: 1 } }, seconds: 1 / 30 }).game
    .player;
  for (let i = 0; i < F1_ANTS; i++) {
    assert.ok(!Number.isNaN(on.foodX[i]), `ant ${i} remembers its spot`);
    assert.ok(
      Math.hypot(on.foodX[i], on.foodY[i]) > F1_NEAR - 20 && Math.hypot(on.foodX[i], on.foodY[i]) < F1_FAR + 20,
      `ant ${i}: the spot is about the spot's distance out`,
    );
    assert.ok(Number.isNaN(c.foodX[i]), `ant ${i} knows nothing of its spot with fidelity off`);
  }
  // Two seconds: at 7 cells a second nobody is within sight of a spot 40 cells out. Over the full 30 s the shares are shares,
  // and the straight way to a spot's sight is at least F1_NEAR less the sight.
  const r = runAssay(forage1, 2, {}, 2);
  assert.equal(r.metrics.reach, 0, "no forager is at a spot 40 cells away in 2 s");
  const full = runAssay(forage1, 2, {});
  assert.ok((full.metrics.reach as number) >= 0 && (full.metrics.reach as number) <= 1);
  assert.ok(
    (full.metrics.walked as number) >= F1_NEAR - 8 || Number.isNaN(full.metrics.walked),
    `walked ${full.metrics.walked}, at least the straight way to sight`,
  );
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
  for (let y = 0; y < plane.size.h; y++)
    for (let x = 0; x < plane.size.w; x++) if (plane.food.get(x, y) > 0) piles.push({ x, y, v: plane.food.get(x, y) });
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
    if (rockAt(plane, CELL[0], CELL[1]) !== OPEN) blocked = true;
  }
  assert.ok(blocked, "no clear straight line from the hole to the pile");
  // Foragers are out on the plane near the hole, exploring, empty-jawed, with a trip of 3 behind them and no path stored beyond that.
  for (let i = 0; i < R1_ANTS; i++) {
    assert.equal(c.layer[i], PLANE);
    assert.equal(c.carrying[i], 0);
    assert.equal(c.mode[i], MODES.indexOf("explore"));
    assert.ok(c.odoSurf[i] >= 3 && c.odoSurf[i] < 4, `ant ${i}: a trip of 3 behind it`);
    assert.ok(Math.hypot(c.x[i] - hx, c.y[i] - hy) < 5, `ant ${i} set down by its hole`);
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
  for (const k of ["home120", "home300", "held"]) assert.ok(full.metrics[k] >= 0 && full.metrics[k] <= 1, k);
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
  const spec: RunSpec = onPlane({
    seed: 3,
    seconds: 1 / 30,
    map: arena,
    game: { antCount: 5, rival: false },
    events: [{ at: 0, kind: "paint", channel: "alarm", x: spot.x, y: spot.y, r: 2, amount: 5 }],
  });
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

test("L on one world: the three lifecycle arms run a solo one world with the fungus landed by the hole, under the legacy ids", () => {
  assert.deepEqual(
    lifecycleOne.map((a) => a.id),
    ["lifecycle", "lifecycle-signal", "lifecycle-scent"],
  );
  for (const a of lifecycleOne) assert.ok(ONE_ASSAYS.includes(a), `${a.id} is in ONE_ASSAYS`);
  const { game, result } = runGame({ ...lifecycleOne[1]!.spec(1), seconds: 2 });
  assert.ok(game.world && game.colonies.length === 1, "a solo one world");
  assert.equal(game.landed?.colony, 0, "the fungus has landed by the first colony's hole");
  assert.equal(game.player.queen?.signal, 0.4, "the signal arm damps the queen's signal");
  assert.ok(Number.isNaN(result.metrics["t.daughterOut"]), "no daughter yet, 2 s in");
});

test("L on one world: a daughter is out only once one of her ants is up on the plane (review of #211, S2)", () => {
  const spec = lifecycleOne[1]!.spec(1);
  const { game } = runGame({ ...spec, seconds: 1 });
  const m = game.colonies[0]!;
  const nest = m.layers[PLANE]!.nest;
  const k = game.addColony({ x: nest.x, y: nest.y, antCount: 5, odour: m.nestOdour, mother: 0, reserve: 24 });
  const d = game.colonies[k]!;
  d.founding = false;
  const probe = spec.probes![0]!;
  probe.tick(game, 1);
  assert.ok(Number.isNaN(probe.summary(game)["t.daughterOut"]), "every ant of hers in the curtain: not out yet");
  d.layer[d.alive.indexOf(1)] = PLANE;
  probe.tick(game, 1);
  assert.equal(probe.summary(game)["t.daughterOut"], game.time, "one up on the plane: out");
});

test("raidProbe in one world (A11): reach and stuck on the plane only, a recruit in the curtain is home, the trail read at the hole", () => {
  const g = oneGame();
  const c = g.player;
  const own = at(12, 20);
  const rival = at(48, 20);
  const mid = at(30, 20);
  const probe = raidProbe(own, rival);
  for (let i = 5; i < c.n; i++) c.alive[i] = 0;
  for (let i = 0; i < 5; i++) c.recruited[i] = 0;
  // Ant 0, recruited on the plane by the rival's hole, reached it; ant 1, recruited in the curtain at the same x, y, is home.
  c.recruited[0] = 1;
  c.recruited[1] = 1;
  put(c, 0, PLANE, rival.x + 1, rival.y);
  put(c, 1, CURTAIN, rival.x + 1, rival.y);
  // Ant 2 mid-field on the plane; ant 3 on the plane, then down in the curtain at the same x, y; ant 4 the other way round.
  put(c, 2, PLANE, mid.x, mid.y);
  put(c, 3, PLANE, mid.x, mid.y + 6);
  put(c, 4, CURTAIN, mid.x, mid.y - 6);
  // The raid trail where it ends at the colony's hole, on the plane.
  c.paint("raid", own.x, own.y, 2, 1, PLANE);
  g.time = 20;
  probe.tick(g, 1);
  put(c, 2, PLANE, mid.x + 5, mid.y);
  put(c, 3, CURTAIN, mid.x, mid.y + 6);
  put(c, 4, PLANE, mid.x, mid.y - 6);
  g.time = 40;
  probe.tick(g, 1);
  const m = probe.summary(g);
  assert.equal(m.reached, 1 / c.params.antCount, "the plane recruit by the rival's hole, not the curtain one");
  assert.equal(m.recruited, 2 / c.params.antCount);
  assert.equal(m.recruitedAtHome, 0.5, "the curtain recruit is home");
  // Second sample: ant 2 moved 5 (not stuck), ant 3 now underground, ant 4 just up (no plane sample before): 0 of 1 stuck.
  assert.equal(m.stuck, 0, "neither the ant gone down nor the one just up is stuck on the plane");
  assert.ok(m.nestRaid > 0 && m.nestSmelt === 1, `the trail at the hole: ${m.nestRaid}`);
});

test("A11 and A12 run on one world: in ONE_ASSAYS, none pending", () => {
  for (const id of ["raidFind", "raidStop"]) {
    const a = ONE_ASSAYS.find((x) => x.id === id);
    assert.ok(a && isOneWorld(specMap(a.spec(1))), id);
  }
  assert.deepEqual(ONE_PENDING, {});
});

test("A11 and A12 remap their control runs too (deaf, straight; forage), so a gain or share compares runs on the same arena", () => {
  // Review of #210 (S1): taking the remap out of a control run passed every other test here.
  for (const [make, runs] of [
    [raidFindAssay, 3],
    [raidStopAssay, 2],
  ] as const) {
    let calls = 0;
    const assay = make((spec: RunSpec) => {
      calls++;
      return onPlane({ ...spec, seconds: 1 });
    });
    const { game, result } = runGame(assay.spec(1));
    assay.score(result, game);
    assert.equal(calls, runs, `${assay.id}: every run goes through remap`);
  }
});

test("marchProbe (S2.2c): turns a walked ant on the plane toward the other colony's hole, lets go of one that senses a stranger", () => {
  const g = oneGame();
  const c = g.player;
  const foe = g.colonies[1]!;
  const probe = marchProbe(0, 1);
  const hole = at(48, 20);
  for (let i = 3; i < c.n; i++) c.alive[i] = 0;
  for (let i = 0; i < foe.n; i++) foe.alive[i] = 0;
  // Ant 0 at the arena's west end, facing away; ant 1 the same, with a stranger 2.5 cells off (inside enemyRange + 1, outside enemyRange); ant 2 in the curtain.
  put(c, 0, PLANE, 14, 30);
  put(c, 1, PLANE, 14, 10);
  put(c, 2, CURTAIN, 14, 30);
  for (const i of [0, 1, 2]) c.heading[i] = Math.PI;
  foe.alive[0] = 1;
  put(foe, 0, PLANE, 16.5, 10);
  probe.tick(g, 1);
  const toward = Math.atan2(hole.y - c.y[0]!, hole.x - c.x[0]!);
  assert.ok(
    Math.cos(c.heading[0]! - toward) > 0.7,
    `walked toward the hole: heading ${c.heading[0]!.toFixed(2)}, the hole at ${toward.toFixed(2)}`,
  );
  assert.equal(c.heading[1], Math.fround(Math.PI), "a stranger within reach: let go, its own fight");
  assert.equal(c.heading[2], Math.fround(Math.PI), "in the curtain: its own rules");
  put(c, 0, PLANE, hole.x - 2, hole.y);
  c.heading[0] = Math.PI;
  probe.tick(g, 1);
  assert.equal(c.heading[0], Math.fround(Math.PI), `within ${MARCH_REACH} steps of the hole: let go`);
  assert.equal(probe.summary(g).marched, 1 / c.params.antCount, `one ant within ${MARCH_REACH} steps of the hole`);
});

test("A6 and A13 on one world (S2.2c): the attackers walked, each ant with its own stance", () => {
  for (const id of ["pass", "open", "defendHome"]) {
    const a = ONE_ASSAYS.find((x) => x.id === id);
    assert.ok(a, `${id} is in ONE_ASSAYS`);
    const spec = a.spec(1);
    assert.ok(isOneWorld(specMap(spec)), id);
    const march = (spec.probes ?? []).filter((p) => "walks" in p) as unknown as { walks: readonly [number, number] }[];
    assert.deepEqual(
      march.map((p) => p.walks),
      [id === "defendHome" ? [1, 0] : [0, 1]],
      `${id}: the attackers walked at the defenders' hole`,
    );
  }
});

test("oneAssay: each gate id gives its one-world twin, A6 and A13 walked (review of #235, S1)", () => {
  for (const id of [
    "bridge",
    "twin",
    "richPoor",
    "deplete",
    "alarm",
    "regulate",
    "regulateStop",
    "contact",
    "faintAlarm",
    "raidFind",
    "raidStop",
  ]) {
    const a = oneAssay(id);
    assert.ok(ONE_ASSAYS.includes(a), id);
  }
  assert.equal(oneAssay("pass"), passWalked);
  assert.equal(oneAssay("defendHome"), defendWalked);
  const ids = ONE_ASSAYS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "ONE_ASSAYS ids are unique, so oneAssay's find is unambiguous");
  assert.throws(() => oneAssay("nope"), /no one-world assay nope/);
});
