import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng, nearestRival, recognitionShare, type GameSave } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { GENERIC_ANT, type Species } from "../../species.ts";
import { NEGLECTUS_ANT } from "../../neglectus.ts";
import { odourDistance } from "../../recognition.ts";
import { hashGame } from "../saveHash.ts";
import { run } from "../builders.ts";

// S3 of the odour space (ja-zg1u.5, PRD §91) in a game: a species' odourWeights reach every colony and every measure of the game.

const sniffer = (w: number[], base: Species = GENERIC_ANT): Species => ({ ...base, params: { ...base.params, odourWeights: w } });

const small = (species: Species, odours: number[][], ants = 40, params = {}): Game =>
  new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), { species, ...params }, gameRng(7), [
    { antCount: ants, odour: odours[0] as number[] },
    { antCount: ants, odour: odours[1] as number[] },
  ]);

const copy = (s: GameSave): GameSave => JSON.parse(JSON.stringify(s)) as GameSave;

// Two colonies that differ only on axes 1-3.
const SAME_ON_0 = [
  [0.5, 0, 0, 0],
  [0.5, 1, 1, 1],
];

test("the species' weights reach every colony; none (or all 1) is no weights at all", () => {
  const g = small(sniffer([1, 0, 0, 0]), SAME_ON_0);
  for (const c of g.colonies) assert.deepEqual([...(c.odourW as Float64Array)], [1, 0, 0, 0]);
  for (const sp of [GENERIC_ANT, sniffer([1, 1, 1, 1])]) for (const c of small(sp, SAME_ON_0).colonies) assert.equal(c.odourW, null);
  assert.throws(
    () => small(sniffer([1, 0, 0, 0]), SAME_ON_0, 40, { recognition: { odourAxes: 1 } }),
    /odour weights: 4 given, the game has 1/,
  );
  assert.throws(() => small(sniffer([1, 3, 0, 0]), SAME_ON_0), /odour weights/);
});

test("a one-axis species sees colonies differing only on axes 1-3 as one: raids, unity and the gap agree; the generic ant sees strangers", () => {
  const one = small(sniffer([1, 0, 0, 0]), SAME_ON_0);
  const [a, b] = one.colonies as [(typeof one.colonies)[0], (typeof one.colonies)[0]];
  assert.ok(odourDistance(4, a.nestVec, 0, b.nestVec, 0) > 1.7);
  assert.equal(nearestRival(a, one.colonies, one.recognition.params.tolerance), null, "kin by the axis it smells: no raid");
  assert.equal(one.unity().gap, 0);
  assert.equal(one.unity().alike, true);
  const gen = small(GENERIC_ANT, SAME_ON_0);
  assert.equal(nearestRival(gen.colonies[0]!, gen.colonies, gen.recognition.params.tolerance), gen.colonies[1]);
  assert.ok(gen.unity().gap > 1.7);
  // Differing on axis 0: strangers to the one-axis species.
  const diff = small(sniffer([1, 0, 0, 0]), [
    [0, 0.5, 0.5, 0.5],
    [1, 0.5, 0.5, 0.5],
  ]);
  assert.equal(nearestRival(diff.colonies[0]!, diff.colonies, diff.recognition.params.tolerance), diff.colonies[1]);
  assert.equal(diff.unity().gap, 1);
});

test("neglectus's one population keeps its wide tolerance at the species' weighted diameter, sqrt(sum w), and the unity score is whole", () => {
  assert.equal(small(NEGLECTUS_ANT, SAME_ON_0).recognition.params.tolerance, 2);
  const w = [1, 0.5, 0.25, 0.25];
  const g = small(sniffer(w, NEGLECTUS_ANT), SAME_ON_0);
  assert.ok(Math.abs(g.recognition.params.tolerance - Math.sqrt(2)) < 1e-12);
  const gap = g.unity().gap;
  assert.ok(gap <= g.recognition.params.tolerance + 1e-12, `the corners are the diameter apart at most: ${gap}`);
  const u = g.unity();
  assert.equal(u.alike, true);
  assert.ok(Number.isFinite(u.score));
  const corners = small(sniffer(w, NEGLECTUS_ANT), [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
  ]);
  assert.ok(Math.abs(corners.unity().gap - Math.sqrt(2)) < 1e-12);
  assert.equal(corners.unity().alike, true, "even the two corners are one population");
});

test("a one-axis species' colonies that differ on axes 1-3 only lose no ant to a fight when they meet, where the generic ant's, at the same odours, do", () => {
  const losses = (sp: Species): number => {
    const g = small(sp, SAME_ON_0, 60);
    const [a, b] = g.colonies as [(typeof g.colonies)[0], (typeof g.colonies)[0]];
    const before = a.population + b.population;
    // Every ant of both colonies on one spot: meeting is not left to the walks.
    const x = a.x[0] as number;
    const y = a.y[0] as number;
    for (const c of [a, b])
      for (let i = 0; i < c.n; i++) {
        c.x[i] = x;
        c.y[i] = y;
      }
    run(g, 3);
    return before - (a.population + b.population);
  };
  assert.equal(losses(sniffer([1, 0, 0, 0])), 0);
  assert.ok(losses(GENERIC_ANT) > 0, "the control fights");
});

