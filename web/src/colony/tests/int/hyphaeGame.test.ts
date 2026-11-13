import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE } from "../../colony.ts";
import { CORPSE, STRAINS } from "../../fungus.ts";
import { Game, gameRng, type GameSave } from "../../game.ts";
import { cellKey as hyphaKey, HYPHA_MASS, keyCell } from "../../hyphae.ts";
import { CELL, cellOf, centreX, centreY, dirOf, hexDistance, nx, ny } from "../../hex.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { columnsOver } from "../../transect.ts";
import { OPEN, rockAt, SOIL } from "../../world.ts";

// The mycelium as hyphae in a one-world game (docs/hyphal-growth.md, ja-2bw.2): rooted by the hole on the plane (the
// topsoil), it reaches the curtain by growing down the hole onto the shaft's walls (ja-2bw.14), grows on both maps from the mass the body has grown, puts its
// spores out only on open cells, and saves and loads as it was.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

/** Seed 7's small plane (160 × 100), hyphae on, the fungus landed by colony 0's hole and evolving. */
function game(hyphae: boolean): Game {
  const g = new Game(
    generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }),
    { antCount: 40, rivalAnts: 40, autoFound: false, fungus: { hyphae } },
    gameRng(7),
  );
  g.land(0, GARDEN, { evolve: true });
  return g;
}

const runFor = (g: Game, seconds: number) => {
  const end = g.time + seconds;
  while (g.time < end) g.tick(1 / 30);
};

/** Run until a plane tip has come to the hole and crossed down it (ja-2bw.14), at most `limit` s; returns when. */
function crossDown(g: Game, limit = 90): number {
  while (!g.fungus.hyphaeOn(CURTAIN) && g.time < limit) runFor(g, 1);
  assert.ok(g.fungus.hyphaeOn(CURTAIN), `no tip crossed down the hole in ${limit} s`);
  return g.time;
}

test("the patch lands on the hole's inner side, and its hyphae reach the curtain by growing down the hole (ja-2bw.14)", () => {
  const g = game(true);
  const line = g.world!.line;
  const plane = g.fungus.hyphaeOn(PLANE)!;
  // Every patch cell on the line lies over a column between the holes, never the margin past an end hole.
  let onLine = 0;
  for (const k of plane.parent.keys()) {
    const [x, y] = keyCell(k);
    for (const s of columnsOver(line, x, y)) {
      onLine++;
      assert.ok(s > line.sHole[0]! && s < line.sHole[line.sHole.length - 1]!, `patch cell over column ${s}, outside the holes`);
    }
  }
  assert.ok(onLine > 0, "the patch is not on the line");
  assert.equal(g.fungus.hyphaeOn(CURTAIN), null, "hyphae in the curtain before any tip reached the hole");
  const t = crossDown(g);
  const curtain = g.fungus.hyphaeOn(CURTAIN)!;
  // Its first tips root on the shaft's walls: soil, below the surface, beside the dug shaft.
  assert.ok(curtain.tips.length > 0, `no tip in the curtain after crossing at ${t} s`);
  for (const [k, p] of curtain.parent)
    if (p === -1) assert.equal(rockAt(g.world!.curtain, ...keyCell(k)), SOIL, `a root off the wall at ${keyCell(k)}`);
});

test("hyphae grow on both maps from the mycelium's mass", () => {
  const g = game(true);
  const plane0 = g.fungus.hyphaeOn(PLANE)!.length;
  assert.ok(plane0 > 0, "no hyphae on the plane");
  crossDown(g);
  const curtain0 = g.fungus.hyphaeOn(CURTAIN)!.length;
  runFor(g, 60);
  const plane = g.fungus.hyphaeOn(PLANE)!;
  const curtain = g.fungus.hyphaeOn(CURTAIN)!;
  assert.ok(plane.length > plane0, `the plane's hyphae did not grow (${plane.length})`);
  assert.ok(curtain.length > curtain0, `the curtain's hyphae did not grow (${curtain.length})`);
  // H4 in the game: the hyphae embody no more than the mycelium's mass.
  assert.ok((plane.length + curtain.length) * HYPHA_MASS <= g.fungus.evolution!.mass + HYPHA_MASS);
});

test("with hyphae, spores go out only on open cells, never into soil, rock or sky", () => {
  const g = game(true);
  crossDown(g);
  runFor(g, 30);
  for (const l of [PLANE, CURTAIN]) {
    const map = l === PLANE ? g.world!.plane : g.world!.curtain;
    const { spores } = g.fungus.sporesOn(l)!;
    const h = g.fungus.hyphaeOn(l)!;
    for (const k of h.parent.keys()) {
      const [x, y] = keyCell(k);
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        if (spores.get(x + dx, y + dy) > 0)
          assert.equal(rockAt(map, x + dx, y + dy), OPEN, `spores in a solid cell at ${x + dx},${y + dy} (layer ${l})`);
    }
  }
});

