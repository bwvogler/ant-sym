import { test } from "node:test";
import assert from "node:assert/strict";
import { answersFor, canonicalState, hash, inverse, PolicyCache, quantise, readSituation, situationKey, TRANSFORMS, turnCells, turnName, type CachedAnswer } from "../policyCache.ts";
import { packRequest, POLICY_CONTEXT, readDecision, SITUATION_LEGEND, type AntState } from "../jevBrain.ts";
import { compass } from "../ants.ts";

// One neighbour to the north wants ants; the ant's own cell is full; far points north-east.
const NORTH: AntState = { deficit3x3: [0, 2, 0, 0, -1, 0, 0, 0, 0], room: -1, crowd: 3, heading: "E", nearbyHeadings: ["N"], idle: 1.2, far: "NE", attractor: null };

/** The same situation turned by t: cells moved, directions turned. */
function turned(s: AntState, t: (typeof TRANSFORMS)[number]): AntState {
  return { ...s, deficit3x3: turnCells(s.deficit3x3, t), far: s.far && turnName(s.far, t), attractor: s.attractor && turnName(s.attractor, t) };
}

test("turnName: a quarter turn clockwise on screen takes N → E → S → W; a flip swaps east and west; stay passes through", () => {
  const q = { turns: 1 as const, flip: false };
  assert.deepEqual(["N", "E", "S", "W", "NE"].map((n) => turnName(n, q)), ["E", "S", "W", "N", "SE"]);
  assert.deepEqual(["E", "NE", "N"].map((n) => turnName(n, { turns: 0, flip: true })), ["W", "NW", "N"]);
  assert.equal(turnName("stay", q), "stay");
});

test("every transform has an inverse that undoes it on names and on the 3×3 cells", () => {
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (const t of TRANSFORMS) {
    for (const n of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]) assert.equal(turnName(turnName(n, t), inverse(t)), n);
    assert.deepEqual(turnCells(turnCells(cells, t), inverse(t)), cells);
    assert.equal(turnCells(cells, t)[4], 4, "the centre stays the centre");
  }
});

test("turnCells moves a cell with its compass direction", () => {
  const north = [0, 1, 0, 0, 0, 0, 0, 0, 0]; // the N cell
  for (const t of TRANSFORMS) {
    const k = turnCells(north, t).indexOf(1);
    const name = ["NW", "N", "NE", "W", "", "E", "SW", "S", "SE"][k];
    assert.equal(name, turnName("N", t));
  }
});

test("quantise: want above 0.3, over below −0.5, the centre is the ant's room", () => {
  const q = quantise({ ...NORTH, deficit3x3: [0.31, 0.3, -0.5, -0.51, 5, 1, 0, 0, 0], room: 0 });
  assert.deepEqual(q.cells, ["w", "n", "n", "o", "r", "w", "n", "n", "n"]);
  assert.equal(quantise(NORTH).cells[4], "x");
});

test("situationKey: all 8 turned and mirrored copies of a situation share one key, and the per-ant fields do not matter", () => {
  const { key } = situationKey(NORTH);
  for (const t of TRANSFORMS) assert.equal(situationKey(turned(NORTH, t)).key, key);
  assert.equal(situationKey({ ...NORTH, crowd: 9, heading: "S", nearbyHeadings: [], idle: 30 }).key, key);
  assert.notEqual(situationKey({ ...NORTH, room: 0 }).key, key, "the ant's room is part of the situation");
});

test("situationKey: the far and overseer hints count only when the ant must move and no neighbour wants it", () => {
  const open: AntState = { ...NORTH, deficit3x3: [0, 0, 0, 0, -1, 0, 0, -1, 0], far: "NE", attractor: "N" };
  assert.notEqual(situationKey({ ...open, far: "SW" }).key, situationKey(open).key);
  assert.notEqual(situationKey({ ...open, attractor: null }).key, situationKey(open).key);
  assert.equal(situationKey({ ...NORTH, far: "SW" }).key, situationKey(NORTH).key, "a wanting neighbour wins: the hint is dropped");
  assert.equal(situationKey({ ...open, room: 0, far: "SW" }).key, situationKey({ ...open, room: 0 }).key, "room to stay wins too");
  for (const t of TRANSFORMS) assert.equal(situationKey(turned(open, t)).key, situationKey(open).key);
});

