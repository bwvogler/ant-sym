import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng } from "../game.ts";
import { generateWorld } from "../world.ts";

// Golden master: the exact state of two games after 30 s. A refactor that
// should not change behaviour (MR 0's tunable params, MR 1's response hooks)
// must keep these. A change that is meant to alter behaviour updates them
// here, says so in its PR, and re-runs the assays (scripts/experiment.mjs).

function fnv(bytes: Uint8Array, h = 0x811c9dc5): number {
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const GOLDEN: Record<number, { hash: string; sides: string }> = {
  1: { hash: "160f5cf5", sides: "217/54/7 174/43/7" },
  2: { hash: "f79b2462", sides: "77/19/13 104/26/21" },
};

for (const [seed, want] of Object.entries(GOLDEN)) {
  test(`golden: seed ${seed}, 300 + 300 ants, 30 s — positions, modes, carrying and counts unchanged`, () => {
    const s = Number(seed);
    const g = new Game(generateWorld(s), { antCount: 300, rivalAnts: 300 }, gameRng(s));
    for (let k = 0; k < 900; k++) g.tick(1 / 30);
    let h = 0x811c9dc5;
    for (const c of g.colonies) for (const a of [c.x, c.y, c.heading, c.mode, c.carrying, c.alive]) h = fnv(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), h);
    assert.equal(g.colonies.map((c) => [c.stored, c.births, c.losses].join("/")).join(" "), want.sides);
    assert.equal(h.toString(16), want.hash);
  });
}