test("a game with hyphae saves and loads as it was", () => {
  const g = game(true);
  crossDown(g);
  runFor(g, 10);
  const saved = JSON.parse(JSON.stringify(g.save())) as GameSave;
  const back = game(true);
  back.load(JSON.parse(JSON.stringify(saved)) as GameSave);
  assert.deepEqual(JSON.parse(JSON.stringify(back.save())), saved);
  assert.deepEqual(back.fungus.hyphaeOn(CURTAIN)!.save(), g.fungus.hyphaeOn(CURTAIN)!.save());
});

test("with hyphae off, the fungus grows none", () => {
  const g = game(false);
  runFor(g, 10);
  assert.equal(g.fungus.hyphaeOn(PLANE), null);
  assert.equal(g.fungus.hyphaeOn(CURTAIN), null);
});

test("a host that died of the fungus, buried on the midden, is a new start that fruits for free", () => {
  const g = game(true);
  const e = g.fungus.evolution!;
  const plane = g.fungus.hyphaeOn(PLANE)!;
  const tips = plane.tips.length;
  const mass = e.mass;
  // The burial hook as an undertaker calls it, a cell clear of the landing patch.
  const [x, y] = [60, 40];
  g.colonies[0]!.onBury!({ x, y, held: -1, died: g.time, load: 0.5, strain: e.strain }, PLANE);
  assert.equal(plane.tips.length, tips + 2, "two tips set out from the corpse");
  assert.ok(plane.has(x, y));
  assert.equal(g.fungus.corpsesOn(PLANE).get(hyphaKey(x, y)), CORPSE.spores);
  assert.ok(e.mass >= mass + CORPSE.mass - 1e-9, "the cadaver fed the mycelium");
  runFor(g, 10);
  assert.ok(g.fungus.sporesOn(PLANE)!.spores.get(x, y) > 0, "no spores on the corpse");
  const left = g.fungus.corpsesOn(PLANE).get(hyphaKey(x, y))!;
  assert.ok(left < CORPSE.spores && left > 0, `${left} left`);
  // An uninfected corpse is not a start.
  g.colonies[0]!.onBury!({ x: 80, y: 40, held: -1, died: g.time, load: 0, strain: e.strain }, PLANE);
  assert.equal(g.fungus.corpsesOn(PLANE).has(hyphaKey(80, 40)), false);
});

test("a hypha that reaches a corpse on the midden colonises it", () => {
  const g = game(true);
  const plane = g.fungus.hyphaeOn(PLANE)!;
  const tip = plane.tips[0]!;
  // A corpse two cells ahead of the first tip.
  const ax = nx(tip.x, tip.y, tip.heading);
  const ay = ny(tip.y, tip.heading);
  const cx = nx(ax, ay, tip.heading);
  const cy = ny(ay, tip.heading);
  const was = g.fungus.corpseAt!;
  g.fungus.corpseAt = (l, x, y) => (l === PLANE && x === cx && y === cy ? 1 : was(l, x, y));
  runFor(g, 60);
  assert.ok(g.fungus.corpsesOn(PLANE).has(hyphaKey(cx, cy)), "not colonised");
});

test("corpses colonised are saved", () => {
  const g = game(true);
  g.colonies[0]!.onBury!({ x: 60, y: 40, held: -1, died: 0, load: 0.5, strain: g.fungus.evolution!.strain }, PLANE);
  runFor(g, 5);
  const saved = JSON.parse(JSON.stringify(g.save())) as GameSave;
  const back = game(true);
  back.load(JSON.parse(JSON.stringify(saved)) as GameSave);
  assert.deepEqual([...back.fungus.corpsesOn(PLANE)], [...g.fungus.corpsesOn(PLANE)]);
});

test("with hyphae off, a corpse is no start", () => {
  const g = game(false);
  g.colonies[0]!.onBury!({ x: 60, y: 40, held: -1, died: 0, load: 0.5, strain: g.fungus.evolution!.strain }, PLANE);
  assert.equal(g.fungus.corpsesOn(PLANE).size, 0);
});

