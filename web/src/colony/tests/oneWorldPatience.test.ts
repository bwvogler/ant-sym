import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, CURTAIN, DEFAULT_COLONY, LIFESPAN, MODES, PLANE, type HoleCell } from "../colony.ts";
import { Game, gameRng } from "../game.ts";
import { centreX, centreY } from "../hex.ts";
import { generateOneWorld } from "../oneWorld.ts";
import { generateSideWorld, generateWorld, mulberry32 } from "../world.ts";

// A shorter search on one world's plane (ja-lp4.15.2, docs/forager-trips.md §1, PRD §57): a forager on the plane tires at
// patience × planePatience, on its own clock; in the nest, in the side view and on top-down maps, at patience.

const DT = 1 / 30;
const EXPLORE = MODES.indexOf("explore");

/** Seed 7's small plane (160 × 100), no food, every ant young (stays in) but ant 0, an old forager 20 cells east of its hole, exploring. */
function plane(params: Partial<Colony["params"]>): { g: Game; c: Colony } {
  const g = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 }, rockiness: 0 } }), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(7));
  const map = g.world!.plane;
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) map.food.set(x, y, 0);
  map.foodLeft = 0;
  for (const k of g.colonies) for (let i = 0; i < k.n; i++) if (k.alive[i]) k.age[i] = 0.05 * LIFESPAN;
  const c = g.player;
  Object.assign(c.params, { scoutRate: 0, raidScout: 0, ...params });
  c.policy = () => "explore";
  const hc = c.holeCells[c.params.nest] as HoleCell;
  c.age[0] = 0.5 * LIFESPAN;
  c.putAnt(0, PLANE, centreX(hc.px, hc.py) + 20, centreY(hc.py));
  c.mode[0] = EXPLORE;
  c.carrying[0] = 0;
  c.heading[0] = 0;
  return { g, c };
}

/** Whether ant 0 is asked as tired after one tick at this fatigue. */
function tiredAt(c: Colony, step: (dt: number) => void, fatigue: number): boolean | undefined {
  c.fatigue[0] = fatigue;
  c.reconsider();
  step(DT);
  return c.lastQuestion(0)?.tired;
}

test("planePatience: a forager on the plane tires at patience × planePatience", () => {
  const cases: [number, number, boolean][] = [
    [0.5, 31, true],
    [0.5, 29, false],
    [1, 31, false],
    [1, 61, true],
    [0.75, 46, true],
    [0.75, 44, false],
  ];
  for (const [pp, f, want] of cases) {
    const { g, c } = plane({ planePatience: pp });
    assert.equal(tiredAt(c, (dt) => g.tick(dt), f), want, `planePatience ${pp}, fatigue ${f}`);
  }
});

test("planePatience: tired stays tired until fully rested, at the shorter line too", () => {
  for (const [pp, f, rested] of [[0.5, 31, 20], [1, 61, 50]] as const) {
    const { g, c } = plane({ planePatience: pp });
    assert.equal(tiredAt(c, (dt) => g.tick(dt), f), true);
    assert.equal(tiredAt(c, (dt) => g.tick(dt), rested), true, `planePatience ${pp}: at ${rested}, below the line, still tired until it has rested to nothing`);
  }
});

test("planePatience: the ant's clock still scales it (a slow clock, a longer search)", () => {
  // Exploring from nothing with food gone: the first time the policy is asked as tired, 45 s at clock 1.5 and 0.5 × 60 = 30 s at clock 1.
  const firstTired = (clock: number): number => {
    const { g, c } = plane({ planePatience: 0.5 });
    c.clock[0] = clock;
    for (let k = 0; k < 70 * 30; k++) {
      g.tick(DT);
      if (c.lastQuestion(0)?.tired) return g.time;
      assert.equal(c.layer[0], PLANE);
    }
    return Infinity;
  };
  const a = firstTired(1);
  const b = firstTired(1.5);
  assert.ok(a > 29 && a < 32, `clock 1: tired at ${a.toFixed(1)} s`);
  assert.ok(b > 44 && b < 47, `clock 1.5: tired at ${b.toFixed(1)} s`);
});

test("planePatience: not in the nest, not in the side view, not on a top-down map", () => {
  // The nest: ant 0 down in the curtain at 31 s of fatigue is not tired at planePatience 0.5.
  const { g, c } = plane({ planePatience: 0.5 });
  const hc = c.holeCells[c.params.nest] as HoleCell;
  c.putAnt(0, CURTAIN, centreX(hc.col, hc.row), centreY(hc.row) + 14);
  assert.equal(tiredAt(c, (dt) => g.tick(dt), 31), false, "in the curtain");
  assert.equal(tiredAt(c, (dt) => g.tick(dt), 61), true, "past patience, in the curtain");
  // A top-down map and the side view: no plane, so `line` is null.
  const flat = new Colony(generateWorld(3, { size: { w: 128, h: 96 }, nestCount: 1 }), { antCount: 1, maxAnts: 1, planePatience: 0.5, deposit: 0 }, mulberry32(5), () => "explore");
  assert.equal(tiredAt(flat, (dt) => flat.tick(dt), 31), false, "top-down at 31 s");
  assert.equal(tiredAt(flat, (dt) => flat.tick(dt), 61), true, "top-down at 61 s");
  const side = new Colony(generateSideWorld(2, { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 }), { antCount: 1, maxAnts: 1, planePatience: 0.5, deposit: 0 }, mulberry32(5), () => "explore");
  assert.equal(tiredAt(side, (dt) => side.tick(dt), 31), false, "side view at 31 s");
  assert.equal(tiredAt(side, (dt) => side.tick(dt), 61), true, "side view at 61 s");
});

test("planePatience defaults to 1: main's search, bit for bit", () => {
  assert.equal(DEFAULT_COLONY.planePatience, 1);
});
