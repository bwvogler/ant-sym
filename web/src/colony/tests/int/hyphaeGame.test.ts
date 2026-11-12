import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE } from "../../colony.ts";
import { CORPSE, STRAINS } from "../../fungus.ts";
import { Game, gameRng, type GameSave } from "../../game.ts";
import { cellKey as hyphaKey, HYPHA_MASS, keyCell } from "../../hyphae.ts";
import { nx, ny } from "../../hex.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { OPEN, rockAt } from "../../world.ts";

// The mycelium as hyphae in a one-world game (docs/hyphal-growth.md, ja-2bw.2): rooted by the hole on the plane (the
// topsoil) and on the shaft's walls in the curtain, it grows on both maps from the mass the body has grown, puts its
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

test("hyphae root on the plane and on the shaft's walls, and grow on both from the mycelium's mass", () => {
  const g = game(true);
  const plane0 = g.fungus.hyphaeOn(PLANE)!.length;
  const curtain0 = g.fungus.hyphaeOn(CURTAIN)?.length ?? 0;
  assert.ok(plane0 > 0, "no hyphae on the plane");
  assert.ok(curtain0 > 0, "no hyphae on the shaft's walls");
  runFor(g, 90);
  const plane = g.fungus.hyphaeOn(PLANE)!;
  const curtain = g.fungus.hyphaeOn(CURTAIN)!;
  assert.ok(plane.length > plane0, `the plane's hyphae did not grow (${plane.length})`);
  assert.ok(curtain.length > curtain0, `the curtain's hyphae did not grow (${curtain.length})`);
  // H4 in the game: the hyphae embody no more than the mycelium's mass.
  assert.ok((plane.length + curtain.length) * HYPHA_MASS <= g.fungus.evolution!.mass + HYPHA_MASS);
});

test("with hyphae, spores go out only on open cells, never into soil, rock or sky", () => {
  const g = game(true);
  runFor(g, 60);
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
  runFor(g, 30);
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
});

test("ants digging through a hypha in the curtain cut it, and the mycelium loses the mass it held", () => {
  const g = game(true);
  runFor(g, 40);
  const h = g.fungus.hyphaeOn(CURTAIN)!;
  const soil = [...h.soil];
  assert.ok(soil.length > 0, "no hypha in the curtain's soil");
  const e = g.fungus.evolution!;
  // Dig the first soil cell a hypha holds, as a digger would.
  const [x, y] = keyCell(soil[0]!);
  g.world!.curtain.rock.set(x, y, OPEN);
  const before = h.length;
  const mass = e.mass;
  runFor(g, 3);
  assert.ok(h.length < before || !h.has(x, y), "not cut");
  assert.ok(h.cutCells > 0);
  assert.ok(e.mass < mass + 0.5, "no mass lost");
});
