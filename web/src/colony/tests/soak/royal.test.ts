import { test } from "node:test";
import assert from "node:assert/strict";
import { GYNE, GYNE_FOOD, LARVA, PUPA, WORKER } from "../../brood.ts";
import { Colony, NANITIC_AGE, T_PUPA } from "../../colony.ts";
import { Game, FOUNDING_RESERVE, MET, QUIET } from "../../game.ts";
import { INFECTED, STRAINS } from "../../fungus.ts";
import { driftAim } from "../../recognition.ts";
import { ALATE_RESERVE, ALATE_WAIT, CULL_CUE, GYNE_CUE, GYNE_SPACING, scentShare, type Flight } from "../../royal.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { generateSideWorld, mulberry32} from "../../world.ts";
import { DT, SMALL_SIDE, broodChamber } from "../builders.ts";

// New queens (ja-lo8.9, royal.ts): the queen's scent carried on the ants and diluted as the colony grows; gynes reared
// where nurses perceive it faint and culled where they perceive it strong; the alate's walk out and flight; a daughter
// founded alone, at her mother's odour, drifting away from it.


function colony(n: number) {
  const map = generateSideWorld(2, SMALL_SIDE);
  const c = new Colony(map, { antCount: n, maxAnts: n + 4 }, mulberry32(2), () => "explore");
  return { map, c };
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

test("nurses feeding a gyne rear no second beside her: gyne brood or an alate within GYNE_SPACING keeps a larva a worker (ja-lo8.10)", () => {
  assert.ok(GYNE_SPACING >= 1);
  // A gyne pupa (no longer fed, never culled) exactly GYNE_SPACING cells along the row blocks it; one cell further doesn't.
  for (const [dx, want] of [
    [GYNE_SPACING, WORKER],
    [GYNE_SPACING + 1, GYNE],
  ] as const) {
    const { c, larva, hold } = nursery(0.001);
    const pupa = c.brood.add(larva.x + dx, larva.y, larva.chamber);
    c.map.chambers!.list[larva.chamber]!.brood++;
    pupa.stage = PUPA;
    pupa.caste = GYNE;
    for (let k = 0; k < 30 * (GYNE_CUE + 2); k++) {
      hold();
      c.tick(DT);
    }
    assert.equal(larva.caste, want, `gyne pupa ${dx} cells off: caste ${larva.caste}`);
  }
  // An alate waiting by it blocks it too.
  const { c, larva, hold } = nursery(0.001);
  c.alates.push({ x: centreX(larva.x + 1, larva.y), y: centreY(larva.y), t: 0, step: 0, load: 0, strain: 0, resist: 0, food: ALATE_RESERVE });
  for (let k = 0; k < 30 * (GYNE_CUE + 2); k++) {
    hold();
    c.tick(DT);
  }
  assert.equal(larva.caste, WORKER, "kept a worker beside an alate");
  assert.equal(c.gynes, 0);
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
  const map = generateSideWorld(2, SMALL_SIDE);
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
  // Her first workers are nanitics: they eclose old, so they forage from the start (ja-lo8.10).
  for (let i = 0; i < d.n; i++) if (d.alive[i]) assert.equal(d.band(i), 2, `nanitic ${i}: age ${d.age[i]}`);
  assert.ok(NANITIC_AGE > 0);
  // Her colony is young: with her nanitics out, she still feeds the brood by her that no worker tends; a world's own colony never is.
  assert.equal(d.incipient, true);
  assert.equal(c.incipient, false);
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
  const map = generateSideWorld(2, SMALL_SIDE);
  const g = new Game(map, { antCount: 60, rival: false, autoFound: false }, mulberry32(2 * 7919));
  const c = g.player;
  c.alates.push({ x: c.queen!.x, y: c.queen!.y, t: ALATE_WAIT, step: 0, load: 0, strain: 0, resist: 0, food: ALATE_RESERVE });
  c.alates.push({ x: c.queen!.x, y: c.queen!.y, t: 0, step: 0, load: 0, strain: 0, resist: 0, food: ALATE_RESERVE });
  map.foodTotal += 2 * ALATE_RESERVE; // the two alates' bodies, put in by hand, on the books
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
  // While a flight waits for the page, her body is on the books in it (Game.royalFood), not in any larder.
  const books = (x: Game) => {
    let t = x.map.foodLeft + x.royalFood();
    for (const d of x.colonies) {
      for (let i = 0; i < d.n; i++) if (d.alive[i] && d.carrying[i]) t += 1;
      t += d.larder + 4 * d.births + d.eaten;
      for (const b of d.brood.items) t += 1 + b.fed;
    }
    return t;
  };
  const h = new Game(generateSideWorld(2, SMALL_SIDE), { antCount: 60, rival: false, autoFound: false }, mulberry32(2 * 7919));
  h.load(saved);
  assert.ok(h.flights[0]!.food > 0);
  assert.ok(Math.abs(books(h) - h.map.foodTotal) < 1e-6, `books with a flight pending: ${books(h)} vs ${h.map.foodTotal}`);
  assert.equal(h.flights.length, 1);
  assert.equal(h.player.alates.length, 1);
  const lost = h.flights[0]!;
  const eaten = h.player.eaten;
  h.lose(lost);
  assert.equal(h.flights.length, 0);
  assert.equal(h.player.eaten, eaten + lost.food, "a lost queen's body leaves the world with her");
  h.lose(lost);
  assert.equal(h.player.eaten, eaten + lost.food, "once");
  assert.equal(h.colonies.length, 1);
  // A save with a daughter founds her again on load, as she was.
  for (let j = 0; j < 30 * 5; j++) g.tick(DT);
  const again = new Game(generateSideWorld(2, SMALL_SIDE), { antCount: 60, rival: false, autoFound: false }, mulberry32(2 * 7919));
  again.load(JSON.parse(JSON.stringify(g.save())));
  assert.equal(again.colonies.length, 2);
  for (let j = 0; j < 30 * 10; j++) {
    g.tick(DT);
    again.tick(DT);
  }
  const [a, b] = [g.colonies[1]!, again.colonies[1]!];
  assert.deepEqual([b.founding, b.incipient, b.population, b.nestOdour, b.odourAim, b.brood.items.length], [a.founding, a.incipient, a.population, a.nestOdour, a.odourAim, a.brood.items.length]);
  assert.equal(b.incipient, true, "a young daughter stays young across a save (PR #54 review, N7)");
  assert.deepEqual(again.player.alates, g.player.alates);
});

/** A pending flight from colony 0, already as fat as an alate gets (Game.found takes only pending flights). */
function fly(g: Game): Flight {
  const f: Flight = { mother: 0, x: 0, y: 0, load: 0, strain: 0, at: g.time, food: ALATE_RESERVE };
  g.flights.push(f);
  return f;
}

test("daughters landing together dig apart: their founding chambers never touch, and each queen lies in her own (ja-lo8.10)", () => {
  for (const seed of [1, 2, 3]) {
    const map = generateSideWorld(seed, { ...SMALL_SIDE, size: { w: 400, h: 160 } });
    const g = new Game(map, { antCount: 30, rival: false, autoFound: false }, mulberry32(seed * 7919));
    for (let k = 0; k < 4; k++) assert.ok(g.found(fly(g)) > 0, `seed ${seed}: daughter ${k} founded`);
    const ch = g.map.chambers!;
    const nests = g.map.nests.filter((n) => n.entrance);
    // Founding chambers are discs of r + 1.5 round each nest's centre: apart by both radii, no cell is in both.
    for (let a = 0; a < nests.length; a++)
      for (let b = a + 1; b < nests.length; b++) {
        const [p, q] = [nests[a]!, nests[b]!];
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > p.r + q.r + 3, `seed ${seed}: chambers of nests ${a} and ${b} at ${p.x.toFixed(1)} and ${q.x.toFixed(1)}`);
      }
    for (const d of g.colonies.slice(1)) {
      cellOf(d.queen!.x, d.queen!.y);
      const room = ch.list[ch.at(CELL[0] as number, CELL[1] as number)];
      assert.ok(room && room.colony === d.params.nest && room.role === "royal", `seed ${seed}: queen of nest ${d.params.nest} in ${room?.colony}'s ${room?.role}`);
    }
  }
});

