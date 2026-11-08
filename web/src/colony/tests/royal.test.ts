import { test } from "node:test";
import assert from "node:assert/strict";
import { GYNE, GYNE_FOOD, LARVA, WORKER } from "../brood.ts";
import { Colony } from "../colony.ts";
import { Game, FOUNDING_RESERVE } from "../game.ts";
import { INFECTED, STRAINS } from "../fungus.ts";
import { driftAim } from "../recognition.ts";
import { ALATE_RESERVE, ALATE_WAIT, CULL_CUE, GYNE_CUE, scentShare } from "../royal.ts";
import { CELL, cellOf, centreX, centreY } from "../hex.ts";
import { digCell, generateSideWorld, mulberry32, OPEN, rockAt } from "../world.ts";

// New queens (ja-lo8.9, royal.ts): the queen's scent carried on the ants and diluted as the colony grows; gynes reared
// where nurses perceive it faint and culled where they perceive it strong; the alate's walk out and flight; a daughter
// founded alone, at her mother's odour, drifting away from it.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };
const DT = 1 / 30;

function colony(n: number) {
  const map = generateSideWorld(2, SMALL);
  const c = new Colony(map, { antCount: n, maxAnts: n + 4 }, mulberry32(2), () => "explore");
  return { map, c };
}

/** A brood chamber of three cells dug beside the royal one (as in hunger.test). */
function broodChamber(map: ReturnType<typeof generateSideWorld>) {
  const ch = map.chambers!;
  cellOf(map.nest.x, map.nest.y);
  const [rx, ry] = [CELL[0] as number, CELL[1] as number];
  let x = rx;
  while (rockAt(map, x, ry) === OPEN) x++;
  digCell(map, x, ry);
  const b = ch.add(0, ry, "brood");
  for (let k = 1; k <= 3; k++) {
    digCell(map, x + k, ry);
    ch.claim(b.id, x + k, ry, (a, y) => rockAt(map, a, y) === OPEN);
  }
  return { b, cell: [x + 2, ry] as const };
}

function meanScent(c: Colony): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < c.n; i++)
    if (c.alive[i]) {
      s += c.scent[i] as number;
      n++;
    }
  return s / n;
}

test("the queen's scent is carried on the ants and dilutes as the colony grows: her supply is split among more of them", () => {
  assert.equal(scentShare(0), 0);
  const few = colony(10).c;
  const many = colony(60).c;
  assert.ok(Math.abs((few.scent[0] as number) - scentShare(10)) < 1e-6, "founders start with the colony's share");
  for (let k = 0; k < 30 * 60; k++) {
    few.tick(DT);
    many.tick(DT);
  }
  const [a, b] = [meanScent(few), meanScent(many)];
  assert.ok(a > 2 * b, `10 ants carry ${a.toFixed(2)} each, 60 carry ${b.toFixed(2)}`);
  // Her signal damped (the fungus's queen-signal lever), the ants carry less.
  const damped = colony(10).c;
  for (let k = 0; k < 30 * 120; k++) {
    damped.queen!.signal = 0.2;
    damped.tick(DT);
  }
  assert.ok(meanScent(damped) < 0.5 * a, `damped: ${meanScent(damped).toFixed(2)} against ${a.toFixed(2)}`);
});

/** A colony of three by a young larva in a brood chamber with food; `gain` is how strongly the ants perceive the scent. */
function nursery(gain: number, caste = WORKER) {
  const { map, c } = colony(3);
  const { b: room, cell } = broodChamber(map);
  const larva = c.brood.add(cell[0], cell[1], room.id);
  room.brood++;
  larva.stage = LARVA;
  larva.caste = caste;
  room.food += 6;
  c.larder += 6;
  const hold = () => {
    for (let i = 0; i < 3; i++) {
      c.x[i] = centreX(cell[0] + (i === 0 ? 1 : 0), cell[1]);
      c.y[i] = centreY(cell[1]);
      c.scentGain[i] = gain;
    }
  };
  return { c, larva, hold };
}

test("a young, well-fed larva whose nurses perceive the queen's scent faint is reared as a gyne; perceived strong, it stays a worker", () => {
  for (const [gain, want] of [
    [0.001, GYNE],
    [10, WORKER],
  ] as const) {
    const { c, larva, hold } = nursery(gain);
    for (let k = 0; k < 30 * (GYNE_CUE + 2); k++) {
      hold();
      c.tick(DT);
    }
    assert.equal(larva.caste, want, `gain ${gain}: caste ${larva.caste}`);
    assert.equal(c.gynes, want === GYNE ? 1 : 0);
  }
});

