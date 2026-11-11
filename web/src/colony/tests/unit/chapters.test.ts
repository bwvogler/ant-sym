import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAPTERS, chapterOf, SPREAD_SHARE, type ChapterState } from "../../chapters.ts";
import { Game } from "../../game.ts";
import { STRAINS } from "../../fungus.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";

const base: ChapterState = { landed: false, colony: "Ink", hosts: 0, share: 0, queenInfected: false, gynes: 0, daughters: 0 };

test("chapters follow the game in order, each ending when what it asks for is true", () => {
  const steps: [Partial<ChapterState>, string][] = [
    [{}, "land"],
    [{ landed: true }, "host"],
    [{ landed: true, hosts: 3, share: 0.01 }, "spread"],
    [{ landed: true, hosts: 300, share: SPREAD_SHARE }, "queen"],
    [{ landed: true, hosts: 300, share: 0.4, queenInfected: true }, "newQueen"],
    [{ landed: true, hosts: 300, share: 0.4, queenInfected: true, gynes: 1 }, "daughter"],
    [{ landed: true, hosts: 300, share: 0.4, queenInfected: true, gynes: 1, daughters: 1 }, "open"],
  ];
  for (const [patch, want] of steps) assert.equal(chapterOf({ ...base, ...patch }).chapter, want, JSON.stringify(patch));
  assert.deepEqual(steps.map(([, c]) => c), [...CHAPTERS]);
  const spread = chapterOf({ ...base, landed: true, hosts: 10, share: SPREAD_SHARE / 2 });
  assert.equal(spread.progress, 0.5);
  assert.equal(spread.step, 3);
  assert.match(spread.goal, /Ink/);
});

test("landing: spores fall by the hole, no ant is dosed, and ants walking out become the first hosts", () => {
  const map = generateSideWorld(1);
  const g = new Game(map, { antCount: 300, rivalAnts: 300 }, mulberry32(7919));
  const garden = STRAINS.findIndex((s) => s.id === "garden");
  const at = g.land(0, garden);
  assert.ok(g.fungus.sporeCells > 0, "spores on the ground");
  assert.equal(g.fungus.census(g.colonies[0]!).infected, 0, "nobody dosed");
  assert.deepEqual(g.land(0, garden), at, "lands once");
  let t = 0;
  for (; t < 120 && g.fungus.census(g.colonies[0]!).infected === 0; t += 1 / 30) g.tick(1 / 30);
  assert.ok(g.fungus.census(g.colonies[0]!).infected > 0, `a first host within 2 minutes (at ${t.toFixed(0)} s)`);
  assert.equal(g.fungus.census(g.colonies[1]!).infected, 0, "the other colony is far away");
});
