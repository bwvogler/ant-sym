import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng, NO_ROOM } from "../game.ts";
import { centreX, centreY } from "../hex.ts";
import { generateOneWorld, mainGround } from "../oneWorld.ts";
import { generateSideWorld, mulberry32 } from "../world.ts";

// Game.settleAt (U5.2, docs/one-world.md §5): where a founding at a plane point would put its hole, read without founding
// it. The queen's pen previews it under the pointer and addColony founds where it says, so the preview and the founding
// can't disagree: here, on random points round the line's ends, every founding lands on the cell settleAt named, and every
// refusal is a founding refused for the same reason.

const game = (seed: number): Game => new Game(generateOneWorld(seed), { antCount: 4, rivalAnts: 4, regrow: 0 }, gameRng(seed));

for (const seed of [1, 2]) {
  test(`settleAt and addColony agree on random points round the line's ends (seed ${seed})`, () => {
    const g = game(seed);
    const world = g.world!;
    const rnd = mulberry32(900 + seed);
    let founded = 0;
    let refused = 0;
    for (let n = 0; n < 36; n++) {
      // A point up to 300 from an end hole (past FLIGHT_2D + FOUND_RADIUS reaches nothing anyway), any way round.
      const holes = world.line.holes;
      const v = rnd() < 0.5 ? holes[0]! : holes[holes.length - 1]!;
      const a = rnd() * 2 * Math.PI;
      const d = rnd() * 300;
      const p = { x: centreX(v.x, v.y) + d * Math.cos(a), y: centreY(v.y) + d * Math.sin(a) };
      const line = world.line;
      const s = g.settleAt(p);
      assert.equal(world.line, line, "settleAt changed the line");
      assert.deepEqual(g.settleAt(p, mainGround(world)), s, "settleAt with the ground passed in reads otherwise");
      const before = g.colonies.length;
      if (s.ok) {
        const k = g.addColony({ x: p.x, y: p.y, antCount: 0, odour: g.player.nestOdour });
        const spot = g.founded[g.founded.length - 1]!.spot!;
        assert.equal(k, before);
        assert.deepEqual({ cell: spot.cell, end: spot.end }, { cell: s.cell, end: s.end }, `point ${n} (${p.x.toFixed(1)}, ${p.y.toFixed(1)}): settleAt said ${JSON.stringify(s)}, addColony founded at ${JSON.stringify(spot)}`);
        founded++;
      } else {
        assert.equal(s.reason, NO_ROOM);
        assert.throws(() => g.addColony({ x: p.x, y: p.y, antCount: 0, odour: g.player.nestOdour }), new RegExp(NO_ROOM), `point ${n}: settleAt refused, addColony founded`);
        assert.equal(g.colonies.length, before);
        refused++;
      }
    }
    // Both branches were walked.
    assert.ok(founded >= 3, `only ${founded} foundings`);
    assert.ok(refused >= 3, `only ${refused} refusals`);
  });
}

test("settleAt on a game of one map is refused, and founds nothing", () => {
  const g = new Game(generateSideWorld(1), { antCount: 4, rivalAnts: 4 }, gameRng(1));
  const s = g.settleAt({ x: 100, y: 30 });
  assert.equal(s.ok, false);
  assert.equal(g.colonies.length, 2);
});
