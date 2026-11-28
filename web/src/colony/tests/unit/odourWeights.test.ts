import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotAttackCue } from "../../attackCue.ts";
import { CountGrid, occupancy, resolveFights } from "../../battle.ts";
import { Colony } from "../../colony.ts";
import {
  MAX_MASK,
  Recognition,
  STRANGER_EPS,
  bandDistance,
  binCentre,
  binOf,
  checkOdourWeights,
  driftAimVec,
  driftDirection,
  odourDiameter,
  odourDistance,
} from "../../recognition.ts";
import { enemyHeading } from "../../sense.ts";
import { TOLERANCE } from "../../vocab.ts";
import { mulberry32 } from "../../world.ts";
import { hexMap, put } from "../hexmaps.ts";

// S3 of the odour space (ja-zg1u.5, docs/odour-space.md, PRD §91): a species' odour axis weights. d = sqrt(sum w_k (a_k - b_k)^2), each weight 0..1,
// measured by the perceiver. Weights 1 (absent) are the code of S2 bit for bit: the goldens and the bench hashes hold that, these hold the rest.

const K = 4;
const WEIGHTS: (number[] | null)[] = [
  null,
  [1, 0, 0, 0],
  [0, 0, 0, 1],
  [1, 0.5, 0.25, 0.1],
  [0.3, 0.3, 0.3, 0.3],
  [1, 1, 0, 0],
  [0.9, 0.2, 0.7, 0.4],
];

test("checkOdourWeights: absent or all 1 is null; a list of K numbers in 0..1 with one above 0 is kept; the rest is a clear error", () => {
  assert.equal(checkOdourWeights(undefined, K), null);
  assert.equal(checkOdourWeights(null, K), null);
  assert.equal(checkOdourWeights([1, 1, 1, 1], K), null);
  assert.deepEqual([...(checkOdourWeights([1, 0, 0, 0.5], K) as Float64Array)], [1, 0, 0, 0.5]);
  assert.throws(() => checkOdourWeights([1, 0, 0], K), /3 given, the game has 4/);
  assert.throws(() => checkOdourWeights([1, 1, 1, 1.5], K), /axis 3 is 1\.5.*0 to 1/);
  assert.throws(() => checkOdourWeights([1, -0.1, 1, 1], K), /axis 1/);
  assert.throws(() => checkOdourWeights([1, NaN, 1, 1], K), /axis 1/);
  assert.throws(() => checkOdourWeights([0, 0, 0, 0], K), /all 0/);
  const map = hexMap(["....."]);
  assert.throws(() => new Colony(map, { odourAxes: K, odourWeights: [1, 2, 1, 1] }, mulberry32(1)), /odour weights/);
  assert.throws(() => new Colony(map, { odourWeights: [1, 0, 0, 0] }, mulberry32(1)), /4 given, the game has 1/);
  assert.equal(new Colony(map, { odourAxes: K }, mulberry32(1)).odourW, null);
  assert.equal(new Colony(map, { odourAxes: K, odourWeights: [1, 1, 1, 1] }, mulberry32(1)).odourW, null);
});

test("odourDiameter is sqrt(sum w): sqrt(K) unweighted, and the distance never exceeds it", () => {
  assert.equal(odourDiameter(4, null), 2);
  assert.ok(Math.abs(odourDiameter(4, [1, 0.5, 0.25, 0.25]) - Math.sqrt(2)) < 1e-12);
  const rand = mulberry32(9);
  for (const w of WEIGHTS) {
    const D = odourDiameter(K, w);
    for (let t = 0; t < 200; t++) {
      const a = Array.from({ length: K }, () => Math.round(rand()));
      const b = Array.from({ length: K }, () => Math.round(rand()));
      assert.ok(odourDistance(K, a, 0, b, 0, w) <= D + 1e-12);
    }
    assert.ok(Math.abs(odourDistance(K, [0, 0, 0, 0], 0, [1, 1, 1, 1], 0, w) - D) < 1e-12, "the corners are the diameter apart");
  }
});

