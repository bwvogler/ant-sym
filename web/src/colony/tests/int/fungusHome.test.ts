import { test } from "node:test";
import assert from "node:assert/strict";
import { LARVA } from "../../brood.ts";
import { CURTAIN, PLANE } from "../../colony.ts";
import { type Situation } from "../../vocab.ts";
import { decodeFungal } from "../../fungalPolicy.ts";
import { Fungus, LETHAL, PRESETS, preset, STRAINS } from "../../fungus.ts";
import { Game } from "../../game.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { MARKS } from "../../pheromone.ts";
import { MAX_MASK, Recognition } from "../../recognition.ts";
import { digCell, mulberry32, OPEN, rockAt } from "../../world.ts";
import { broodChamber, oneColony, own, planeHole, smallOne } from "../builders.ts";

// Nest slice 8 (docs/nest-and-home.md §4): the fungus on the new home. What it feels underfoot is the nest's places; it can blunt
// or swap a host's floor marks (muddle); a lethal strain-gated crown kills the queen and brood; a Bloom host's corpse
// on the midden sporulates. In one world, where the nest is the curtain's (S2.3c: until then the side view's).

const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");
const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

test("what the fungus feels underfoot in one world: the plane's open ground, a tunnel, a chamber's floor, the queen's mark", () => {
  const g = new Game(smallOne(2), { antCount: 5, rivalAnts: 1 }, mulberry32(1));
  const a = g.player;
  const curtain = g.world!.curtain;
  const hole = curtain.nests[0]!.entrance!;
  const p = planeHole(own(a));
  // One world's own nest chamber is the royal one, its floor her mark: a brood chamber dug beside it is a chamber's floor.
  const { cell } = broodChamber(curtain);
  // own brood chamber; own shaft; the plane's open ground; the rival's chamber (a chamber's floor all the same: whose it is, is touch's); by the queen
  const at: [number, number, number][] = [
    [CURTAIN, centreX(cell[0], cell[1]), centreY(cell[1])],
    [CURTAIN, hole.x, hole.y + 2],
    [PLANE, p.x + 20, p.y],
    [CURTAIN, curtain.nests[1]!.x, curtain.nests[1]!.y],
    [CURTAIN, a.queen!.x, a.queen!.y],
  ];
  g.fungus.hosts = 5;
  for (let k = 0; k < 30; k++) {
    at.forEach(([l, x, y], i) => {
      a.putAnt(i, l, x, y);
      a.load[i] = 0.5;
      a.strain[i] = GARDEN;
    });
    g.fungus.hosts = 5;
    g.tick(1 / 30);
  }
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => decodeFungal(a.fungal[i]!).place),
    ["chamber", "tunnel", "outside", "chamber", "queen"],
  );
  // The task the fungus reads is the host's age band: founders are any age, so each is one of the three.
  for (let i = 0; i < 5; i++) assert.ok(["nurse", "inside", "forager"].includes(decodeFungal(a.fungal[i]!).task));
});

test("muddle: a host misreads its floor marks: in a brood chamber it is asked as in a store; blunted, it can't tell", () => {
  const asked: Situation[] = [];
  const { map, c } = oneColony(1, { maxAnts: 1 }, (s) => (asked.push(s), "explore"));
  const ch = map.chambers!;
  ch.list.find((k) => k.colony === 0 && k.role === "royal")!.role = "brood"; // stand-in: the founding chamber read as brood
  c.x[0] = map.nest.x;
  c.y[0] = map.nest.y;
  c.tick(1 / 30);
  assert.equal(asked.at(-1)!.homeTrail, "brood");
  const f = new Fungus(map);
  f.express(c, 0, preset("muddle"), 1);
  assert.ok(c.swapMarks[0]! >= 0.5);
  c.mode[0] = 1; // a new question
  c.tick(1 / 30);
  // gainMarks 0.3 < ½ at full load: it can't tell the chamber at all.
  assert.equal(asked.at(-1)!.homeTrail, "tunnel");
  c.gainMarks[0] = 1; // marks as they are, swap kept
  c.mode[0] = 2;
  c.tick(1 / 30);
  assert.equal(asked.at(-1)!.homeTrail, "store", "brood smells like store");
});

