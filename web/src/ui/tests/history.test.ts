import { test } from "node:test";
import assert from "node:assert/strict";
import { INFECTED } from "../../colony/index.ts";
import { endLabels, History, HISTORY_POINTS, nearestSample, niceMax, perColony, type Sample, sampleOf } from "../history.ts";
import { buildGame } from "../useColony.ts";
import { clockTicks } from "../clock.ts";

// Lab mode's history (PRD §69.7): the game sampled once a sim-second, the whole game kept in a bounded buffer.

const s = (t: number): Sample => ({ t, infected: [0], living: [10], gap: 1, mutations: 0 });

test("a sample each second of game time, no sooner", () => {
  const h = new History();
  assert.equal(
    h.offer(0, () => s(0)),
    true,
  );
  assert.equal(
    h.offer(0.5, () => s(0.5)),
    false,
  );
  assert.equal(
    h.offer(1, () => s(1)),
    true,
  );
  assert.equal(
    h.offer(1.2, () => assert.fail("not built when not due")),
    false,
  );
  assert.equal(
    h.offer(3.4, () => s(3.4)),
    true,
    "a gap: the next one taken when the time comes",
  );
  assert.deepEqual(
    h.samples.map((x) => x.t),
    [0, 1, 3.4],
  );
});

test("full, it keeps every other sample and samples half as often: the whole game, coarser", () => {
  const h = new History();
  let t = 0;
  while (h.samples.length < HISTORY_POINTS) h.offer(t++, () => s(t - 1));
  assert.equal(h.every, 1);
  h.offer(t, () => s(t));
  assert.equal(h.samples.length, HISTORY_POINTS / 2 + 1);
  assert.equal(h.every, 2);
  assert.equal(h.samples[0]!.t, 0, "the start is kept");
  assert.equal(h.samples[1]!.t, 2);
  assert.equal(
    h.offer(t + 1, () => s(t + 1)),
    false,
    "now every 2 s",
  );
  assert.equal(
    h.offer(t + 2, () => s(t + 2)),
    true,
  );
  // A long game stays bounded.
  for (let k = 0; k < 20000; k++) h.offer(t + 3 + k, () => s(t + 3 + k));
  assert.ok(h.samples.length <= HISTORY_POINTS);
  assert.equal(h.samples[0]!.t, 0);
});

test("time gone back (a restart, a load) starts the history afresh", () => {
  const h = new History();
  for (let t = 0; t < 5; t++) h.offer(t, () => s(t));
  h.offer(0, () => s(0));
  assert.deepEqual(
    h.samples.map((x) => x.t),
    [0],
  );
  assert.equal(h.every, 1);
});

test("a restart after the buffer has halved starts at one a second again (review of #226, N11)", () => {
  const h = new History();
  for (let t = 0; t <= HISTORY_POINTS; t++) h.offer(t, () => s(t));
  assert.equal(h.every, 2);
  h.offer(0, () => s(0));
  assert.equal(h.every, 1);
  assert.equal(
    h.offer(1, () => s(1)),
    true,
    "the next a second later",
  );
});

test("a sample of a real game: each colony's infected share and living ants", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 30, rival: true, generation: 0 });
  const c = g.colonies[1]!;
  const before = sampleOf(0, g.colonies, g.fungus, 1, 0);
  assert.deepEqual(before.infected, [0, 0]);
  const living = before.living[1]!;
  assert.ok(living > 0);
  for (let i = 0, n = 0; i < c.n && n < 3; i++)
    if (c.alive[i]) {
      c.load[i] = INFECTED;
      n++;
    }
  const after = sampleOf(5, g.colonies, g.fungus, 0.8, 2);
  assert.equal(after.infected[1], 3 / living);
  assert.deepEqual([after.t, after.gap, after.mutations], [5, 0.8, 2]);
});

test("a colony with no living ants: 0 alive, 0 infected, not a division by zero (review of #226, N11)", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 30, rival: true, generation: 0 });
  const c = g.colonies[1]!;
  for (let i = 0; i < c.n; i++) c.alive[i] = 0;
  const x = sampleOf(1, g.colonies, g.fungus, 1, 0);
  assert.equal(x.living[1], 0);
  assert.equal(x.infected[1], 0);
  assert.ok(x.living[0]! > 0, "the other colony is untouched");
});

test("a colony not yet founded reads as a gap, not 0 (review of #226, N3)", () => {
  const xs: Sample[] = [
    { t: 0, infected: [0.1], living: [40], gap: 1, mutations: 0 },
    { t: 1, infected: [0.2, 0], living: [38, 3], gap: 1, mutations: 0 },
  ];
  assert.deepEqual(
    perColony(xs, (x) => x.living, 1),
    [null, 3],
  );
  assert.deepEqual(
    perColony(xs, (x) => x.infected, 0),
    [0.1, 0.2],
  );
  assert.equal(niceMax([null, 3, null], 10), 10, "the axis ignores the gaps");
});

test("end labels: equal values share a label, a near one is left out, a gap has none (review of #226, N4)", () => {
  const y = (v: number) => 100 - v; // higher values sit higher up
  const whole = (v: number) => String(Math.round(v));
  assert.deepEqual(
    endLabels(
      [
        { name: "Ink", value: 60 },
        { name: "Amber", value: 60.2 },
        { name: "Jade", value: 55 },
        { name: "Rust", value: 20 },
        { name: "Slate", value: null },
      ],
      y,
      whole,
    ),
    [
      { names: ["Amber", "Ink"], value: 60.2, y: 39.8 },
      { names: ["Rust"], value: 20, y: 80 },
    ],
  );
});

test("a round top for the y axis, and the crosshair's nearest sample", () => {
  assert.equal(niceMax([0.3]), 1, "the floor");
  assert.equal(niceMax([140], 1), 200);
  assert.equal(niceMax([60]), 100);
  assert.equal(niceMax([3.2]), 5);
  assert.equal(niceMax([500]), 500);
  assert.equal(niceMax([0.03], 0.1), 0.1, "a share: the floor");
  assert.equal(niceMax([0.27], 0.1), 0.5);
  const xs = [0, 1, 2, 4, 8].map(s);
  assert.equal(nearestSample(xs, -3), 0);
  assert.equal(nearestSample(xs, 1.4), 1);
  assert.equal(nearestSample(xs, 1.6), 2);
  assert.equal(nearestSample(xs, 5.9), 3);
  assert.equal(nearestSample(xs, 6.1), 4);
  assert.equal(nearestSample(xs, 99), 4);
  assert.equal(nearestSample([], 3), -1);
});

test("the step control's time, to the tick: a float hair under a second is the next second (review of #226, N5)", () => {
  assert.equal(clockTicks(0), "0:00 +00/30");
  assert.equal(clockTicks(13 + 7 / 30), "0:13 +07/30");
  let t = 0;
  for (let k = 0; k < 15 * 30; k++) t += 1 / 30; // summed as the game sums its ticks
  assert.ok(t !== 15, "the sum drifts off a whole second");
  assert.equal(clockTicks(t), "0:15 +00/30");
  assert.equal(clockTicks(3600 + 29 / 30), "1:00:00 +29/30");
});
