import { test } from "node:test";
import assert from "node:assert/strict";
import { bridge, contact, faintAlarm, raidFind, raidStop, regulate, regulateStop, richPoor, runAssay, twin } from "../../experiment.ts";

// The behaviour assays too slow for npm test's 60 s per file (experiment.ts, docs/PRD.md §42). Those today's ants
// don't pass yet run as `todo`, naming the bead or MR meant to pass them. (G, the whole side-view game, is guarded by
// slow/side.test.ts.)

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

// Behaviour MR 5.2 (PRD §49): raids by trail. A11's trail gain is 1.24 (0.89–2.75) and 7/20 seeds reach its mark of 1.5; guarded as
// what holds today: none is stuck and the trail never hurts. The mark itself is a todo (ja-sf1).
test("A11 raiders find the rival: none stuck, and the raid trail does not hurt", () => {
  const gains: number[] = [];
  for (let seed = 1; seed <= 10; seed++) {
    const m = runAssay(raidFind, seed).metrics;
    assert.ok((m.stuck as number) <= 0.1, `seed ${seed}: stuck ${m.stuck}`);
    gains.push(m.gain as number);
  }
  gains.sort((a, b) => a - b);
  assert.ok((gains[5] as number) >= 1, `median gain ${gains[5]}`);
});

test("A11 the raid trail gains 1.5× on most seeds", { todo: "ja-sf1: gain 1.24 median, 7/20 seeds" }, () => {
  let passed = 0;
  for (let seed = 1; seed <= 10; seed++) passed += runAssay(raidFind, seed).metrics.pass as number;
  assert.ok(passed >= 6, `${passed}/10`);
});

// Behaviour MR 5.2 (PRD §49.5): A12 passes 20/20 at raidPatience 120 (food stored 0.86 of the forage colony's, worst 0.73); before the
// call-off it stored 10 of 7,400.
test("A12 a raid no one can find is called off: the colony eats again", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(raidStop, seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: stored ${m.stored} of ${m.control}`);
  }
});

test("A10 faint alarm draws explorers", { todo: "ja-je8: the draw is weak (median +1.3 ants)" }, () => {
  const m = runAssay(faintAlarm, 1).metrics;
  assert.equal(m.pass, 1, `draw ${m.draw}`);
});