test("crown (lethal, off by default): a host by the queen kills her and the brood it touches", () => {
  assert.ok(LETHAL.has("crown"));
  const { map, c } = oneColony(2);
  assert.ok(!new Fungus(map).menu.has("crown"), "off the menu by default");
  cellOf(c.queen!.x, c.queen!.y);
  const larva = c.brood.add(CELL[0], CELL[1], map.chambers!.at(CELL[0], CELL[1]));
  larva.stage = LARVA;
  // Nothing to feed it, so it stays a larva while the crown works (fed, it pupated and hatched first on some draws): no
  // founding stock, and no second ant to forage.
  c.feed(-c.larder);
  c.kill(1);
  c.x[0] = c.queen!.x;
  c.y[0] = c.queen!.y;
  const f = new Fungus(map);
  f.express(c, 0, preset("crown"), 1);
  c.tick(1 / 30);
  assert.ok(!c.orphaned, "not at once: CROWN_RATE a second");
  for (let k = 0; k < 30 * 120 && (!c.orphaned || c.brood.size > 0); k++) {
    c.x[0] = c.queen!.x; // kept by her (the larva lies in her cell)
    c.y[0] = c.queen!.y;
    c.tick(1 / 30);
  }
  assert.ok(c.orphaned, "the queen is dead");
  assert.equal(c.brood.size, 0, "and the brood by her");
  assert.equal(c.broodKilled, 1);
  assert.ok(PRESETS.some((v) => v.id === "muddle") && !LETHAL.has("marks"), "muddling the marks is not lethal");
});

test("crown below a high load: a lightly loaded host by the queen kills her too, in minutes", () => {
  // Review of #27: crown acted only from a high load (0.7), which grooming takes Bloom's hosts below within seconds; in a
  // game no queen died. A host at 0.2 (what the UI brush doses, a little more) kills her at a fifth of the rate.
  const { map, c } = oneColony(1, { maxAnts: 2 });
  const f = new Fungus(map);
  f.express(c, 0, preset("crown"), 0.2);
  let t = 0;
  for (; t < 900 && !c.orphaned; t += 1 / 30) {
    c.x[0] = c.queen!.x;
    c.y[0] = c.queen!.y;
    c.tick(1 / 30);
  }
  assert.ok(c.orphaned, "the queen is dead");
  assert.ok(t > 5, `not at once: ${t.toFixed(0)} s`);
});

test("on the midden a Bloom host's corpse sporulates; a Garden host's doesn't", () => {
  // On one world's plane, by the hole, where an undertaker puts it (int/oneWorldGame covers the carrying up).
  const spores = (strain: number) => {
    const g = new Game(smallOne(2), { antCount: 60, rival: false }, mulberry32(5));
    const c = g.player;
    const p = planeHole(own(c));
    const k = { x: 0, y: 0, held: -1, died: 0, load: 0.8, strain };
    cellOf(p.x + 12, p.y);
    k.x = CELL[0];
    k.y = CELL[1];
    assert.ok(c.onBury, "the game hears of each burial");
    c.onBury!(k); // as #dropOut does when an undertaker puts it on the midden
    return g.fungus.spores.get(k.x, k.y);
  };
  assert.ok(spores(BLOOM) > 0, "Bloom");
  assert.equal(spores(GARDEN), 0, "Garden");
});

test("crown grows with a host's load; muddle and crown are on the menu where there is a nest", () => {
  const { map, c } = oneColony(1, { maxAnts: 1 });
  const f = new Fungus(map);
  // Review of #27: from a high load only, grooming took every host below it within seconds and no queen died in a game.
  // Now it is the spores a host passes on as it tends her: a lighter host is likelier to fail, not unable.
  f.express(c, 0, preset("crown"), 0.2);
  assert.ok(Math.abs(c.regicide[0]! - 0.2) < 1e-6, "a low load crowns at a fifth of the rate");
  f.express(c, 0, preset("crown"), 0.75);
  assert.ok(Math.abs(c.regicide[0]! - 0.75) < 1e-6);
  f.express(c, 0, preset("share"), 0.75);
  assert.equal(c.regicide[0], 0, "only crown kills");
  assert.ok(f.menu.has("marks"), "a nest: floor marks are on the menu");
  f.menu = new Set([...f.menu, "crown"]);
  assert.ok(f.menu.has("crown"));
  f.menu.add("weapon"); // a copy (review of #27: adding to the live set skipped the NEST_ONLY filter)
  assert.ok(!f.menu.has("weapon"), "the menu getter hands out a copy");
});

