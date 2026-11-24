import assert from "node:assert/strict";
import { test } from "node:test";
import { centreX, centreY } from "../../hex.ts";
import { Game } from "../../game.ts";
import type { Site } from "../../endlessPlane.ts";
import { generateOneWorld, mainGround } from "../../oneWorld.ts";
import { makeTransect } from "../../transect.ts";
import { hash01, mulberry32 } from "../../world.ts";
import { cellOf, CELL } from "../../hex.ts";

// A wild colony wakes from its site (docs/endless-world.md §4, PRD §66 E4.3): generated once, from the site and the seed only.

const SEED = 2;
const specs = [{ antCount: 40 }, { antCount: 40 }];
const fresh = (stream = 5) => new Game(generateOneWorld(SEED), {}, mulberry32(stream), specs);
const grounds = new WeakMap<Game, (x: number, y: number) => boolean>();
const groundOf = (g: Game) => {
  let f = grounds.get(g);
  if (!f) grounds.set(g, (f = mainGround(g.world)));
  return f;
};

/** A site at a plane cell far from every hole, where a founding would start a line (so the cell is open and clear). */
function siteFor(g: Game, rx = 3, ry = 4): Site {
  g.newLines = true;
  for (let y = 20; y < 360; y += 20)
    for (let x = 20; x < 500; x += 20) {
      const s = g.settleAt({ x, y }, groundOf(g));
      if (s.ok && s.newLine) {
        g.newLines = false;
        return { x: centreX(s.cell.x, s.cell.y), y: centreY(s.cell.y), r: 6, rx, ry, heading: s.newLine.heading };
      }
    }
  throw new Error("no far open cell");
}

test("waking a site makes a colony on a line of its own, at the size a start colony reaches, with the site's odour, and the site stops being reserved", () => {
  const g = fresh();
  const site = siteFor(g);
  g.sites = [{ x: site.x, y: site.y, heading: site.heading }];
  const k = g.wakeSite(site);
  assert.equal(k, 2);
  const c = g.colonies[2]!;
  assert.equal(c.population, 60, "1.5 times the start colonies' 40: the cap a start colony reaches");
  assert.equal(g.world.lines.length, 2, "a line of its own");
  assert.equal(c.lineIndex, 1);
  assert.equal(g.sites.length, 0, "no longer a reserved line");
  assert.equal(c.nestOdour, hash01(SEED, 101, 3, 4));
  assert.ok(c.queen?.alive);
  // its line is the one-hole line of the site's own heading
  cellOf(site.x, site.y);
  const expect = makeTransect([{ x: CELL[0] as number, y: CELL[1] as number }], { heading: site.heading });
  assert.deepEqual([...g.world.lines[1]!.line.cells], [...expect.cells]);
  assert.equal(g.wakeSite(site), 2, "waking it again gives the colony already woken");
  assert.equal(g.colonies.length, 3);
});

test("the same site woken in two games is the same colony, whatever each game's stream was", () => {
  const make = (stream: number) => {
    const g = fresh(stream);
    for (let t = 0; t < 30 * 3; t++) g.tick(1 / 30); // the streams have been used
    const site = siteFor(g);
    const k = g.wakeSite(site);
    return { c: g.colonies[k]!, g, k };
  };
  const a = make(11);
  const b = make(97);
  assert.equal(JSON.stringify(a.c.saveState()), JSON.stringify(b.c.saveState()));
  assert.deepEqual(a.g.world.lines[1]!.line.holes, b.g.world.lines[1]!.line.holes);
});

test("a woken colony forages and goes on: after two minutes it is alive, has brought food home, and the others are as they were", () => {
  const g = fresh();
  const site = siteFor(g);
  const k = g.wakeSite(site, { ants: 40 });
  const c = g.colonies[k]!;
  for (let t = 0; t < 120 * 30; t++) g.tick(1 / 30);
  assert.ok(c.population > 20, `population ${c.population}`);
  assert.ok(c.larder > 0, "it has brought food home");
  for (const o of [0, 1]) assert.ok(g.colonies[o]!.population > 0);
});

test("a save holds the woken site: loaded, the colony is there, the site does not reserve its cell, and waking it again gives the same colony", () => {
  const a = fresh();
  const site = siteFor(a);
  a.sites = [{ x: site.x, y: site.y, heading: site.heading }];
  const k = a.wakeSite(site, { ants: 30 });
  for (let t = 0; t < 20 * 30; t++) a.tick(1 / 30);
  const saved = JSON.parse(JSON.stringify(a.save())) as ReturnType<Game["save"]>;
  const b = fresh();
  b.sites = [{ x: site.x, y: site.y, heading: site.heading }];
  b.load(saved);
  assert.equal(b.colonies.length, 3);
  assert.equal(b.sites.length, 0);
  assert.equal(b.wakeSite(site), k);
  assert.equal(b.colonies[k]!.population, a.colonies[k]!.population);
  // and on: the colony took the game's own stream once built (a stream the save never holds), so a load goes on as the saved game would
  for (let t = 0; t < 10 * 30; t++) {
    a.tick(1 / 30);
    b.tick(1 / 30);
  }
  assert.equal(JSON.stringify(b.colonies[k]!.saveState()), JSON.stringify(a.colonies[k]!.saveState()));
});

test("`ants` sets the size and lifts the cap with it", () => {
  const g = fresh();
  const k = g.wakeSite(siteFor(g), { ants: 90 });
  assert.equal(g.colonies[k]!.population, 90);
  assert.equal(g.colonies[k]!.params.maxAnts, 90);
});