test("a host that dies on the plane is a new start where it lies; a clean ant leaves nothing", () => {
  const g = game(true);
  const c = g.colonies[0]!;
  const plane = (i: number) => c.alive[i] && c.layer[i] === PLANE;
  const pick = (from: number) => {
    for (let i = from; i < c.n; i++) if (plane(i)) return i;
    return -1;
  };
  let i = pick(0);
  if (i < 0) {
    runFor(g, 30);
    i = pick(0);
  }
  assert.ok(i >= 0, "no ant on the plane");
  c.load[i] = 0.5;
  c.strain[i] = g.fungus.evolution!.strain;
  const before = g.fungus.corpsesOn(PLANE).size;
  c.kill(i);
  assert.equal(g.fungus.corpsesOn(PLANE).size, before + 1);
  const j = pick(i + 1);
  assert.ok(j >= 0);
  c.load[j] = 0;
  c.kill(j);
  assert.equal(g.fungus.corpsesOn(PLANE).size, before + 1);
  // A host dying underground is no start on the plane (its cell is the curtain's).
  let u = -1;
  for (let k = 0; k < c.n; k++) if (c.alive[k] && c.layer[k] === CURTAIN) u = k;
  assert.ok(u >= 0, "no ant underground");
  c.load[u] = 0.5;
  c.strain[u] = g.fungus.evolution!.strain;
  c.kill(u);
  assert.equal(g.fungus.corpsesOn(PLANE).size, before + 1);
});

test("ants digging through a hypha in the curtain cut that cell, and the mycelium loses the mass it held; what grew beyond lives on (ja-2bw.19)", () => {
  const g = game(true);
  crossDown(g);
  runFor(g, 30);
  const h = g.fungus.hyphaeOn(CURTAIN)!;
  // A soil cell a hypha holds that something grew from.
  const parents = new Set(h.parent.values());
  const k = [...h.soil].find((c) => parents.has(c));
  assert.ok(k !== undefined, "no hypha in the curtain's soil with a cell grown from it");
  const beyond = [...h.parent].filter(([, p]) => p === k).map(([c]) => c);
  const e = g.fungus.evolution!;
  const lost: number[] = [];
  const lose = e.lose.bind(e);
  e.lose = (m: number) => {
    lost.push(m);
    lose(m);
  };
  // Dig it, as a digger would.
  const [x, y] = keyCell(k);
  g.world!.curtain.rock.set(x, y, OPEN);
  const cut = h.cutCells;
  while (h.has(x, y)) runFor(g, 1 / 30);
  assert.equal(h.cutCells, cut + 1, "more than the dug cell was cut");
  assert.deepEqual(lost, [HYPHA_MASS], "the mass lost is the dug cell's");
  for (const c of beyond) assert.ok(h.has(...keyCell(c)), `${keyCell(c)} beyond the cut died`);
});

test("a spore spot a tip fruited on puts out spores, until it is filled in", () => {
  const g = game(true);
  crossDown(g);
  const h = g.fungus.hyphaeOn(CURTAIN)!;
  for (let t = 0; t < 240 && h.fruits.length === 0; t += 10) runFor(g, 10);
  assert.ok(h.fruits.length > 0, "no tip fruited in 240 s");
  const [x, y] = keyCell(h.fruits[0]!);
  const { spores } = g.fungus.sporesOn(CURTAIN)!;
  runFor(g, 5);
  assert.ok(spores.get(x, y) > 0, "the spot puts out no spores");
  // Filled in (backfill): it fruits no more, and its spores only fade.
  g.world!.curtain.rock.set(x, y, SOIL);
  runFor(g, 3);
  const was = spores.get(x, y);
  runFor(g, 5);
  assert.ok(spores.get(x, y) <= was, "a filled spot kept fruiting");
});

test("a later tip crossing down the hole puts a fresh tip on a wall cell whose tip is gone, never a second one beside a tip (ja-2bw.16)", () => {
  const g = game(true);
  crossDown(g);
  const h = g.fungus.hyphaeOn(CURTAIN)!;
  const nest = g.colonies[0]!.layers[PLANE]!.nest;
  cellOf(nest.x, nest.y);
  const e = g.fungus.crossAt!(CELL[0], CELL[1])!;
  const walls = [...h.parent].filter(([, p]) => p === -1).map(([k]) => k);
  assert.ok(walls.length > 0);
  // A crossing puts no tip on a cell that has one.
  g.fungus.rootShaft(CURTAIN, e.x, e.y);
  const cells = h.tips.map((t) => hyphaKey(t.x, t.y));
  assert.equal(new Set(cells).size, cells.length, "two tips on one wall cell");
  // Every tip gone (grown on, fruited or cut): the next crossing seeds each wall cell again.
  h.tips.length = 0;
  g.fungus.rootShaft(CURTAIN, e.x, e.y);
  assert.deepEqual(h.tips.map((t) => hyphaKey(t.x, t.y)).sort(), [...walls].sort(), "fresh tips on the walls");
});