test("a daughter raises her first brood on her own reserve, beside her sisters", () => {
  const map = generateSideWorld(2, { ...SMALL_SIDE, size: { w: 400, h: 160 } });
  const g = new Game(map, { antCount: 30, rival: false, autoFound: false }, mulberry32(2 * 7919));
  for (let k = 0; k < 3; k++) g.found(fly(g));
  for (let k = 0; k < 30 * 150; k++) g.tick(DT);
  for (const d of g.colonies.slice(1)) assert.equal(d.founding, false, `nest ${d.params.nest}: a first worker`);
});

test("food is conserved through gynes, flights and foundings: an alate's body (her egg, her larval food, what she is fed waiting) is her daughter's reserve", () => {
  // PR #47 review, S1: the reserve was 24 food from nowhere. Nurses that perceive no scent rear gynes; they fatten, fly and found.
  const map = generateSideWorld(2, SMALL_SIDE);
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
    // New queens' bodies are food too, until they found (into a larder) or are lost (eaten). Founding raises nothing.
    return Math.abs(s + g.royalFood() - map.foodTotal);
  };
  const total = map.foodTotal;
  let founded = -1;
  // Until the daughter is no longer young (ja-lo8.10): through her nanitics and the queen's nursing too (PR #54 review).
  const young = () => g.colonies.length > 1 && (g.colonies[1]!.founding || g.colonies[1]!.incipient);
  for (let k = 0; k < 30 * 600 && (founded < 0 || young() || g.time < founded + 30); k++) {
    c.scentGain.fill(0.001);
    g.tick(DT);
    if (founded < 0 && g.colonies.length > 1) founded = g.time;
    if (k % 30 === 0) worst = Math.max(worst, books());
  }
  assert.ok(founded > 0, "a daughter was founded");
  assert.ok(worst < 1e-6, `food drifted by ${worst}`);
  assert.equal(map.foodTotal, total, "founding makes no food: her reserve is her body");
  const d = g.colonies[1]!;
  assert.ok(g.founded[0]!.reserve! > 1 && g.founded[0]!.reserve! <= ALATE_RESERVE, `her reserve, her body: ${g.founded[0]!.reserve}`);
  assert.ok(d.larder <= ALATE_RESERVE);
});

