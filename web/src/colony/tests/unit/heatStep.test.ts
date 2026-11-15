import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE, type Colony } from "../../colony.ts";
import { DESERT_ANT } from "../../desertAnt.ts";
import { Game, gameRng } from "../../game.ts";
import { dayPhase, groundHeat, heatStep } from "../../heat.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import type { ColonyParams } from "../../params.ts";

// heatStep on its own (ja-pgdg, review of #190 N3): each ant's body heat and what it does to the ant, one step at a time. The soak
// tests play whole days (desertHeat.test.ts, about 50 s) and only checked `diedHot > 0` and the sun's reading; these fix the step's two
// effects (feeling hot, dying of it) without playing a game. dt = 0 leaves the body's heat where the test put it, so the flag and the
// death are read alone.

const game = (): Game => new Game(generateOneWorld(1), { antCount: 8, rival: false, species: DESERT_ANT }, gameRng(1));

/** Colony 0 with ant 0 on the plane (`on` PLANE) or inside (CURTAIN), at body heat `above` degrees over the nest's; the others dead, so only ant 0 steps. */
function setup(on: number, above: number): { c: Colony; p: ColonyParams } {
  const c = game().colonies[0]!;
  c.alive.fill(0, 1);
  c.alive[0] = 1;
  c.layer[0] = on;
  c.bodyHeat[0] = above;
  c.hot[0] = 0;
  return { c, p: c.params };
}

/** The body heat (above the nest's) of a body at `temp` °C. */
const above = (p: ColonyParams, temp: number) => temp - p.heatNest;

test("an ant feels hot from heatFelt, stays hot until its body is back under heatCool, and is cool again under it", () => {
  const { c, p } = setup(PLANE, 0);
  assert.ok(p.heatCool < p.heatFelt && p.heatFelt < p.heatDeath, "the desert ant's thresholds are ordered");
  const step = (temp: number) => {
    c.bodyHeat[0] = above(p, temp);
    heatStep(c, 0);
    return c.hot[0];
  };
  assert.equal(step(p.heatFelt - 0.1), 0, "just under heatFelt: not hot");
  assert.equal(step(p.heatFelt + 0.1), 1, "past heatFelt: hot");
  assert.equal(step((p.heatFelt + p.heatCool) / 2), 1, "between heatCool and heatFelt it stays hot");
  assert.equal(step(p.heatCool - 0.1), 0, "back under heatCool: cool again");
  assert.equal(step((p.heatFelt + p.heatCool) / 2), 0, "and between the two it is not hot until heatFelt again");
  assert.equal(c.alive[0], 1, "none of that is lethal");
});

test("past heatDeath an ant dies of heat, once: it is counted, and a dead ant is not stepped again", () => {
  const { c, p } = setup(PLANE, 0);
  c.bodyHeat[0] = above(p, p.heatDeath - 0.1);
  heatStep(c, 0);
  assert.equal(c.alive[0], 1, "just under heatDeath: alive");
  assert.equal(c.diedHot, 0);
  c.bodyHeat[0] = above(p, p.heatDeath + 0.1);
  heatStep(c, 0);
  assert.equal(c.alive[0], 0, "past heatDeath: dead");
  assert.equal(c.diedHot, 1, "counted");
  heatStep(c, 0);
  heatStep(c, 1);
  assert.equal(c.diedHot, 1, "the dead are skipped, so it is counted once");
});

/** Colony game time at which the sun stands highest (heat.ts: half the daylight into the day). */
function noon(p: ColonyParams): number {
  const t = ((1 - p.heatNight) / 2) * p.heatDay - p.heatStart;
  return t < 0 ? t + p.heatDay : t;
}

test("a body heats toward the plane's ground out in the open and cools toward the nest's inside it", () => {
  const out = setup(PLANE, 0);
  out.c.time = noon(out.p);
  assert.ok(Math.abs(dayPhase(out.p, out.c.time) - (1 - out.p.heatNight) / 2) < 1e-9, "the clock is at noon");
  const ground = groundHeat(out.p, out.c.time) - out.p.heatNest;
  assert.ok(ground > 0, "a ground hotter than the nest at noon");
  heatStep(out.c, 5);
  assert.ok(out.c.bodyHeat[0]! > 0 && out.c.bodyHeat[0]! < ground, `heated toward the ground: ${out.c.bodyHeat[0]} of ${ground}`);

  const inside = setup(CURTAIN, 6);
  inside.c.time = noon(inside.p);
  heatStep(inside.c, 5);
  assert.ok(inside.c.bodyHeat[0]! < 6 && inside.c.bodyHeat[0]! > 0, `cooled toward the nest's: ${inside.c.bodyHeat[0]}`);
});