test("an answer given in the canonical frame turns back into each ant's own frame", () => {
  // Jev, asked about the canonical situation, sends the ant to the wanting cell.
  const { key } = situationKey(NORTH);
  const canon = canonicalState(key);
  const wantK = canon.deficit3x3.findIndex((v, k) => k !== 4 && v > 0);
  const canonDir = ["NW", "N", "NE", "W", "", "E", "SW", "S", "SE"][wantK] as string;
  const cached: CachedAnswer = { choice: canonDir, confidence: 0.8, probabilities: { [canonDir]: 0.8, stay: 0.2 }, pSettle: 0.1 };
  for (const t of TRANSFORMS) {
    const ant = turned(NORTH, t);
    const sk = situationKey(ant);
    const answers = answersFor("a7", cached, sk.transform);
    const d = readDecision(answers, "a7", "cached");
    assert.equal(compass(d?.heading as number), turnName("N", t), "every copy is sent to its own wanting cell");
    const dir = answers.a7_dir;
    assert.ok(dir?.type === "choice" && dir.probabilities?.stay === 0.2);
  }
});

test("canonicalState: representative values that quantise back to the same key, and no per-ant fields", () => {
  const { key } = situationKey(NORTH);
  const s = canonicalState(key);
  assert.equal(situationKey({ ...s, crowd: 0, heading: "E", nearbyHeadings: [], idle: 0 }).key, key);
  assert.deepEqual(Object.keys(s).sort(), ["attractor", "deficit3x3", "far", "room"]);
});

test("readSituation: caches a well-formed dir + settle pair; rejects unknown choices and missing parts", () => {
  const ok = readSituation({ s0_dir: { type: "choice", choice: "N", confidence: 0.7, probabilities: { N: 0.7, stay: 0.3 } }, s0_settle: { type: "noul", noul: 0.2 } }, "s0");
  assert.deepEqual(ok, { choice: "N", confidence: 0.7, probabilities: { N: 0.7, stay: 0.3 }, pSettle: 0.2 });
  const noProbs = readSituation({ s0_dir: { type: "choice", choice: "stay", probabilities: {} }, s0_settle: { type: "noul", noul: 0.9 } }, "s0");
  assert.deepEqual(noProbs?.probabilities, { stay: 1 }, "an empty map would make sampling throw");
  assert.equal(readSituation({ s0_dir: { type: "choice", choice: "up" }, s0_settle: { type: "noul", noul: 0.2 } }, "s0"), null);
  assert.equal(readSituation({ s0_dir: { type: "choice", choice: "N" } }, "s0"), null);
  assert.equal(readSituation({ s0_dir: { type: "choice", choice: "N" }, s0_settle: { type: "noul", noul: Number.NaN } }, "s0"), null);
});

test("packRequest (cached): the situation legend, one dir + settle pair per situation", () => {
  const r = packRequest([{ id: "s0", state: canonicalState(situationKey(NORTH).key) }], "cached");
  assert.equal((r.state as { legend: string }).legend, SITUATION_LEGEND);
  assert.deepEqual(Object.keys(r.questions).sort(), ["s0_dir", "s0_settle"]);
  assert.equal(r.questions.s0_dir?.type, "choice");
});

test("PolicyCache keeps answers per context; the context names the schema version and changes with the wording", () => {
  const c = new PolicyCache(POLICY_CONTEXT);
  const a: CachedAnswer = { choice: "N", confidence: 1, probabilities: { N: 1 }, pSettle: 0 };
  c.put("k", a);
  assert.equal(c.get("k"), a);
  assert.equal(new PolicyCache(POLICY_CONTEXT, c.entries()).size, 1, "round-trips through entries()");
  c.clear();
  assert.equal(c.size, 0);
  assert.match(POLICY_CONTEXT, /^cached-v\d+-[0-9a-f]{8}$/);
  assert.notEqual(hash("a"), hash("b"));
});
