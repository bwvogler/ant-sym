import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid } from "../../battle.ts";
import { Colony } from "../../colony.ts";
import { onMiddenRing } from "../../dig.ts";
import { CELL, cellOf } from "../../hex.ts";
import { atHome } from "../../homing.ts";
import { MIDDEN_MIN } from "../../tuning.ts";
import { responses, type Touch } from "../../responses.ts";
import { RETURN } from "../../vocab.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";

// Guards for moved code that the golden masters do not reach (reviews of #133 and #136; ja-fnd.4.8): each test fails if the
// wiring it names is cut, where every other tier stays green.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

/** One carrier at its queen with food, ticked until the drop response is asked; what that response was shown. */
function dropAsked(withEnemy: boolean): Touch[] {
  const c = new Colony(generateSideWorld(2, SMALL), { antCount: 1, maxAnts: 1 }, mulberry32(1));
  const seen: Touch[] = [];
  c.responses = responses({ drop: (t) => (seen.push({ ...t }), true) });
  c.x[0] = c.queen!.x;
  c.y[0] = c.queen!.y;
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  if (withEnemy) {
    cellOf(c.x[0]!, c.y[0]!);
    const cx = CELL[0]!;
    const cy = CELL[1]!;
    const g = new CountGrid();
    g.add(cx + 1, cy, 3); // a stranger beside it, in the chamber
    c.enemies = g;
  }
  for (let k = 0; k < 30 && seen.length === 0; k++) c.tick(1 / 30);
  return seen;
}

test("a porter putting food down with a stranger beside it is asked with the enemy flag set (tick passes it to port)", () => {
  const calm = dropAsked(false);
  assert.ok(calm.length > 0, "the drop response is asked at the queen");
  assert.equal(calm[0]!.enemy, false, "no stranger: no enemy");
  const near = dropAsked(true);
  assert.ok(near.length > 0, "asked with a stranger near too");
  assert.equal(near[0]!.enemy, true, "a stranger beside it: the drop situation says so");
});

test("atHome: in its royal chamber, yes; in a chamber of another mark, or out of its nest, no", () => {
  const c = new Colony(generateSideWorld(2, SMALL), { antCount: 1, maxAnts: 1 }, mulberry32(1));
  c.x[0] = c.queen!.x;
  c.y[0] = c.queen!.y;
  c.under[0] = 1;
  assert.equal(atHome(c, 0), true, "at the queen");
  const royal = c.map.chambers!.list.find((k) => k.role === "royal")!;
  royal.role = "store"; // the same cells, read as a store: not where it homes to
  assert.equal(atHome(c, 0), false, "a store is not home");
  royal.role = "royal";
  c.x[0] = c.nest.x;
  c.y[0] = c.nest.y - 20; // up in the sky over the hole
  assert.equal(atHome(c, 0), false, "out of its nest");
});

test("onMiddenRing: out from home by MIDDEN_MIN or more, yes; short of it, no", () => {
  const c = new Colony(generateSideWorld(2, SMALL), { antCount: 1, maxAnts: 1 }, mulberry32(1));
  c.odoSurf[0] = 0; // its vector says home is the nest itself
  const at = (d: number) => {
    c.x[0] = c.nest.x + d;
    c.y[0] = c.nest.y;
    return onMiddenRing(c, 0, 0, 0);
  };
  assert.equal(at(MIDDEN_MIN - 0.5), false, "just short of the ring");
  assert.equal(at(MIDDEN_MIN + 0.5), true, "just past it");
});
