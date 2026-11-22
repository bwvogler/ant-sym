import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid } from "../../battle.ts";
import { Colony, CURTAIN, PLANE } from "../../colony.ts";
import { CELL, cellOf } from "../../hex.ts";
import { atHome } from "../../homing.ts";
import { responses, type Touch } from "../../responses.ts";
import { RETURN } from "../../vocab.ts";
import { onMiddenRing } from "../../dig.ts";
import { MIDDEN_MIN } from "../../tuning.ts";
import { mulberry32 } from "../../world.ts";
import { oneColony, smallOne } from "../builders.ts";

// Guards for moved code that the golden masters do not reach (reviews of #133 and #136; ja-fnd.4.8): each test fails if the
// wiring it names is cut, where every other tier stays green. In one world's curtain, where the nest is, and onMiddenRing's on
// the plane, where the midden is (S2.3c).

/** A one-world colony of one ant, bound to its curtain, the ant underground at its queen. */
function atQueen(): Colony {
  const w = smallOne(2);
  const c = new Colony(w.curtain, { antCount: 1, maxAnts: 1 }, mulberry32(1), undefined, { plane: w.plane, line: w.line });
  c.under[0] = 1;
  c.x[0] = c.queen!.x;
  c.y[0] = c.queen!.y;
  return c;
}

/** One carrier at its queen with food, ticked until the drop response is asked; what that response was shown. */
function dropAsked(withEnemy: boolean): Touch[] {
  const c = atQueen();
  const seen: Touch[] = [];
  c.responses = responses({ drop: (t) => (seen.push({ ...t }), true) });
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  if (withEnemy) {
    cellOf(c.x[0]!, c.y[0]!);
    const cx = CELL[0]!;
    const cy = CELL[1]!;
    const g = new CountGrid();
    g.add(cx + 1, cy, 3); // a stranger beside it, in the chamber
    c.wire(CURTAIN, { enemies: g });
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
  const c = atQueen();
  assert.equal(atHome(c, 0), true, "at the queen");
  const royal = c.map.chambers!.list.find((k) => k.role === "royal")!;
  royal.role = "store"; // the same cells, read as a store: not where it homes to
  assert.equal(atHome(c, 0), false, "a store is not home");
  royal.role = "royal";
  c.bind(PLANE);
  c.layer[0] = PLANE;
  c.under[0] = 0;
  c.x[0] = c.nest.x;
  c.y[0] = c.nest.y; // up on the plane, at its hole
  assert.equal(atHome(c, 0), false, "out of its nest");
});

test("onMiddenRing: on the plane, out from home by MIDDEN_MIN or more, yes; short of it, no", () => {
  const { c } = oneColony(1, { maxAnts: 1 });
  c.bind(PLANE);
  c.layer[0] = PLANE;
  c.under[0] = 0;
  c.odoSurf[0] = 0; // its vector says home is its hole
  const at = (d: number) => {
    c.x[0] = c.nest.x + d;
    c.y[0] = c.nest.y;
    return onMiddenRing(c, 0, 0, 0);
  };
  assert.equal(at(MIDDEN_MIN - 0.5), false, "just short of the ring");
  assert.equal(at(MIDDEN_MIN + 0.5), true, "just past it");
});
