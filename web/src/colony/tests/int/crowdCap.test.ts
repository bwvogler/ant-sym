import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid } from "../../battle.ts";
import { Colony, CURTAIN, LIFESPAN } from "../../colony.ts";
import { cellOf, centreX, centreY, nx, ny } from "../../hex.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// Ants in the nest are bodies (docs/nurse-crowding.md, ja-k4k.15.7.1): with `cellCap` on, a step into a cell already holding that
// many of the colony's ants is refused (a squeeze through is rare below twice the cap, and never above); off (0), nothing changes.

/** One ant standing at the edge of royal-chamber cell A heading into its east neighbour B, `inB` ants counted in B: how many of 300 single ticks put it in B. */
function entered(cellCap: number, inB: number, trials = 300): number {
  const w = smallOne(2);
  const royal = w.curtain.chambers!.list.find((k) => k.colony === 0 && k.role === "royal")!;
  const ax = Math.round((royal.x0 + royal.x1) / 2);
  const ay = royal.floorRow - 3;
  const bx = nx(ax, ay, 0);
  const by = ny(ay, 0);
  let n = 0;
  for (let t = 0; t < trials; t++) {
    const c = new Colony(w.curtain, { antCount: 1, maxAnts: 5, cellCap, broodOdour: 0 }, mulberry32(t + 1), () => "explore", {
      plane: w.plane,
      line: w.line,
    });
    c.age[0] = 0.5 * LIFESPAN;
    c.lifespan[0] = Infinity;
    // Just short of B's centre line: the next step lands in B.
    c.x[0] = (centreX(ax, ay) + centreX(bx, by)) / 2 - 0.02;
    c.y[0] = centreY(ay);
    c.heading[0] = 0;
    const grid = new CountGrid();
    grid.add(ax, ay, 1);
    if (inB > 0) grid.add(bx, by, inB);
    c.friends = grid;
    c.tick(1 / 30);
    cellOf(c.x[0]!, c.y[0]!);
    if (c.layer[0] === CURTAIN && Math.abs(c.x[0]! - centreX(bx, by)) < Math.abs(c.x[0]! - centreX(ax, ay))) n++;
  }
  return n;
}

test("cellCap: a step into a cell below the cap goes in; into a full one it is refused", () => {
  assert.ok(entered(3, 2) > 250, `2 of 3 there: ${entered(3, 2)} of 300 went in`);
  assert.ok(entered(3, 3) < 30, `3 of 3 there: ${entered(3, 3)} of 300 went in (only the rare squeeze)`);
});

test("cellCap: past twice the cap no ant squeezes in, between the cap and twice a few do", () => {
  assert.equal(entered(3, 6), 0, "6 of a cap of 3: none");
  assert.ok(entered(3, 4) > 0 || entered(3, 5) > 0, "between: the squeeze exists, so a waiting ant is never stuck for ever");
});

test("cellCap 0 (the default): the cell's count is not read", () => {
  assert.ok(entered(0, 40) > 250, `40 there, no cap: ${entered(0, 40)} of 300 went in`);
});
