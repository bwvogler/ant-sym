import { test } from "node:test";
import assert from "node:assert/strict";
import { begin, next, observe, seenOf, TUTORIAL_SPEED } from "../../tutorial.ts";
import { buildGame, GAME_STRAIN, landingOf } from "../../useColony.ts";

// The first game's tutorial plays the page's world (PRD §66 E6, `ja-qpv.5.1`; owner `ja-jqws`: the bounded game stays behind `?world=bounded`, the tutorial and the
// Lab play the page's world, which is the endless one). Its machine reads only the landing colony's ants, so the endless plane needs no scripted step of its own;
// scripts/tutorial-first-host.mjs --world endless measured the first host on seeds 1-20 (found 2-15 s in, cleared 31-137 s after it, the page's 600 ants).

for (const seed of [1, 2]) {
  test(`the tutorial's cards run on the endless world: seed ${seed}'s landing waits, then the first host is found and followed`, () => {
    const g = buildGame({ species: "generic", seed, antCount: 600, rival: true, generation: 0, world: "endless" });
    assert.equal(g.map.endless, true, "an endless game");
    g.land(landingOf(g), GAME_STRAIN, { evolve: true });
    let t = begin();
    assert.equal(t.step, "landing");
    const r = next(t, g.time);
    t = r.t;
    assert.equal(t.step, "waiting");
    assert.deepEqual(r.effect, { playing: true, speed: TUTORIAL_SPEED });
    // the game plays at 1x (30 steps a second) until a host is found: the measured worst seed is 14.8 s; 60 s is a wide margin
    let found = false;
    for (let k = 0; k < 60 * 30 && !found; k++) {
      g.tick(1 / 30);
      const o = observe(t, seenOf(g, t));
      t = o.t;
      if (t.step === "host") {
        found = true;
        assert.equal(o.effect?.playing, false, "the first host pauses the game");
        assert.deepEqual(o.effect?.follow, t.host, "and is followed");
        assert.equal(t.host?.k, landingOf(g), "it is an ant of the colony the fungus landed by");
      }
    }
    assert.ok(found, `a first host within 60 s of the landing (t = ${g.time.toFixed(1)})`);
  });
}
