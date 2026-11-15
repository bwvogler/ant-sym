import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony.ts";
import { mulberry32 } from "../../world.ts";
import { arena } from "../builders.ts";

// #214 made Touch.raid a getter worked out when a response read it; that parted G1 seed 3 from its parent at 57.8 s, which
// no golden caught (PR #231, ja-lp4.14). touchOn works it out at touch, a plain value, until ja-lp4.18 gives a whole-game guard.
test("Touch.raid is a plain value set at touch, not worked out lazily", () => {
  const c = new Colony(arena(), { antCount: 1, maxAnts: 1 }, mulberry32(1));
  const d = Object.getOwnPropertyDescriptor(c.t, "raid");
  assert.ok(d === undefined || !("get" in d) || d.get === undefined, "raid has no getter");
});