test("weights at most 1 never raise the distance, so the weighted distance is within the unweighted", () => {
  const rand = mulberry32(3);
  for (let t = 0; t < 2000; t++) {
    const a = Array.from({ length: K }, rand);
    const b = Array.from({ length: K }, rand);
    const w = Array.from({ length: K }, rand);
    assert.ok(odourDistance(K, a, 0, b, 0, w) <= odourDistance(K, a, 0, b, 0) + 1e-12);
  }
});

// O2 with weights: a host is never a stranger to its own nest, the nest's perceived tolerance as its own colony measures it. Through the game's own step.
test("O2 with weights: Recognition.advance at K = 4 leaves each host within its own nest's tolerance, under the species' weights, at every corner and random nests", () => {
  const map = hexMap(["....."]);
  const rand = mulberry32(2027);
  const nests: number[][] = [];
  for (let m = 0; m < 1 << K; m++) nests.push(Array.from({ length: K }, (_, k) => (m >> k) & 1));
  for (let t = 0; t < 60; t++) nests.push(Array.from({ length: K }, rand));
  let worst = 0;
  for (const w of WEIGHTS)
    for (const odour of nests) {
      const c = new Colony(map, { antCount: 13, maxAnts: 13, nest: 0, odour, odourAxes: K, odourWeights: w ?? undefined }, mulberry32(1));
      for (let i = 0; i < 13; i++) c.mask[i] = (MAX_MASK * i) / 12;
      new Recognition({ odourAxes: K }).advance([c], 1);
      for (let i = 0; i < 13; i++) {
        const d = bandDistance(c.odour, i * K, c.nestVec, 0, K, c.odourW);
        worst = Math.max(worst, d);
        assert.ok(d <= TOLERANCE + STRANGER_EPS, `weights ${w} nest ${odour} share ${i}: ${d}`);
      }
    }
  assert.ok(worst > 0.2, `the host moves (worst ${worst})`);
});

/** Two colonies of one ant each, in one cell, K = 4, the given nests, weights, and a tolerance for both. */
function pair(oa: number[], ob: number[], wa: number[] | null, wb: number[] | null, tol: number) {
  const map = hexMap([".....", ".....", "....."]);
  const cs = [
    new Colony(
      map,
      { antCount: 1, maxAnts: 1, nest: 0, odour: oa, odourAxes: K, tolerance: tol, odourWeights: wa ?? undefined },
      mulberry32(1),
    ),
    new Colony(
      map,
      { antCount: 1, maxAnts: 1, nest: 0, odour: ob, odourAxes: K, tolerance: tol, odourWeights: wb ?? undefined },
      mulberry32(2),
    ),
  ];
  for (const c of cs) {
    put(c, 0, 2, 1);
    c.attackLayer[0] = c.layer[0];
    for (let k = 0; k < K; k++) c.odour[k] = c.nestVec[k] as number;
    c.tolerance[0] = tol;
  }
  return cs as [Colony, Colony];
}

/** Brute force, written out: is `other` (in its band) a stranger to the perceiver, as the perceiver's weights measure the band's centre against its own odour? */
function strangerTo(perceiver: Colony, other: Colony, w: number[] | null, tol: number): boolean {
  let s = 0;
  for (let k = 0; k < K; k++) {
    const d = binCentre(binOf(other.odour[k] as number)) - (perceiver.odour[k] as number);
    s += (w === null ? 1 : (w[k] as number)) * d * d;
  }
  return Math.sqrt(s) > tol + STRANGER_EPS;
}

const fight = (cs: Colony[], rec: Recognition | null, p: object) =>
  resolveFights(
    cs,
    cs.map((c) => occupancy(c, new CountGrid())),
    1,
    () => 0,
    { rate: 1, alarm: 1, ...p },
    rec,
  );

