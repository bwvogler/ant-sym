import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng, SAVE_VERSION, type GameSave, wildOdour } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { hashGame } from "../saveHash.ts";
import { run } from "../builders.ts";

// S1 (ja-zg1u.3): a save at one odour axis (the game as it is) and at four (forced by the setting) runs on as the unbroken game, and a save
// of one axis count is refused by a game of another.

const small = (axes: number, ants = 60): Game =>
  new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), { recognition: { odourAxes: axes } }, gameRng(7), [
    { antCount: ants },
    { antCount: ants },
  ]);

const copy = (s: GameSave): GameSave => JSON.parse(JSON.stringify(s)) as GameSave;

for (const axes of [1, 4]) {
  test(`a save at ${axes} odour axis(es) loads into a game built afresh and runs on as the unbroken one, bands and nest vectors included`, () => {
    const a = small(axes);
    run(a, 20);
    const saved = copy(a.save());
    assert.equal(saved.version, SAVE_VERSION);
    const b = small(axes);
    b.load(copy(saved));
    assert.equal(hashGame(b), hashGame(a), "the same at the save");
    assert.deepEqual(copy(b.save()), saved, "saving the loaded game gives the same save");
    run(a, 15);
    run(b, 15);
    assert.equal(hashGame(b), hashGame(a), "and after running on");
    for (const c of a.colonies) {
      assert.equal(c.odourAxes, axes);
      assert.equal(c.nestVec.length, axes);
      assert.equal(c.odour.length, c.n * axes);
    }
  });
}

test("at four axes the start colonies sit on the diagonal (a number is every axis), strangers to each other, and fight", () => {
  const g = small(4);
  assert.deepEqual([...g.colonies[1]!.nestVec], [1, 1, 1, 1]);
  assert.equal(g.recognition.params.odourAxes, 4);
  assert.equal(g.unity().gap, 2);
  run(g, 5);
  assert.ok(g.colonies.every((c) => c.population > 0));
});

test("a save of one axis count is refused by a game of another", () => {
  const four = small(4);
  run(four, 2);
  assert.throws(() => small(1).load(copy(four.save())), /odour axes|axes/);
});

test("a wild site's odour is a hash per axis, salt 101 + axis: axis 0 is the one scalar it was", () => {
  assert.equal(wildOdour(5, 3, 4, 1), (wildOdour(5, 3, 4, 4) as number[])[0]);
  const v = wildOdour(5, 3, 4, 4) as number[];
  assert.equal(v.length, 4);
  assert.equal(new Set(v).size, 4);
  assert.deepEqual(v, wildOdour(5, 3, 4, 4), "pure: the same site, the same vector");
});
