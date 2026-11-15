import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, INFECTED, MODES, PLANE } from "../../colony/index.ts";
import { freeNumber, living, MAX_SPECIMENS, pin, sameAnt, specimenLabel, specimenRow, unpin } from "../specimens.ts";
import { buildGame } from "../useColony.ts";

// Specimens (PRD §69.5): up to three pinned ants, compared in the inspector, each keeping its number.

const ant = (k: number, i: number, gen = 0) => ({ k, i, gen });
const nos = (list: { no: number }[]) => list.map((s) => s.no);
// One game for the tests that read a real one (each touches its own colony).
let built: ReturnType<typeof buildGame> | null = null;
const aGame = () => (built ??= buildGame({ species: "generic", seed: 3, antCount: 30, rival: true, generation: 0 }));

test("pinning: last in, no twice, a fourth replaces the oldest and says which", () => {
  let r = pin([], ant(0, 1));
  assert.deepEqual(r, { list: [{ ...ant(0, 1), no: 1 }], dropped: null });
  r = pin(r.list, ant(1, 2));
  r = pin(r.list, ant(0, 1));
  assert.deepEqual(
    r.list.map((s) => s.i),
    [1, 2],
    "already pinned: unchanged",
  );
  r = pin(r.list, ant(0, 3));
  assert.equal(r.list.length, MAX_SPECIMENS);
  r = pin(r.list, ant(1, 4));
  assert.deepEqual(
    r.list.map((s) => s.i),
    [2, 3, 4],
  );
  assert.deepEqual(r.dropped, { ...ant(0, 1), no: 1 });
  assert.ok(!sameAnt(ant(0, 1, 0), ant(0, 1, 1)), "a slot's next ant is another ant");
});

test("each keeps its number: the lowest free one when pinned; a death or a replacement renumbers nothing (review of #218, D1)", () => {
  let r = pin([], ant(0, 1));
  r = pin(r.list, ant(0, 2));
  r = pin(r.list, ant(0, 3));
  assert.deepEqual(nos(r.list), [1, 2, 3]);
  r = pin(r.list, ant(0, 4));
  assert.deepEqual(nos(r.list), [2, 3, 1], "the fourth takes the oldest's number; the others keep theirs");
  const left = unpin(r.list, ant(0, 3));
  assert.deepEqual(nos(left), [2, 1], "an unpin renumbers nothing");
  assert.equal(freeNumber(left), 3);
  assert.deepEqual(nos(pin(left, ant(0, 5)).list), [2, 1, 3], "the freed number is the next one given");
  assert.equal(freeNumber([]), 1);
});

test("a specimen that dies, or whose slot a newborn took, is gone; the rest are kept", () => {
  const g = aGame();
  const c = g.colonies[0]!;
  const [a, b] = [c.alive.indexOf(1), c.alive.indexOf(1, c.alive.indexOf(1) + 1)];
  const list = [
    { ...ant(0, a, c.gen[a]), no: 1 },
    { ...ant(0, b, c.gen[b]), no: 2 },
    { ...ant(1, g.colonies[1]!.alive.indexOf(1), 999), no: 3 },
  ];
  c.alive[b] = 0;
  const { kept, gone } = living(list, g.colonies);
  assert.deepEqual(kept, [list[0]]);
  assert.deepEqual(gone, [list[1], list[2]], "dead, and a generation that isn't the slot's");
});

test("a specimen's row: its label, who it is and what is worth comparing", () => {
  const g = aGame();
  const c = g.colonies[1]!;
  const i = c.alive.indexOf(1);
  const s = { ...ant(1, i, c.gen[i]), no: 2 };
  c.mode[i] = MODES.indexOf("return");
  c.carrying[i] = 1;
  c.load[i] = INFECTED;
  c.fatigue[i] = 12;
  const r = specimenRow(g.colonies, s)!;
  assert.equal(r.label, "No. 2", "its own number");
  assert.equal(r.who, `#${i} · Amber`);
  assert.equal(r.mode, "return");
  assert.deepEqual([r.carrying, r.host, r.below], [true, true, c.layer[i] === CURTAIN]);
  assert.equal(r.load, Math.fround(INFECTED), "the load as stored (a float32)");
  assert.deepEqual([r.fatigue, r.patience], [12, c.params.patience]);
  // The other side of each (review of #218, S1): not carrying, and above.
  c.carrying[i] = 0;
  c.layer[i] = PLANE;
  const r0 = specimenRow(g.colonies, s)!;
  assert.deepEqual([r0.carrying, r0.below], [false, false], "not carrying, and above");
  c.layer[i] = CURTAIN;
  assert.equal(specimenRow(g.colonies, s)!.below, true);
  c.load[i] = INFECTED / 2;
  assert.equal(specimenRow(g.colonies, s)!.host, false, "a trace is not a host");
  c.load[i] = 3;
  assert.equal(specimenRow(g.colonies, s)!.load, 1, "the load as a share, at most 1");
  assert.equal(specimenRow(g.colonies, { ...s, gen: s.gen + 1 }), null, "gone: no row");
  assert.equal(specimenLabel(3), "No. 3");
});
