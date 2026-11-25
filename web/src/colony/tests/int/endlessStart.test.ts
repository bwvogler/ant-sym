import assert from "node:assert/strict";
import { test } from "node:test";
import { ENDLESS_PLANE, EndlessPlane } from "../../endlessPlane.ts";
import { generateEndlessWorld } from "../../endlessWorld.ts";
import { Game, gameRng } from "../../game.ts";
import { DEFAULT_SLEEP } from "../../sleep.ts";
import { DT } from "../builders.ts";

// The wild sites keep clear of the start nests (PRD §66, `ja-y0a8`): a game starts with the two start colonies awake.

const SPECS = [{ antCount: 30 }, { antCount: 30 }];
const game = (seed: number) => new Game(generateEndlessWorld(seed), {}, gameRng(seed), SPECS);

test("no wild site within W of either start nest, on seeds 1-20, and the lattice stays pure in (seed, cell) (ja-y0a8)", () => {
  const W = DEFAULT_SLEEP.distance;
  assert.ok(ENDLESS_PLANE.startClear >= W + 32, "the clearance is the sleep distance and a margin");
  for (let seed = 1; seed <= 20; seed++) {
    const p = new EndlessPlane(seed);
    const starts = p.startNests();
    let listed = 0;
    for (const n of starts)
      for (const s of p.sitesIn(n.x - 3 * W, n.y - 3 * W, n.x + 3 * W, n.y + 3 * W)) {
        listed++;
        for (const m of starts)
          assert.ok(Math.hypot(s.x - m.x, s.y - m.y) > W, `seed ${seed}: site (${s.x | 0}, ${s.y | 0}) is within W of a start nest`);
      }
    assert.ok(listed > 0, `seed ${seed}: sites still stand just beyond W`);
    // a fresh plane, asked one region at a time in the other order, lists the same sites: pure in (seed, cell)
    const q = new EndlessPlane(seed);
    const span = ENDLESS_PLANE.regionChunks * 64;
    const n0 = starts[0]!;
    const box: [number, number, number, number] = [n0.x - 2 * W, n0.y - 2 * W, n0.x + 2 * W, n0.y + 2 * W];
    const key = (a: { rx: number; ry: number }[]) => a.map((s) => `${s.rx},${s.ry}`).sort();
    const each: { rx: number; ry: number }[] = [];
    for (let ry = Math.floor(box[3] / 0.8660254037844386 / span); ry >= Math.floor(box[1] / 0.8660254037844386 / span) - 1; ry--)
      for (let rx = Math.floor(box[2] / span) + 1; rx >= Math.floor(box[0] / span) - 1; rx--) {
        const st = q.site(rx, ry);
        if (st && st.x >= box[0] && st.x <= box[2] && st.y >= box[1] && st.y <= box[3]) each.push(st);
      }
    assert.deepEqual(key(each), key(p.sitesIn(...box)), `seed ${seed}`);
  }
});

test("a game starts with exactly 2 colonies awake when the fungus lands by a start hole: no site wakes at second 0 (seeds 1-20)", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = game(seed);
    g.enableSleep();
    g.land(seed % 2, 0); // by hole 0 on odd seeds, by hole 1 on even ones
    for (let i = 0; i < 30 * 3; i++) g.tick(DT);
    assert.equal(g.colonies.length, 2, `seed ${seed}: no wakeSite`);
    assert.deepEqual([g.isFrozen(0), g.isFrozen(1)], [false, false], `seed ${seed}: both start colonies awake`);
  }
});
