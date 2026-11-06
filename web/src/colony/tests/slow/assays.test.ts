import { test } from "node:test";
import assert from "node:assert/strict";
import { bridge, contact, faintAlarm, regulate, regulateStop, richPoor, runAssay, twin } from "../../experiment.ts";

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

// Behaviour MR 5 (PRD §47): A5 passes 10/10 on seeds 1–10 (0.14 outside before food, 0.85 after); A5b guards that
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
