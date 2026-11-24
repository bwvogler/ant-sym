import assert from "node:assert/strict";
import { test } from "node:test";
import { Game, type GameSave } from "../../game.ts";
import { generateOneWorld, mainGround, oneWorldOnLines } from "../../oneWorld.ts";
import { generateWorld, mulberry32 } from "../../world.ts";

// Saves hold the lines (docs/endless-world.md §8, PRD §66 E3.4): a game over several lines, one of them begun mid-game, saves, loads into a game
// built afresh, and plays on exactly as the original does.

const SEED = 2;
const specs = [
  { antCount: 40, line: 0 },
  { antCount: 40, line: 1 },
];
const build = () => new Game(oneWorldOnLines(SEED, generateWorld(SEED), [[0], [1]]), { autoFound: false }, mulberry32(5), specs);
const roundtrip = (s: GameSave): GameSave => JSON.parse(JSON.stringify(s)) as GameSave;

/** A game of two start lines, a colony grown onto line 1, and one that began a third line: three lines, four colonies. */
function played(): Game {
  const g = build();
  const ground = mainGround(g.world);
  const h = g.world.lines[1]!.line.holes[0]!;
  g.addColony({
    x: h.x + 60.5,
    y: (h.y + 0.5) * 0.866,
    antCount: 20,
    odour: 0.5,
    spot: { cell: { x: h.x + 60, y: h.y }, end: "end", line: 1 },
  });
  g.newLines = true;
  let began = false;
  for (let y = 20; y < 360 && !began; y += 20)
    for (let x = 20; x < 500 && !began; x += 20) {
      const s = g.settleAt({ x, y }, ground);
      if (s.ok && s.newLine) {
        g.addColony({ x, y, antCount: 20, odour: 0.7, spot: { cell: s.cell, end: s.end, line: s.line, newLine: s.newLine } });
        began = true;
      }
    }
  assert.ok(began, "a far landing began a line");
  for (let t = 0; t < 40 * 30; t++) g.tick(1 / 30);
  return g;
}

test("a game of several lines, one begun mid-game, saves, loads into a game built afresh, and plays on bit for bit as the original", () => {
  const a = played();
  assert.equal(a.world.lines.length, 3);
  const saved = roundtrip(a.save());
  assert.equal(saved.world.more?.length, 2, "the lines after the first are in the save");
  assert.equal(saved.founded?.length, 2);
  const b = build();
  b.load(saved);
  assert.equal(b.world.lines.length, 3, "the founding that began a line is made again");
  assert.equal(b.colonies.length, 4);
  assert.deepEqual(
    b.world.lines.map((l) => [l.salt, l.line.holes.length]),
    a.world.lines.map((l) => [l.salt, l.line.holes.length]),
  );
  assert.equal(JSON.stringify(roundtrip(b.save())), JSON.stringify(saved), "what was loaded saves again as it was");
  for (let t = 0; t < 25 * 30; t++) {
    a.tick(1 / 30);
    b.tick(1 / 30);
  }
  assert.equal(JSON.stringify(roundtrip(b.save())), JSON.stringify(roundtrip(a.save())), "and plays on the same");
});

test("a game of one line saves exactly as it did: no key for other lines", () => {
  const g = new Game(generateOneWorld(SEED), {}, mulberry32(1), [{ antCount: 20 }]);
  assert.equal("more" in g.save().world, false);
});

test("a save is another game's when its lines are not this game's: a line missing from it, or other holes", () => {
  const a = played();
  const short = roundtrip(a.save());
  short.world.more = short.world.more!.slice(0, 1);
  assert.throws(() => build().load(short), /2 lines, this game's world has 3/);
  const other = roundtrip(a.save());
  other.world.more![0]!.line.holes[0]!.x += 5;
  assert.throws(() => build().load(other), /another world's line 1/);
});