test("a gyne larva is fed three times a worker's food; nurses who perceive the scent strong cull it", () => {
  const { c, larva, hold } = nursery(10, GYNE);
  for (let k = 0; k < 30 * (CULL_CUE + 2); k++) {
    hold();
    c.tick(DT);
  }
  assert.equal(c.brood.items.includes(larva), false, "culled");
  assert.equal(c.gynesCulled, 1);
  assert.equal(GYNE_FOOD, 3 * 3);
  // Perceived faint, a gyne larva is kept and fed past a worker's food.
  const kept = nursery(0.001, GYNE);
  for (let k = 0; k < 30 * 20; k++) {
    kept.hold();
    if (kept.c.larder < 4) {
      const room = kept.c.map.chambers!.list[kept.larva.chamber]!;
      room.food += 4;
      kept.c.larder += 4;
    }
    kept.c.tick(DT);
  }
  assert.ok(kept.c.brood.items.includes(kept.larva), "kept");
  assert.ok(kept.larva.fed > 3, `fed ${kept.larva.fed}`);
});

/** A small solo side-view game; colony 0's queen has an alate ready to walk out. */
function flying(paint = false) {
  const map = generateSideWorld(2, SMALL);
  const g = new Game(map, { antCount: 60, rival: false }, mulberry32(2 * 7919));
  const c = g.player;
  if (paint) {
    const garden = STRAINS.findIndex((s) => s.id === "garden");
    // Every ant dosed: the alate picks it up from the nestmates around her.
    for (let i = 0; i < c.n; i++) if (c.alive[i]) g.paintSpores(c.x[i] as number, c.y[i] as number, 0.5, 0, 0.8, garden);
  }
  c.alates.push({ x: c.queen!.x, y: c.queen!.y, t: ALATE_WAIT - 5, step: 0, load: 0, strain: 0, resist: 0, food: ALATE_RESERVE });
  return { g, c };
}

test("an alate waits, walks out along the tunnels and flies; she founds a daughter alone, at her mother's odour, which drifts away", () => {
  const { g, c } = flying();
  let t = 0;
  while (!c.flights && t < 300) {
    g.tick(DT);
    t += DT;
  }
  assert.equal(c.flights, 1, "she flew");
  assert.ok(t > 5, `she waited first (${t.toFixed(0)} s)`);
  assert.equal(g.colonies.length, 2, "and founded (autoFound)");
  const d = g.colonies[1]!;
  assert.equal(g.founded[0]!.mother, 0);
  assert.deepEqual(g.lineage(0), [0, 1], "her mother's lineage counts her");
  assert.equal(d.population, 0, "alone: no workers");
  assert.ok(d.founding && d.queen?.alive);
  assert.equal(Game.beaten(d), false, "a queen founding alone isn't beaten");
  assert.ok(Math.abs(d.larder - FOUNDING_RESERVE) < 1e-9, `her reserve: ${d.larder}`);
  assert.equal(d.nestOdour, c.nestOdour, "kin at first");
  assert.equal(d.odourAim, driftAim(c.nestOdour, g.recognition.params.tolerance));
  // A solo world and a kin daughter are not "one colony": the world had only one of its own (ja-lo8.9).
  for (let k = 0; k < 30 * 65; k++) g.tick(DT);
  assert.equal(g.outcome(), "playing");
  // She raises her first workers on her reserve.
  for (let k = 0; k < 30 * 150 && d.founding; k++) g.tick(DT);
  assert.equal(d.founding, false, "her first worker eclosed");
  assert.ok(d.population >= 1);
  // Her colony's odour drifts from her mother's until they are strangers.
  for (let k = 0; k < 30 * 600; k++) g.tick(DT);
  assert.ok(Math.abs(d.nestOdour - c.nestOdour) > g.recognition.params.tolerance, `apart: ${d.nestOdour.toFixed(2)} vs ${c.nestOdour.toFixed(2)}`);
});

test("an alate picks up the fungus from infected nestmates as she walks out, and her daughter's queen carries it (revealed)", () => {
  const { g, c } = flying(true);
  for (let k = 0; k < 30 * 300 && !c.flights; k++) g.tick(DT);
  assert.equal(c.flights, 1);
  const d = g.colonies[1]!;
  assert.ok(d.queen!.load > 0, `her load: ${d.queen!.load}`);
  // Her colony's doctrine is open to the player from the start: the fungus is in its queen.
  for (let k = 0; k < 2; k++) g.tick(DT);
  assert.ok(d.queen!.load >= INFECTED, `infected: ${d.queen!.load}`);
  assert.equal(g.revealed[1], true);
});

