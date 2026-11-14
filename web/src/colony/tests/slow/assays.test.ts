import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bridge,
  contact,
  desertFirstFind,
  desertInvitation,
  desertNoTrail,
  faintAlarm,
  regulate,
  regulateStop,
  richPoor,
  runAssay,
  twin,
} from "../../experiment.ts";
import { DESERT_ANT } from "../../desertAnt.ts";

// The behaviour assays too slow for npm test's 60 s per file (experiment.ts, docs/PRD.md §42). Those today's ants
// don't pass yet run as `todo`, naming the bead or MR meant to pass them. (G, the whole side-view game, is guarded by
// slow/side.test.ts.) A11 and A12, the longest, have files of their own (raidFind, raidStop), so the slow tier's shards
// balance (slow.yml).

// Behaviour MR 3 with ja-00t (carriers home by trail and vector): seeds 1–10 pass 10/10; 1 and 2 are both sides of the fork.
test("A1 double bridge: ≥ 80 % on the short branch", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(bridge, seed).metrics;
    assert.ok(Number.isFinite(m.shortShare));
    assert.equal(m.pass, 1, `seed ${seed}: shortShare ${m.shortShare}`);
  }
});

// Behaviour MR 3 (PRD §45): seeds 1–10 pass 10/10 (A2a and A2b).
test("A2a two equal sources: the colony concentrates on one", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(twin, seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: majorityShare ${m.majorityShare}`);
  }
});

test("A2b rich vs poor source: the colony picks the richer", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(richPoor, seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: richShare ${m.richShare}`);
  }
});

// Behaviour MR 5 (PRD §48): A5 passes 10/10 on seeds 1–10 (0.14 outside before food, 0.85 after); A5b guards that
// departures still fall once food is gone.
for (const seed of [1, 2]) {
  test(`A5 regulation: foragers stay home without food (seed ${seed})`, () => {
    const m = runAssay(regulate, seed).metrics;
    assert.ok(Number.isFinite(m.outsideBefore));
    assert.equal(m.pass, 1, `outside before ${m.outsideBefore}, after ${m.outsideAfter}`);
  });
  test(`A5b foraging stops: departures fall once food is gone (seed ${seed})`, () => {
    const m = runAssay(regulateStop, seed).metrics;
    assert.equal(m.pass, 1, `trips out per minute while food flowed ${m.departsFlow}, once gone ${m.departsGone}`);
  });
}

// Behaviour MR 4 (PRD §46): A9 passes 10/10 on seeds 1–10; A10's draw is weak (median +1.3 ants, mark 2).
test("A9 strangers meet at food: few lost per food brought home", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(contact, seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: ${m.lostPer100Food} lost per 100 food`);
  }
});

test("A10 faint alarm draws explorers", { todo: "ja-je8: the draw is weak (median +1.3 ants)" }, () => {
  const m = runAssay(faintAlarm, 1).metrics;
  assert.equal(m.pass, 1, `draw ${m.draw}`);
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
  { todo: "ja-rf5.6: few isolated returns a game, so it swings (median 7.2x, pass 5/10)" },
  () => {
    const m = runAssay(desertInvitation, 1).metrics;
    assert.equal(m.pass, 1, `ratio ${m.ratio}`);
  },
);