test("a host's corpse keeps its load and strain; a muddled ant reads no road sign", () => {
  const { c } = oneColony(2, { maxAnts: 2 });
  c.load[1] = 0.8;
  c.strain[1] = BLOOM;
  c.kill(1);
  const k = c.corpses.at(-1)!;
  assert.ok(Math.abs(k.load - 0.8) < 1e-6 && k.strain === BLOOM, "kill() records them (the midden's spores read them)");
  // Road signs: underground on a strong mark of where it is going, a homing ant's vector error fades; muddled (marks × 0.3), it doesn't.
  const run = (marks: number) => {
    const { map, c: d } = oneColony(1, { maxAnts: 1 }, () => "return");
    // in the shaft, not a chamber (arriving in one resets the vector)
    const sx = map.nest.entrance!.x;
    const sy = map.nest.entrance!.y + 3;
    cellOf(sx, sy);
    const [mx, my] = [CELL[0], CELL[1]];
    // the marks of wherever it heads for, on its cell and the rows by it (it steps a row a tick before it reads)
    const sign = () => {
      for (const m of MARKS) for (let dy = -2; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) d.ph.fields[m].set(mx + dx, my + dy, 2); // strong (≥ 1), but not × 0.3
    };
    d.x[0] = sx;
    d.y[0] = sy;
    d.mode[0] = 2;
    d.gainMarks[0] = marks;
    d.tick(1 / 30);
    d.odoNest[0] = 10;
    for (let t = 0; t < 30; t++) {
      d.x[0] = sx;
      d.y[0] = sy;
      d.ph.fields.home.clear(); // the marks alone: no home trail to read either
      sign();
      d.tick(1 / 30);
    }
    return d.odoNest[0]!;
  };
  const clear = run(1);
  const muddled = run(0.3);
  assert.ok(clear < 9.5, `the sign is read: ${clear.toFixed(2)}`);
  assert.ok(muddled > clear + 0.3, `muddled, it fades less: ${muddled.toFixed(2)} vs ${clear.toFixed(2)}`);
});

test("the nest's odour drifts toward hosts in its royal chamber, wherever in it they stand, and not toward hosts elsewhere", () => {
  // Review of #27: recognition's royal-chamber rule (nest slice 8) had no test; reverting it to the old disc passed.
  const drift = (where: "royal" | "brood" | "disc") => {
    const { map, c } = oneColony(4, { maxAnts: 4 });
    const ch = map.chambers!;
    const royal = ch.list.find((k) => k.colony === 0 && k.role === "royal")!;
    const open = (x: number, y: number) => rockAt(map, x, y) === OPEN;
    cellOf(map.nest.x, map.nest.y);
    const [nx0, ny0] = [CELL[0], CELL[1]];
    // Cells along the royal chamber's floor row, 8–11 columns east of the nest's centre: past the old disc (r 3).
    const cells: [number, number][] = [];
    const row = royal.floorRow;
    for (let x = nx0 + 8; x <= nx0 + 11; x++) {
      digCell(map, x, row);
      cells.push([x, row]);
    }
    if (where === "royal") for (const [x, y] of cells) ch.claim(royal.id, x, y, open);
    else if (where === "brood") {
      const brood = ch.add(0, row, "brood");
      for (const [x, y] of cells) ch.claim(brood.id, x, y, open);
    } else {
      // In the old disc, but out of the royal chamber (a cave-in took those cells out of it).
      cells.length = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, -1],
      ] as const) {
        ch.release(nx0 + dx, ny0 + dy);
        cells.push([nx0 + dx, ny0 + dy]);
      }
    }
    cells.forEach(([x, y], i) => {
      c.x[i] = centreX(x, y);
      c.y[i] = centreY(y);
      c.mask[i] = MAX_MASK;
    });
    const rec = new Recognition();
    for (let k = 0; k < 600; k++) rec.step([c], 0.1);
    return c.nestOdour;
  };
  assert.ok(drift("royal") > 0.2, `hosts in the royal chamber, outside the old disc: ${drift("royal").toFixed(3)}`);
  assert.equal(drift("brood"), 0, "hosts in a brood chamber leave the nest's odour be");
  assert.equal(drift("disc"), 0, "hosts in the old disc, out of the royal chamber, too");
});
