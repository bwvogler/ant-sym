import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, INFECTED, MODES } from "../../colony/index.ts";
import { living, MAX_SPECIMENS, pin, sameAnt, specimenLabel, specimenRow, unpin } from "../specimens.ts";
import { buildGame } from "../useColony.ts";

// Specimens (PRD §69.5): up to three pinned ants, compared in the inspector.

const ant = (k: number, i: number, gen = 0) => ({ k, i, gen });
// One game for the tests that read a real one (each touches its own colony).
let built: ReturnType<typeof buildGame> | null = null;
const aGame = () => (built ??= buildGame({ species: "generic", seed: 3, antCount: 30, rival: true, generation: 0 }));

test("pinning: last in, no twice, a fourth replaces the oldest and says which", () => {
  let r = pin([], ant(0, 1));
  assert.deepEqual(r, { list: [ant(0, 1)], dropped: null });
  r = pin(r.list, ant(1, 2));
  r = pin(r.list, ant(0, 1));
  assert.deepEqual(r.list, [ant(0, 1), ant(1, 2)], "already pinned: unchanged");
  r = pin(r.list, ant(0, 3));
  assert.equal(r.list.length, MAX_SPECIMENS);
  r = pin(r.list, ant(1, 4));
  assert.deepEqual(r, { list: [ant(1, 2), ant(0, 3), ant(1, 4)], dropped: ant(0, 1) });
  assert.deepEqual(unpin(r.list, ant(0, 3)), [ant(1, 2), ant(1, 4)]);
  assert.ok(!sameAnt(ant(0, 1, 0), ant(0, 1, 1)), "a slot's next ant is another ant");
});

test("a specimen that dies, or whose slot a newborn took, is gone; the rest are kept", () => {
  const g = aGame();
  const c = g.colonies[0]!;
  const [a, b] = [c.alive.indexOf(1), c.alive.indexOf(1, c.alive.indexOf(1) + 1)];
  const list = [ant(0, a, c.gen[a]), ant(0, b, c.gen[b]), ant(1, g.colonies[1]!.alive.indexOf(1), 999)];
  c.alive[b] = 0;
  const { kept, gone } = living(list, g.colonies);
  assert.deepEqual(kept, [list[0]]);
  assert.deepEqual(gone, [list[1], list[2]], "dead, and a generation that isn't the slot's");
});

test("a specimen's row: its label, who it is and what is worth comparing", () => {
  const g = aGame();
  const c = g.colonies[1]!;
  const i = c.alive.indexOf(1);
  c.mode[i] = MODES.indexOf("return");
  c.carrying[i] = 1;
  c.load[i] = INFECTED;
  c.fatigue[i] = 12;
  const r = specimenRow(g.colonies, ant(1, i, c.gen[i]), 1)!;
  assert.equal(r.label, "No. 2");
  assert.equal(r.who, `#${i} · Amber`);
  assert.equal(r.mode, "return");
  assert.deepEqual([r.carrying, r.host, r.below], [true, true, c.layer[i] === CURTAIN]);
  assert.equal(r.load, Math.fround(INFECTED), "the load as stored (a float32)");
  assert.deepEqual([r.fatigue, r.patience], [12, c.params.patience]);
  c.load[i] = INFECTED / 2;
  assert.equal(specimenRow(g.colonies, ant(1, i, c.gen[i]), 1)!.host, false, "a trace is not a host");
  c.load[i] = 3;
  assert.equal(specimenRow(g.colonies, ant(1, i, c.gen[i]), 1)!.load, 1, "the load as a share, at most 1");
  assert.equal(specimenRow(g.colonies, ant(1, i, c.gen[i] + 1), 0), null, "gone: no row");
  assert.equal(specimenLabel(0), "No. 1");
});
