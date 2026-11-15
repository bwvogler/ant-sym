import { test } from "node:test";
import assert from "node:assert/strict";
import { desertFirstFind, desertInvitation, desertNoTrail, oneAssay, runAssay, crayonLine, wall } from "../../experiment.ts";
import { DESERT_ANT } from "../../desertAnt.ts";

// The behaviour assays too slow for npm test's 60 s per file (experiment.ts, docs/PRD.md §42), on one world (their
// ONE_ASSAYS twins, S2.2e, PRD §76). The owner's marks rule (2026-11-14, 2026-11-15): an assay that passes is held to its
// mark; one that fails today (A5, A9, A10 here; A6 and A13 in slow/defence.test.ts) is held only to no worse than its
// worst seed over 1–20 (PRD §76.1, §76.3) widened by 10 %, until its bead is fixed. Those today's ants don't pass yet and
// aren't guarded run as `todo`, naming the bead or MR meant to pass them. (G, the whole game, is guarded by G1,
// slow/g1/oneWorldG1.test.ts.) A11 and A12, the longest, have files of their own (raidFind, raidStop), so the slow tier's shards
// balance (slow.yml).

// One world (PRD §76.1): A1 20/20 on seeds 1–20 (shortShare median 0.90, worst 0.865).
test("A1 double bridge: ≥ 80 % on the short branch", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(oneAssay("bridge"), seed).metrics;
    assert.ok(Number.isFinite(m.shortShare));
    assert.equal(m.pass, 1, `seed ${seed}: shortShare ${m.shortShare}`);
  }
});

// One world (PRD §76.1): A2a 20/20, A2b 17/20 (fails 9, 18, 20).
test("A2a two equal sources: the colony concentrates on one", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(oneAssay("twin"), seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: majorityShare ${m.majorityShare}`);
  }
});

test("A2b rich vs poor source: the colony picks the richer", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(oneAssay("richPoor"), seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: richShare ${m.richShare}`);
  }
});

// One world (PRD §76.1): A5 fails 0/20, more ants outside before food than after (ja-lp4.6.8), so it is guarded: outside
// before ÷ after at most A5_GUARD (worst seed 2.645, seed 5, + 10 %). A5b passes 18/20 (fails 7, 20) and keeps its mark.
const A5_GUARD = 2.91;
for (const seed of [1, 2]) {
  test(`A5 regulation, guarded (ja-lp4.6.8): no more ants out before food than today's worst seed (seed ${seed})`, () => {
    const m = runAssay(oneAssay("regulate"), seed).metrics;
    assert.ok(Number.isFinite(m.outsideBefore) && m.outsideAfter > 0);
    const ratio = m.outsideBefore / m.outsideAfter;
    assert.ok(ratio <= A5_GUARD, `outside before ${m.outsideBefore} ÷ after ${m.outsideAfter} = ${ratio}, guard ${A5_GUARD}`);
  });
  test(`A5b foraging stops: departures fall once food is gone (seed ${seed})`, () => {
    const m = runAssay(oneAssay("regulateStop"), seed).metrics;
    assert.equal(m.pass, 1, `trips out per minute while food flowed ${m.departsFlow}, once gone ${m.departsGone}`);
  });
}

// One world (PRD §76.1): A9 10/20 at its mark of 4 lost per 100 food (ja-lp4.6.4), A10 2/20 at its draw of 2 (ja-je8), so
// both are guarded: A9 at most A9_GUARD lost per 100 food (worst 8.04, seed 7, + 10 %, rounded up); A10's draw at least A10_GUARD
// (worst −0.5, seed 6, − 10 %).
const A9_GUARD = 8.85;
const A10_GUARD = -0.55;
test("A9 strangers meet at food, guarded (ja-lp4.6.4): no more lost per food than today's worst seed", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(oneAssay("contact"), seed).metrics;
    assert.ok(m.lostPer100Food <= A9_GUARD, `seed ${seed}: ${m.lostPer100Food} lost per 100 food, guard ${A9_GUARD}`);
  }
});

test("A10 faint alarm, guarded (ja-je8): the draw no weaker than today's worst seed", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(oneAssay("faintAlarm"), seed).metrics;
    assert.ok(m.draw >= A10_GUARD, `seed ${seed}: draw ${m.draw}, guard ${A10_GUARD}`);
  }
});

// The desert ant's assays (ja-rf5.2, PRD §60.1): landed before the species, so today they measure the generic ant, which fails both.
// Baselines, seeds 1–10: D1 lays food trail on a median 2,036 cells and home trail on 7,530; D2's ratio is a median 0.97 (0.88–1.05).
// ja-rf5.3: D1 passes with the desert ant (tests/int/desertAnt.test.ts runs it on seeds 1–2); the generic ant, the baseline above, still fails it.
test("D1 a desert ant lays no trail", () => {
  for (const seed of [1, 2, 3]) {
    const m = runAssay(desertNoTrail, seed, { game: { species: DESERT_ANT } }).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: food trail on ${m.foodCells} cells, home trail on ${m.homeCells}`);
  }
});

// ja-rf5.4 (PRD §60.4): the desert ant climbs food odour in the air. Seeds 1–20 all find sooner than its blind search (foodPlume 0):
// worst seed of 1–10 13.2 → 11.6 s, of 11–20 12.9 → 12.1 s.
test("D3 food odour brings the first find sooner than a blind search", () => {
  for (const seed of [1, 2, 3]) {
    const first = (blind: boolean) =>
      runAssay(desertFirstFind, seed, { game: { species: DESERT_ANT }, ...(blind ? { colony: { foodPlume: 0 } } : {}) }).metrics.firstFind;
    const smelt = first(false);
    const blind = first(true);
    assert.ok(smelt < blind, `seed ${seed}: first find at ${smelt} s with the plume, ${blind} s blind`);
  }
});

test(
  "D2 a returning finder invites nestmates out (in the game: reported; the gate is D2c, the staged chamber, tests/int/desertInvite)",
  {
    todo: "ja-rf5.6: few isolated returns a game, so it swings (over two days, 1200 s, with the first build's 20 s lift: median 7.2x, pass 5/10)",
  },
  () => {
    // The desert ant (desertSpec sets no species; review of #186, S1), over two days, as its figures were measured.
    const m = runAssay(desertInvitation, 1, { game: { species: DESERT_ANT } }, 1200).metrics;
    assert.equal(m.pass, 1, `ratio ${m.ratio}`);
  },
);

// The builder (PRD §73.1, ja-kjj8.1): B1 passes 10/10 on seeds 1–10 (median 6.4×, worst 4.3); B2 fails 0/10 (delivery
// after the wall at a median 14 % of before).
test("B1 a crayon line is followed: ≥ 3× its undrawn mirror", () => {
  for (const seed of [1, 4]) {
    const m = runAssay(crayonLine, seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: lineRatio ${m.lineRatio}`);
  }
});

test(
  "B2 a rock wall across a trail: food comes home again by another way",
  { todo: "ja-y94o: carriers stall at the wall (median 14 % of before)" },
  () => {
    const m = runAssay(wall, 1).metrics;
    assert.equal(m.pass, 1, `afterShare ${m.afterShare}`);
  },
);