test("weights are species config, not state: the derived weights are not saved, and a save loads into a game of the same species and runs on as the unbroken one", () => {
  const sp = sniffer([1, 0.5, 0.25, 0.1]);
  const a = small(sp, SAME_ON_0);
  run(a, 15);
  const saved = copy(a.save());
  assert.ok(!JSON.stringify(saved).includes('odourW"'), "the derived weights are not saved (the species gives them back)");
  assert.ok(
    !JSON.stringify(copy(small(GENERIC_ANT, SAME_ON_0).save())).includes("odourWeights"),
    "a game without weights saves as it always did",
  );
  const b = small(sp, SAME_ON_0);
  b.load(copy(saved));
  assert.equal(hashGame(b), hashGame(a));
  run(a, 10);
  run(b, 10);
  assert.equal(hashGame(b), hashGame(a), "and after running on");
});

test("two colonies of different weights each judge by their own: mixing and the allied contact read the perceiver's weights, not the other colony's", () => {
  // Same on axis 0, far apart on axis 1: A (weights on axis 0) takes B for kin, B (weights on axis 1) takes A for a stranger.
  const odours = [
    [0.5, 0, 0, 0],
    [0.5, 1, 0, 0],
  ];
  const build = (wa: number[], wb: number[], antsA: number, antsB: number): Game =>
    new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), {}, gameRng(7), [
      { antCount: antsA, odour: odours[0] as number[], colony: { odourWeights: wa } },
      { antCount: antsB, odour: odours[1] as number[], colony: { odourWeights: wb } },
    ]);
  const meetAt = (g: Game): void => {
    const [a, b] = g.colonies as [(typeof g.colonies)[0], (typeof g.colonies)[0]];
    const x = a.x[0] as number;
    const y = a.y[0] as number;
    for (const c of [a, b])
      for (let i = 0; i < c.n; i++) {
        c.x[i] = x;
        c.y[i] = y;
      }
  };
  const w0 = [1, 0, 0, 0];
  const w1 = [0, 1, 0, 0];
  // mixing = ants within tolerance of another colony's nest, by their own colony's weights: 20 of 80 when A is the kin-seeing one, 60 of 80 when B is.
  const ab = build(w0, w1, 20, 60);
  const ba = build(w1, w0, 20, 60);
  assert.ok(Math.abs(ab.unity().mixing - 20 / 80) < 1e-9, `A sees kin: ${ab.unity().mixing}`);
  assert.ok(Math.abs(ba.unity().mixing - 60 / 80) < 1e-9, `B sees kin: ${ba.unity().mixing}`);
  // allied contact (metBy, per colony): only the colony that sees kin has met an ally
  const g = build(w0, w1, 30, 30);
  meetAt(g);
  run(g, 2);
  const [metA, metB] = (g.save().private as { metBy: number[] }).metBy as [number, number];
  assert.ok(metA > 0 && metB === 0, `metBy ${metA}, ${metB}`);
});

test("the unity score's recognition share is 1 within the tolerance and falls to 0 at the diameter, and a weighted diameter is smaller", () => {
  assert.equal(recognitionShare(0.35, 2, 0.3), 1);
  assert.equal(recognitionShare(2, 2, 5), 1);
  assert.equal(recognitionShare(0.35, 2, 2), 0);
  assert.ok(recognitionShare(0.35, 1, 0.5) < recognitionShare(0.35, 2, 0.5), "the same gap is further along a narrower space");
});

test("unity's score uses the species' weighted diameter: weights [1,0,0,0], gap 0.6, the score is recognitionShare(0.35, 1, 0.6), not the sqrt(K) one", () => {
  const odours = [
    [0.2, 0.5, 0.5, 0.5],
    [0.8, 0.5, 0.5, 0.5],
  ];
  const sp = sniffer([1, 0, 0, 0]);
  const saved = copy(small(sp, odours).save());
  // Quiet for long enough and already met, so the score is the recognition share alone.
  saved.time = 1e6;
  (saved.private as { haveMet: boolean }).haveMet = true;
  const b = small(sp, odours);
  b.load(saved);
  const u = b.unity();
  assert.ok(Math.abs(u.gap - 0.6) < 1e-6, `gap ${u.gap}`);
  const want = recognitionShare(0.35, 1, u.gap);
  assert.ok(Math.abs(want - 0.6154) < 1e-3);
  assert.ok(
    Math.abs(u.score - want) < 1e-9,
    `score ${u.score}, want ${want} (the sqrt(K) diameter gives ${recognitionShare(0.35, 2, u.gap)})`,
  );
});