test("a crossing tip leaves the plane: no plane tip stays in a hole's mouth, so the walls are rooted once, not every round (review of #130, S1)", () => {
  const g = game(true);
  let rooted = 0;
  const was = g.fungus.rootShaft.bind(g.fungus);
  g.fungus.rootShaft = (l, x, y) => {
    rooted++;
    was(l, x, y);
  };
  const plane = g.fungus.hyphaeOn(PLANE)!;
  const end = g.time + 120;
  while (g.time < end) {
    g.tick(1 / 30);
    for (const t of plane.tips) assert.equal(g.fungus.crossAt!(t.x, t.y), null, `a plane tip left in the hole's mouth at ${t.x},${t.y}`);
  }
  assert.ok(rooted >= 1 && rooted <= 4, `the shaft's walls rooted ${rooted} times in 120 s`);
});

test("a daughter founded with the fungus in her queen gets a patch by her own hole, and her curtain's hyphae come only by crossing (review of #130, S2)", () => {
  const g = game(true);
  const e = g.fungus.evolution!;
  const f = { mother: 0, x: g.colonies[0]!.nest.x, y: g.colonies[0]!.nest.y, load: 0.5, strain: e.strain, at: g.time, food: 2 };
  g.flights.push(f);
  const plane = g.fungus.hyphaeOn(PLANE)!;
  const cells = plane.length;
  const tips = plane.tips.length;
  const curtain = g.fungus.hyphaeOn(CURTAIN)?.length ?? 0;
  const k = g.found(f);
  assert.ok(k > 0, "she founded");
  const nest = g.colonies[k]!.layers[PLANE]!.nest;
  cellOf(nest.x, nest.y);
  const [hx, hy] = [CELL[0], CELL[1]];
  // A new patch by her hole, its tips set out; nothing new in the curtain yet.
  assert.ok(plane.length > cells && plane.tips.length > tips, "no patch for her");
  const near = [...plane.parent.keys()].filter((key) => hexDistance(...keyCell(key), hx, hy) <= Math.round(nest.r) + 6);
  assert.ok(near.length > 0, "her patch is not by her hole");
  assert.equal(g.fungus.hyphaeOn(CURTAIN)?.length ?? 0, curtain, "her curtain rooted at founding");
  // Her patch lies on her hole's inner side (toward the neighbouring hole), and its first tip aims at her hole from its rim cell.
  const others = g.colonies.filter((_, i) => i !== k).map((o) => o.layers[PLANE]!.nest);
  const next = others.reduce((a, b) => (Math.hypot(b.x - nest.x, b.y - nest.y) < Math.hypot(a.x - nest.x, a.y - nest.y) ? b : a));
  const mid = near.map(keyCell).reduce(([sx, sy], [x, y]) => [sx + centreX(x, y) / near.length, sy + centreY(y) / near.length], [0, 0]);
  assert.ok(Math.hypot(next.x - mid[0]!, next.y - mid[1]!) < Math.hypot(next.x - nest.x, next.y - nest.y), "her patch is past her hole");
  const t = plane.tips[tips]!;
  assert.equal(t.heading, dirOf(Math.atan2(nest.y - centreY(t.y), nest.x - centreX(t.x, t.y))), "her first tip does not head for her hole");
});

test("the patch's tip aimed at the hole never starts with its own patch ahead (ja-2bw.17: seed 9's fused at once and no hypha reached the hole)", () => {
  for (const seed of [7, 9, 12]) {
    const g = new Game(generateOneWorld(seed), { antCount: 8, rivalAnts: 8, autoFound: false, fungus: { hyphae: true } }, gameRng(seed));
    g.land(0, GARDEN, { evolve: true });
    const plane = g.fungus.hyphaeOn(PLANE)!;
    const t = plane.tips[0]!;
    assert.ok(!plane.has(nx(t.x, t.y, t.heading), ny(t.y, t.heading)), `seed ${seed}: its own patch ahead of the aimed tip`);
  }
});

test("in the game, a hypha dug through in the curtain regrows from its stump into the dug cell (ja-2bw.15)", () => {
  const g = game(true);
  crossDown(g);
  runFor(g, 30);
  const h = g.fungus.hyphaeOn(CURTAIN)!;
  // A soil cell a hypha holds that grew from another (not a root), so it leaves a stump.
  const k = [...h.soil].find((c) => (h.parent.get(c) ?? -1) !== -1)!;
  assert.ok(k !== undefined, "no hypha grown in the curtain's soil");
  const [x, y] = keyCell(k);
  g.world!.curtain.rock.set(x, y, OPEN);
  runFor(g, 3);
  assert.ok(!h.has(x, y), "not cut");
  assert.ok(h.stumps.size > 0, "no stump left");
  for (let t = 0; t < 60 && !h.has(x, y); t++) runFor(g, 1);
  assert.ok(h.has(x, y), "nothing regrew into the dug cell in 60 s");
  assert.equal(rockAt(g.world!.curtain, x, y), OPEN, "the cell is still dug: the hypha runs on its back wall");
});