test("fights, the attack cue and the sense of an enemy all agree with a brute-force oracle under random, different weights for the two colonies", () => {
  const rand = mulberry32(88);
  const seen = { hit: 0, miss: 0 };
  for (let t = 0; t < 400; t++) {
    const oa = Array.from({ length: K }, () => Math.fround(rand()));
    const ob = Array.from({ length: K }, () => Math.fround(rand()));
    const wa = WEIGHTS[Math.floor(rand() * WEIGHTS.length)] as number[] | null;
    const wb = (rand() < 0.5 ? WEIGHTS[Math.floor(rand() * WEIGHTS.length)] : Array.from({ length: K }, () => rand())) as number[] | null;
    const tol = 0.15 + rand() * 0.8;
    const make = () => pair(oa, ob, wa, wb, tol);
    // Who sees whom as a stranger, from the oracle: the perceiver's weights, the other's band.
    const [A, B] = make();
    const aSeesB = strangerTo(A, B, wa, tol);
    const bSeesA = strangerTo(B, A, wb, tol);
    seen[aSeesB ? "hit" : "miss"]++;
    // Directed attack (pressure by band, reach 1): B attacks A when A is a stranger to B (the attacker's weights); a hit is a death with rng 0.
    {
      const cs = make();
      const rec = new Recognition({ odourAxes: K, tolerance: tol });
      rec.build(cs);
      assert.deepEqual(
        fight(cs, rec, { intent: true, attackReach: 1 }),
        [bSeesA ? 1 : 0, aSeesB ? 1 : 0],
        `pressure t=${t} wa ${wa} wb ${wb} tol ${tol}`,
      );
    }
    // Directed attack by distance, the same cell.
    {
      const cs = make();
      const rec = new Recognition({ odourAxes: K, tolerance: tol });
      rec.build(cs);
      assert.deepEqual(fight(cs, rec, { intent: true, attackDistance: 1 }), [bSeesA ? 1 : 0, aSeesB ? 1 : 0], `distance t=${t}`);
    }
    // Contact fights by the ant's own look (no intent): the victim's own weights measure the other.
    {
      const cs = make();
      const rec = new Recognition({ odourAxes: K, tolerance: tol });
      rec.build(cs);
      assert.deepEqual(fight(cs, rec, {}), [aSeesB ? 1 : 0, bSeesA ? 1 : 0], `contact t=${t}`);
    }
    // The attack cue: the ant a stranger attacker is at its side reads the cue by its own weights.
    {
      const cs = make();
      const cue = snapshotAttackCue(cs);
      assert.equal(cue(cs[0], 0), aSeesB, `cue A t=${t}`);
      assert.equal(cue(cs[1], 0), bSeesA, `cue B t=${t}`);
    }
    // The sense of an enemy near: the ant's look at the bands, by its own weights.
    {
      const cs = make();
      const rec = new Recognition({ odourAxes: K, tolerance: tol });
      rec.build(cs);
      for (const c of cs) c.enemies = rec;
      assert.equal(enemyHeading(cs[0], 0) !== null, aSeesB, `sense A t=${t}`);
      assert.equal(enemyHeading(cs[1], 0) !== null, bSeesA, `sense B t=${t}`);
    }
  }
  assert.ok(seen.hit > 60 && seen.miss > 60, `both outcomes are covered ${JSON.stringify(seen)}`);
});

test("a one-axis species recognises on that axis only: colonies that differ only on axes 1-3 are not strangers, on axis 0 they are", () => {
  const w = [1, 0, 0, 0];
  const tol = TOLERANCE;
  // Differ on axes 1..3 as far as the cube allows: strangers to the unweighted ant, kin to the one-axis one.
  const [a, b] = pair([0.5, 0, 0, 0], [0.5, 1, 1, 1], w, w, tol);
  assert.ok(odourDistance(K, a.nestVec, 0, b.nestVec, 0) > 1.7, "far apart in the space");
  assert.equal(odourDistance(K, a.nestVec, 0, b.nestVec, 0, w), 0, "and the same on the axis it smells");
  const rec = new Recognition({ odourAxes: K, tolerance: tol });
  rec.build([a, b]);
  assert.deepEqual(fight([a, b], rec, { intent: true }), [0, 0]);
  assert.deepEqual(fight([a, b], rec, {}), [0, 0]);
  for (const c of [a, b]) c.enemies = rec;
  assert.equal(enemyHeading(a, 0), null);
  assert.equal(snapshotAttackCue([a, b])(a, 0), false);
  // The same two with every axis counting: strangers (the control).
  const [c, d] = pair([0.5, 0, 0, 0], [0.5, 1, 1, 1], null, null, tol);
  const rec2 = new Recognition({ odourAxes: K, tolerance: tol });
  rec2.build([c, d]);
  assert.deepEqual(fight([c, d], rec2, { intent: true }), [1, 1]);
  // Differing on axis 0 alone: strangers to the one-axis species.
  const [e, f] = pair([0.1, 0.5, 0.5, 0.5], [0.9, 0.5, 0.5, 0.5], w, w, tol);
  const rec3 = new Recognition({ odourAxes: K, tolerance: tol });
  rec3.build([e, f]);
  assert.deepEqual(fight([e, f], rec3, { intent: true }), [1, 1]);
  // And a one-axis species on the last axis reads that one only.
  const [g, h] = pair([0.5, 0, 1, 0.1], [0.5, 1, 0, 0.9], [0, 0, 0, 1], [0, 0, 0, 1], tol);
  const rec4 = new Recognition({ odourAxes: K, tolerance: tol });
  rec4.build([g, h]);
  assert.deepEqual(fight([g, h], rec4, { intent: true }), [1, 1]);
});