/** A daughter colony past founding (her first nanitic out), on a wide map; her workers held far off on the ground each tick. */
function youngColony() {
  const map = generateSideWorld(2, { ...SMALL_SIDE, size: { w: 400, h: 160 } });
  const g = new Game(map, { antCount: 30, rival: false, autoFound: false }, mulberry32(2 * 7919));
  g.found(fly(g));
  const d = g.colonies[1]!;
  for (let k = 0; k < 30 * 150 && d.founding; k++) g.tick(DT);
  assert.equal(d.founding, false, "her first worker eclosed");
  const ch = map.chambers!;
  cellOf(d.queen!.x, d.queen!.y);
  const [qx, qy] = [CELL[0] as number, CELL[1] as number];
  const room = ch.list[ch.at(qx, qy)]!;
  const away = () => {
    // Her nanitics are out foraging: none within two cells of her brood.
    for (let i = 0; i < d.n; i++)
      if (d.alive[i]) {
        d.x[i] = d.nest.entrance!.x + 40;
        d.y[i] = d.nest.entrance!.y;
      }
  };
  return { g, d, room, qx, qy, away };
}

test("a young colony's queen feeds the brood by her that no worker tends; once a worker her workers reared ecloses, she stops", () => {
  // PR #54 review, S1: the queen nursing while `incipient` is what lets a daughter grow past her nanitics.
  const { g, d, room, qx, qy, away } = youngColony();
  d.brood.items.length = 0;
  const larva = d.brood.add(qx, qy, room.id);
  room.brood++;
  larva.stage = LARVA;
  room.food += 6;
  d.larder += 6;
  g.map.foodTotal += 6;
  assert.equal(d.incipient, true);
  for (let k = 0; k < 30 * 2; k++) {
    away();
    g.tick(DT);
  }
  const fed = larva.fed;
  assert.ok(fed > 0.2, `fed by the queen: ${fed}`);
  // A worker reared by her workers (not a nanitic) ecloses: the colony is no longer young, and the queen nurses no more.
  const pupa = d.brood.add(qx, qy, room.id);
  room.brood++;
  pupa.stage = PUPA;
  pupa.t = T_PUPA;
  pupa.fed = 3;
  for (let k = 0; k < 3; k++) {
    away();
    g.tick(DT);
  }
  assert.equal(d.brood.items.includes(pupa), false, "it eclosed");
  assert.equal(d.incipient, false);
  for (let k = 0; k < 30 * 2; k++) {
    away();
    g.tick(DT);
  }
  assert.ok(Math.abs(larva.fed - fed) < 0.02, `unfed once she is not young: ${fed} then ${larva.fed}`);
});

