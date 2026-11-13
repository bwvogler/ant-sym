import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE } from "../../colony.ts";
import { RETURN } from "../../vocab.ts";
import { DESERT_ANT } from "../../desertAnt.ts";
import { Game, gameRng } from "../../game.ts";
import { bodyHeatAfter, feelsHot, groundHeat, pastCritical, sunHeight, sunHigh, sunSeen } from "../../heat.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { DEFAULT_COLONY, type ColonyParams } from "../../params.ts";
import { run } from "../builders.ts";

// ja-rf5.5 and ja-rf5.12 (docs/desert-heat.md, PRD §60.5): the desert ant's heat. The ground follows the sun over a day; a body heats out on the
// plane and cools in the nest; it feels hot from heatFelt until back under heatCool; it dies past heatDeath; it sees the sun high where the sky is in view.

const P: ColonyParams = { ...DEFAULT_COLONY, ...DESERT_ANT.params } as ColonyParams;

test("the day: the sun rises at 0, stands highest at noon, sets, and is down for the night; the ground follows it", () => {
  const light = (1 - P.heatNight) * P.heatDay;
  assert.equal(sunHeight(P, 0), 0);
  assert.ok(Math.abs(sunHeight(P, light / 2) - 1) < 1e-12, "noon");
  assert.equal(groundHeat(P, 0), P.heatDawn);
  assert.ok(Math.abs(groundHeat(P, light / 2) - P.heatNoon) < 1e-9);
  assert.equal(sunSeen(P, 1), "low");
  assert.equal(sunSeen(P, light / 2), "high");
  assert.equal(sunSeen(P, light + 1), "down");
  assert.equal(groundHeat(P, light + 1), P.heatDawn, "the night is cool");
  assert.equal(sunSeen(P, P.heatDay + 1), "low", "a day later, the sun is up again");
  assert.equal(sunSeen({ ...P, heatDay: 0 }, 300), "low", "no day: never high, never down");
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

test("heat kills an ant past its critical heat, and it is counted", () => {
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

test("at night no ant sets out: on the plane in the dark, only ants on their way home (lost carriers searching for the hole)", () => {
  const g = desert();
  const light = (1 - P.heatNight) * P.heatDay;
  const onPlane = () => g.player.layer.filter((l, i) => g.player.alive[i] === 1 && l === PLANE).length;
  run(g, light / 6); // mid-morning
  const morning = onPlane();
  run(g, light + (P.heatNight * P.heatDay) / 2 - light / 6); // midnight
  const midnight = onPlane();
  const away = g.player.layer.filter((l, i) => g.player.alive[i] === 1 && l === PLANE && g.player.mode[i] !== RETURN).length;
  assert.ok(morning > 10, `on the plane in the morning: ${morning}`);
  assert.equal(away, 0, `at midnight ${midnight} on the plane, ${away} of them not on their way home`);
});

test("the generic ant has no heat: no body heat, no deaths of heat", () => {
  const g = new Game(generateOneWorld(1), { antCount: 60, rival: false }, gameRng(1));
  run(g, 30);
  assert.equal(g.player.params.heatDay, 0);
  assert.ok(g.player.bodyHeat.every((b) => b === 0));
  assert.equal(g.player.diedHot, 0);
});