test("one Recognition looked at by two perceivers who share an odour but not their weights answers each by its own (the look memo keys the weights)", () => {
  const cs = pair([0.5, 0.5, 0.5, 0.5], [0.5, 1, 1, 1], null, null, 0.35);
  const rec = new Recognition({ odourAxes: K });
  rec.build(cs);
  const look = [0.5, 0.5, 0.5, 0.5];
  const count = (w: number[] | null) => {
    rec.look(look, 0, 0.35, w);
    return rec.around(2, 1, cs[0].map);
  };
  const full = count(null);
  const one = count([1, 0, 0, 0]);
  const other = count([0, 1, 0, 0]);
  const again = count(null);
  assert.equal(full, 1);
  assert.equal(one, 0);
  assert.equal(other, 1, "axis 1 differs by 0.45");
  assert.equal(again, full);
  // an array of the same weights from another colony is still its own cache (same tolerance, same odour, other weights)
  assert.equal(count([0.1, 0.1, 0.1, 0.1]), 0);
});

test("a daughter's drift under weights goes 1.5 tolerances in the weighted distance, on the axes the species smells only", () => {
  for (const w of [
    [1, 0, 0, 0],
    [0, 0, 1, 0.8],
    [0.9, 0, 0.8, 0],
  ]) {
    for (let s = 0; s < 60; s++) {
      const mother = [0.4, 0.4, 0.4, 0.4];
      const aim = driftAimVec(mother, TOLERANCE, driftDirection(3, s * 13, s * 7, K), w);
      const d = odourDistance(K, aim, 0, mother, 0, w);
      // A step of at most 0.6 on an axis from 0.4 stays in the cube either way (turned or not), so none is clamped (past that the step is cut short, as it is unweighted).
      assert.ok(Math.abs(d - 1.5 * TOLERANCE) < 1e-9, `weights ${w}: ${d}`);
      for (let k = 0; k < K; k++) if (w[k] === 0) assert.equal(aim[k], mother[k], "an axis it cannot smell stays");
    }
  }
  // no weights: the direction as it was
  const dir = driftDirection(3, 5, 5, K);
  assert.deepEqual([...driftAimVec([0.5, 0.5, 0.5, 0.5], TOLERANCE, dir, null)], [...driftAimVec([0.5, 0.5, 0.5, 0.5], TOLERANCE, dir)]);
});

test("a look at weights with zeros counts the axes left only", () => {
  const cs = pair([0.2, 0.1, 0.1, 0.1], [0.9, 0.9, 0.9, 0.9], null, null, 0.35);
  const rec = new Recognition({ odourAxes: K });
  rec.build(cs);
  rec.look([0.2, 0.9, 0.9, 0.9], 0, 0.35, [1, 0, 0, 0]);
  assert.equal(rec.around(2, 1, cs[0].map), 1, "axis 0 differs by 0.7 and nothing else counts");
  rec.look([0.9, 0, 0, 0], 0, 0.35, [1, 0, 0, 0]);
  assert.equal(rec.around(2, 1, cs[0].map), 1, "the first colony band (0.25) is 0.65 from 0.9, the other (0.95) is 0.05 from it");
});
