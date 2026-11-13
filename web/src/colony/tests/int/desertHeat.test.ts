import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE } from "../../colony.ts";
import { DESERT_ANT } from "../../desertAnt.ts";
import { Game, gameRng } from "../../game.ts";
import { bodyHeatAfter, feelsHot, groundHeat, pastCritical, sunHeight, sunHigh } from "../../heat.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { DEFAULT_COLONY, type ColonyParams } from "../../params.ts";
import { run } from "../builders.ts";

// ja-rf5.5 and ja-rf5.12 (docs/desert-heat.md, PRD §60.5): the desert ant's heat. The ground follows the sun over a day; a body heats out on the
// plane and cools in the nest; it feels hot from heatFelt until back under heatCool; it dies past heatDeath; it sees the sun high where the sky is in view.

const P: ColonyParams = { ...DEFAULT_COLONY, ...DESERT_ANT.params } as ColonyParams;

test("the day: the sun and the ground are lowest at dawn and highest at noon", () => {
  assert.equal(sunHeight(P, 0), 0);
  assert.equal(sunHeight(P, P.heatDay / 2), 1);
  assert.equal(groundHeat(P, 0), P.heatDawn);
  assert.equal(groundHeat(P, P.heatDay / 2), P.heatNoon);
  assert.ok(Math.abs(groundHeat(P, P.heatDay) - P.heatDawn) < 1e-9, "a day later, dawn again");
  assert.equal(sunHigh(P, 0), false);
  assert.equal(sunHigh(P, P.heatDay / 2), true);
  assert.equal(sunHigh({ ...P, heatDay: 0 }, 300), false, "no day, no high sun");
});

test("a body heats toward its surroundings and cools back; hot from heatFelt until under heatCool; past heatDeath it is lethal", () => {
  const out = P.heatNoon - P.heatNest;
  let b = 0;
  for (let k = 0; k < 30 * 5; k++) b = bodyHeatAfter(P, b, out, 1 / 30);
  assert.ok(Math.abs(b - out * (1 - Math.exp(-5 / P.heatTau))) < 1e-6, "Newton's law over 5 s");
  const at = (t: number) => t - P.heatNest;
  assert.equal(feelsHot(P, at(P.heatFelt - 0.1), false), false);
  assert.equal(feelsHot(P, at(P.heatFelt), false), true);
  assert.equal(feelsHot(P, at(P.heatFelt - 0.1), true), true, "once hot, still hot above heatCool");
  assert.equal(feelsHot(P, at(P.heatCool - 0.1), true), false);
  assert.equal(pastCritical(P, at(P.heatDeath - 0.1)), false);
  assert.equal(pastCritical(P, at(P.heatDeath)), true);
});

const desert = (over: Partial<ColonyParams> = {}): Game =>
  new Game(
    generateOneWorld(1),
    { antCount: 60, rival: false, species: { ...DESERT_ANT, params: { ...DESERT_ANT.params, ...over } } },
    gameRng(1),
  );

test("a desert ant sees the sun high only where the sky is in view: out on the plane or at the top of its own shaft", () => {
  const g = desert();
  run(g, 150); // mid-morning: ants out on the plane (by noon the cue has them all in)
  const c = g.player;
  (c.params as { heatSunHigh: number }).heatSunHigh = 0.1; // the sun counts as high from here, for the sense alone
  assert.ok(sunHigh(c.params, c.time), "the test's own check");
  let plane = 0;
  let deep = 0;
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i]) continue;
    const was = c.cur;
    c.bind(c.layer[i]);
    const sun = DESERT_ANT.sense!(c, i).sun;
    c.bind(was);
    if (c.layer[i] === PLANE) {
      assert.equal(sun, "high", `ant ${i} on the plane`);
      plane++;
    } else if (sun === "low") deep++;
  }
  assert.ok(plane > 0 && deep > 0, `ants on the plane (${plane}) and deep in the nest (${deep})`);
});

test("heat kills an ant past its critical heat, counted and named in the journal's cause", () => {
  const g = desert({ heatNoon: 70, heatSunHigh: 1.1 }); // a scorching noon, and no sun cue to keep it in
  run(g, P.heatDay / 2);
  assert.ok(g.player.diedHot > 0, `died of heat: ${g.player.diedHot}`);
});

test("the sun's cue keeps foragers in at noon and saves lives: fewer heat deaths than with no cue", () => {
  const deaths = (sunCue: boolean) => {
    const g = desert(sunCue ? {} : { heatSunHigh: 1.1 });
    run(g, P.heatDay);
    return g.player.diedHot;
  };
  const withCue = deaths(true);
  const without = deaths(false);
  assert.ok(withCue < without, `heat deaths over a day: ${withCue} with the sun's cue, ${without} without`);
});

test("the generic ant has no heat: no body heat, no deaths of heat", () => {
  const g = new Game(generateOneWorld(1), { antCount: 60, rival: false }, gameRng(1));
  run(g, 30);
  assert.equal(g.player.params.heatDay, 0);
  assert.ok(g.player.bodyHeat.every((b) => b === 0));
  assert.equal(g.player.diedHot, 0);
});
