import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL, cellOf, centreX, centreY, cellKey, INFECTED, PLANE, type Colony, type Game } from "../../colony/index.ts";
import { BODY_EVERY, BODY_SIGHT, bodySight, hostSight } from "../fog/observers.ts";
import { REACH_MARGIN, SensedMap } from "../fungusSight.ts";
import { buildGame, GAME_STRAIN } from "../useColony.ts";

// Who sees, for the fog of war (docs/fog-of-war.md §4.1, ja-1ypq.1): the player's strain's hosts and the fungus's living body.

function colony(ants: { x: number; y: number; load: number; strain: number }[]): Colony {
  return {
    n: ants.length,
    params: { sensorDistance: 3 },
    alive: Uint8Array.from(ants.map(() => 1)),
    load: Float32Array.from(ants.map((a) => a.load)),
    strain: Uint8Array.from(ants.map((a) => a.strain)),
    layer: Uint8Array.from(ants.map(() => PLANE)),
    x: Float32Array.from(ants.map((a) => a.x)),
    y: Float32Array.from(ants.map((a) => a.y)),
  } as unknown as Colony;
}
const sight = (s: SensedMap, x: number, y: number) => {
  cellOf(x, y);
  return s.sight(PLANE, CELL[0], CELL[1]);
};

test("every host sees, whatever its strain; a clean ant does not", () => {
  const c = colony([
    { x: 30, y: 30, load: INFECTED, strain: 1 },
    { x: 80, y: 30, load: INFECTED, strain: 2 },
    { x: 120, y: 30, load: INFECTED * 0.5, strain: 1 },
  ]);
  const seen: number[] = [];
  hostSight([c], REACH_MARGIN, (_l, x) => seen.push(x));
  assert.deepEqual(seen, [30, 80], "both strains; the clean one not");
  const s = new SensedMap();
  s.stamp([c], 5);
  assert.equal(sight(s, 30, 30), 1);
  assert.equal(sight(s, 80, 30), 1);
  assert.equal(sight(s, 120, 30), 0);
});

test("the body sees BODY_SIGHT round each hypha cell and patch cell, and nothing else", () => {
  const hyphae = new Map([[cellKey(40, 40), -1]]);
  const fungus = {
    patchOn: (l: number) => (l === PLANE ? [60, 40] : []),
    hyphaeOn: (l: number) => (l === PLANE ? { parent: hyphae } : null),
  };
  const got: { l: number; x: number; y: number; r: number }[] = [];
  bodySight(fungus as never, 2, (l, x, y, r) => got.push({ l, x, y, r }));
  assert.equal(got.length, 2, "one hypha cell and one patch cell; spores and corpses are not asked");
  assert.ok(got.every((g) => g.r === BODY_SIGHT && g.l === PLANE));
  assert.ok(got.some((g) => g.x === centreX(40, 40) && g.y === centreY(40)));
  assert.ok(got.some((g) => g.x === centreX(60, 40) && g.y === centreY(40)));
});

test("a game's sight: the body is stamped every BODY_EVERY, hosts every step, and time going back forgets", () => {
  const hyphae = new Map([[cellKey(40, 40), -1]]);
  const game = {
    time: 10,
    colonies: [] as Colony[],
    layers: [{}, {}],
    fungus: { evolution: null, patchOn: () => [], hyphaeOn: (l: number) => (l === PLANE ? { parent: hyphae } : null) },
  } as unknown as Game;
  const s = new SensedMap();
  s.stampGame(game);
  assert.ok(sight(s, centreX(40, 40), centreY(40)) > 0, "the body lights its own cell");
  // A new hypha cell appears; the next step is inside BODY_EVERY, so it is not stamped yet.
  hyphae.set(cellKey(90, 90), -1);
  game.time = 10 + BODY_EVERY / 2;
  s.stampGame(game);
  assert.equal(sight(s, centreX(90, 90), centreY(90)), 0, "not yet");
  game.time = 10 + BODY_EVERY;
  s.stampGame(game);
  assert.ok(sight(s, centreX(90, 90), centreY(90)) > 0, "after BODY_EVERY");
  game.time = 1;
  s.stampGame(game);
  assert.equal(s.revealedCount(PLANE), 2, "time went back: forgot, then stamped the body again (two chunks, one cell each)");
});

test("in a landed game the patch is seen before the first step, and sight is a function of the sim's steps alone", () => {
  const build = () => {
    const g = buildGame({ species: "generic", seed: 1, antCount: 60, rival: true, generation: 0 });
    g.land(0, GAME_STRAIN, { evolve: true });
    return g;
  };
  const first = new SensedMap();
  first.stampGame(build());
  assert.ok(first.revealedCount(PLANE) > 0, "the landing patch is seen at once");
  // The page stamps after every step, so two runs of the same steps see the same cells, whatever frames the steps fell in.
  const run = () => {
    const g = build();
    const m = new SensedMap();
    for (let k = 0; k < 90; k++) {
      g.tick(1 / 30);
      m.stampGame(g);
    }
    return m;
  };
  const [a, b] = [run(), run()];
  let lit = 0;
  for (let gy = 0; gy < 368; gy += 2)
    for (let gx = 0; gx < 512; gx += 2) {
      assert.equal(a.sight(PLANE, gx, gy), b.sight(PLANE, gx, gy), `(${gx}, ${gy})`);
      if (a.sight(PLANE, gx, gy) > 0) lit++;
    }
  assert.ok(lit > 0, "something is lit");
});