test("a young colony's queen feeds as two nurses beside a nanitic: one worker by the brood doesn't halve its feeding", () => {
  const { g, d, room, qx, qy, away } = youngColony();
  d.brood.items.length = 0;
  const larva = d.brood.add(qx, qy, room.id);
  room.brood++;
  larva.stage = LARVA;
  room.food += 6;
  d.larder += 6;
  g.map.foodTotal += 6;
  const one = d.alive.indexOf(1);
  for (let k = 0; k < 30 * 2; k++) {
    away();
    d.x[one] = d.queen!.x; // one nanitic stays by the brood
    d.y[one] = d.queen!.y;
    g.tick(DT);
  }
  assert.ok(larva.fed > 0.8, `fed at the full rate: ${larva.fed}`);
});

test("a nanitic eclosing leaves the colony young", () => {
  const { g, d, room, qx, qy, away } = youngColony();
  const pupa = d.brood.add(qx, qy, room.id);
  room.brood++;
  pupa.stage = PUPA;
  pupa.t = T_PUPA;
  pupa.fed = 3;
  pupa.nanitic = true;
  for (let k = 0; k < 3; k++) {
    away();
    g.tick(DT);
  }
  assert.equal(d.brood.items.includes(pupa), false, "it eclosed");
  assert.equal(d.incipient, true);
});

test("a queen founding alone doesn't hold unity at nothing: a colony with no ants has nobody to meet (ja-i0f, PR #47 review)", () => {
  const map = generateSideWorld(1, { ...SMALL_SIDE, size: { w: 400, h: 160 }, nestCount: 2 });
  const g = new Game(map, { antCount: 20, rivalAnts: 20, autoFound: false }, mulberry32(7));
  const [a, b] = g.colonies as [Colony, Colony];
  const e = a.nest.entrance!;
  const meet = (seconds: number) => {
    for (let k = 0; k < Math.round(seconds * 30); k++) {
      for (const c of [a, b]) {
        c.nestOdour = 0.5;
        for (let i = 0; i < c.n; i++)
          if (c.alive[i]) {
            c.odour[i] = 0.5;
            c.x[i] = e.x;
            c.y[i] = e.y;
          }
      }
      g.tick(DT);
    }
  };
  meet(QUIET);
  const before = g.unity().met;
  assert.ok(before >= MET, `the two met: ${before}`);
  g.flights.push({ mother: 0, x: e.x, y: e.y, load: 0, strain: 0, at: g.time, food: ALATE_RESERVE });
  assert.ok(g.found(g.flights[0]!) > 1);
  const d = g.colonies[2]!;
  assert.ok(d.founding && d.population === 0);
  meet(2);
  assert.ok(g.unity().met >= MET, `with a daughter founding: met ${g.unity().met}`);
});

test("a queen landing where no hole fits is lost, and her body booked to her mother: found() returns −1 (PR #47 review, N7)", () => {
  // 24 columns: no column is HOLE_GAP from both edges and from the mother's hole.
  const map = generateSideWorld(2, { size: { w: 24, h: 80 }, nestGap: 120, surface: 20, nestCount: 1 });
  const g = new Game(map, { antCount: 10, rival: false, autoFound: false }, mulberry32(3));
  const f: Flight = { mother: 0, x: 0, y: 0, load: 0, strain: 0, at: 0, food: 10 };
  g.flights.push(f);
  const e = g.player.nest.entrance!;
  const eaten = g.player.eaten;
  assert.equal(g.found(f, { x: e.x, y: e.y }), -1);
  assert.equal(g.flights.length, 0, "no longer pending");
  assert.equal(g.colonies.length, 1);
  assert.equal(g.player.eaten, eaten + f.food, "her body left the world with her");
});