test("with autoFound off a flight waits for the page: found() at a chosen site, or lose(); a save keeps flights, alates and daughters", () => {
  const map = generateSideWorld(2, SMALL);
  const g = new Game(map, { antCount: 60, rival: false, autoFound: false }, mulberry32(2 * 7919));
  const c = g.player;
  c.alates.push({ x: c.queen!.x, y: c.queen!.y, t: ALATE_WAIT, step: 0, load: 0, strain: 0, resist: 0, food: ALATE_RESERVE });
  c.alates.push({ x: c.queen!.x, y: c.queen!.y, t: 0, step: 0, load: 0, strain: 0, resist: 0, food: ALATE_RESERVE });
  for (let k = 0; k < 30 * 120 && !g.flights.length; k++) g.tick(DT);
  assert.equal(g.flights.length, 1);
  assert.equal(g.colonies.length, 1, "nothing founded yet");
  const site = g.landing(0);
  assert.ok(site, "a landing site");
  const saved = JSON.parse(JSON.stringify(g.save()));
  const f = g.flights[0]!;
  const k = g.found(f, site);
  assert.equal(k, 1);
  assert.equal(g.flights.length, 0);
  // A flight founds once: again, it is no longer pending (PR #47 review, S2).
  const food = g.map.foodTotal;
  assert.equal(g.found(f, site), -1);
  assert.equal(g.colonies.length, 2);
  assert.equal(g.map.foodTotal, food, "no second reserve");
  // The save from before: its flight is still waiting, and the second alate is still in the nest.
  const h = new Game(generateSideWorld(2, SMALL), { antCount: 60, rival: false, autoFound: false }, mulberry32(2 * 7919));
  h.load(saved);
  assert.equal(h.flights.length, 1);
  assert.equal(h.player.alates.length, 1);
  h.lose(h.flights[0]!);
  assert.equal(h.flights.length, 0);
  assert.equal(h.colonies.length, 1);
  // A save with a daughter founds her again on load, as she was.
  for (let j = 0; j < 30 * 5; j++) g.tick(DT);
  const again = new Game(generateSideWorld(2, SMALL), { antCount: 60, rival: false, autoFound: false }, mulberry32(2 * 7919));
  again.load(JSON.parse(JSON.stringify(g.save())));
  assert.equal(again.colonies.length, 2);
  for (let j = 0; j < 30 * 10; j++) {
    g.tick(DT);
    again.tick(DT);
  }
  const [a, b] = [g.colonies[1]!, again.colonies[1]!];
  assert.deepEqual([b.founding, b.population, b.nestOdour, b.odourAim, b.brood.items.length], [a.founding, a.population, a.nestOdour, a.odourAim, a.brood.items.length]);
  assert.deepEqual(again.player.alates, g.player.alates);
});

test("food is conserved through gynes, flights and foundings: an alate's body (her egg, her larval food, what she is fed waiting) is her daughter's reserve", () => {
  // PR #47 review, S1: the reserve was 24 food from nowhere. Nurses that perceive no scent rear gynes; they fatten, fly and found.
  const map = generateSideWorld(2, SMALL);
  const g = new Game(map, { antCount: 60, rival: false }, mulberry32(2 * 7919));
  const c = g.player;
  let worst = 0;
  const books = () => {
    let s = map.foodLeft;
    for (const d of g.colonies) {
      for (let i = 0; i < d.n; i++) if (d.alive[i] && d.carrying[i]) s += 1;
      s += d.larder + 4 * d.births + d.eaten;
      for (const b of d.brood.items) s += 1 + b.fed;
    }
    return Math.abs(s - map.foodTotal);
  };
  let founded = -1;
  for (let k = 0; k < 30 * 400 && (founded < 0 || g.time < founded + 30); k++) {
    c.scentGain.fill(0.001);
    g.tick(DT);
    if (founded < 0 && g.colonies.length > 1) founded = g.time;
    if (k % 30 === 0) worst = Math.max(worst, books());
  }
  assert.ok(founded > 0, "a daughter was founded");
  assert.ok(worst < 1e-6, `food drifted by ${worst}`);
  const d = g.colonies[1]!;
  assert.ok(g.founded[0]!.reserve! > 1 && g.founded[0]!.reserve! <= ALATE_RESERVE, `her reserve, her body: ${g.founded[0]!.reserve}`);
  assert.ok(d.larder <= ALATE_RESERVE);
});
