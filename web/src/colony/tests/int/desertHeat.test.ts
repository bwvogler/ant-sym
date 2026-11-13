import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE } from "../../colony.ts";
import { RETURN, type SpeciesSituation } from "../../vocab.ts";
import { atGate } from "../../crossing.ts";
import { DESERT_ANT, DESERT_SCHEMA, desertPolicy } from "../../desertAnt.ts";
import { Game, gameRng } from "../../game.ts";
import { bodyHeatAfter, feelsHot, groundHeat, pastCritical, sunHeight, sunHigh, sunSeen } from "../../heat.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { DEFAULT_COLONY, type ColonyParams } from "../../params.ts";
import { run } from "../builders.ts";

// ja-rf5.5 and ja-rf5.12 (docs/desert-heat.md, PRD §60.5): the desert ant's heat. The ground follows the sun over a day; a body heats out on the
// plane and cools in the nest; it feels hot from heatFelt until back under heatCool; it dies past heatDeath; it sees the sun high where the sky is in view.

const P: ColonyParams = { ...DEFAULT_COLONY, ...DESERT_ANT.params } as ColonyParams;

test("the day: the sun rises at 0, stands highest at noon, sets, and is down for the night; the ground follows it", () => {
  const Q = { ...P, heatStart: 0 }; // game time 0 at sunrise, for the arithmetic
  const light = (1 - Q.heatNight) * Q.heatDay;
  assert.equal(sunHeight(Q, 0), 0);
  assert.ok(Math.abs(sunHeight(Q, light / 2) - 1) < 1e-12, "noon");
  assert.equal(groundHeat(Q, 0), Q.heatDawn);
  assert.ok(Math.abs(groundHeat(Q, light / 2) - Q.heatNoon) < 1e-9);
  assert.equal(sunSeen(Q, 1), "low");
  assert.equal(sunSeen(Q, light / 2), "high");
  assert.equal(sunSeen(Q, light + 1), "down");
  assert.equal(groundHeat(Q, light + 1), Q.heatDawn, "the night is cool");
  assert.equal(sunSeen(Q, Q.heatDay + 1), "low", "a day later, the sun is up again");
  assert.equal(sunSeen({ ...Q, heatDay: 0 }, 300), "low", "no day: never high, never down");
  assert.equal(sunSeen(P, 0), "high", "a desert game opens as the sun turns high (heatStart)");
  assert.equal(sunSeen(P, -P.heatStart + 1), "low", "a moment after sunrise, before it does");
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
  run(g, 150); // the high sun of the morning: ants out on the plane
  const c = g.player;
  (c.params as { heatSunHigh: number }).heatSunHigh = 0.1; // the sun counts as high from here, for the sense alone
  assert.ok(sunHigh(c.params, c.time), "the test's own check");
  let plane = 0;
  let top = 0;
  let deep = 0;
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i]) continue;
    const was = c.cur;
    c.bind(c.layer[i]);
    const sun = DESERT_ANT.sense!(c, i).sun;
    const gate = c.layer[i] !== PLANE && atGate(c, i);
    c.bind(was);
    if (c.layer[i] === PLANE) {
      assert.equal(sun, "high", `ant ${i} on the plane`);
      plane++;
    } else if (gate) {
      assert.equal(sun, "high", `ant ${i} at the top of its shaft (review of #155, S2)`);
      top++;
    } else {
      assert.equal(sun, "unseen", `ant ${i} deeper in the nest`);
      deep++;
    }
  }
  assert.ok(plane > 0 && top > 0 && deep > 0, `ants on the plane (${plane}), at the top of the shaft (${top}) and deeper in (${deep})`);
});

test("the local rule sends a hot ant home, whatever else it senses (review of #155, S2)", () => {
  for (let code = 0; code < DESERT_SCHEMA.size; code++) {
    const sit = DESERT_SCHEMA.decode(code);
    const hot = sit as SpeciesSituation;
    if (hot.hot === true) assert.equal(desertPolicy(sit), "return", DESERT_SCHEMA.key(sit));
  }
  // A cool, fresh explorer under a high sun with nobody near goes on: the rule above is the heat's, not every answer.
  assert.equal(
    desertPolicy({ mode: "explore", tired: false, hot: false, sun: "high", enemy: "none" } as unknown as SpeciesSituation),
    "explore",
  );
});

test("heat kills an ant past its critical heat, and it is counted", () => {
  const g = desert({ heatNoon: 70 }); // a scorching noon, under which the desert ant still goes out
  run(g, P.heatDay / 2);
  assert.ok(g.player.diedHot > 0, `died of heat: ${g.player.diedHot}`);
});

test("the papers' direction: more desert ants out under the high sun than in the low sun of the morning (owner, review of #155 D1)", () => {
  const g = desert();
  const light = (1 - P.heatNight) * P.heatDay;
  const onPlane = () => g.player.layer.filter((l, i) => g.player.alive[i] === 1 && l === PLANE).length;
  let low = 0;
  let noon = 0;
  for (let t = 0; t < P.heatDay; t += 5) {
    run(g, 5);
    const at = (g.time + P.heatStart) % P.heatDay; // seconds since sunrise
    if (at < light / 8) low += onPlane();
    else if (Math.abs(at - light / 2) < light / 8) noon += onPlane();
  }
  assert.ok(noon > low, `ant-samples on the plane: ${noon} at noon, ${low} in the morning's low sun`);
});

test("the sun read as unseen deeper in sends the ant up to look; seen low or down at the top, it turns back", () => {
  const s = (sun: string) => desertPolicy({ mode: "explore", tired: false, hot: false, sun, enemy: "none" } as unknown as SpeciesSituation);
  assert.equal(s("unseen"), "explore");
  assert.equal(s("low"), "return");
  assert.equal(s("down"), "return");
});

test("at night no ant sets out: on the plane in the dark, only ants on their way home (lost carriers searching for the hole)", () => {
  const g = desert();
  const light = (1 - P.heatNight) * P.heatDay;
  const onPlane = () => g.player.layer.filter((l, i) => g.player.alive[i] === 1 && l === PLANE).length;
  run(g, 80); // the morning's high sun: out (at noon itself they come in to cool, the midday dip)
  const morning = onPlane();
  run(g, light + (P.heatNight * P.heatDay) / 2 - P.heatStart - 80); // midnight
  const midnight = onPlane();
  const away = g.player.layer.filter((l, i) => g.player.alive[i] === 1 && l === PLANE && g.player.mode[i] !== RETURN).length;
  assert.ok(morning > 10, `on the plane in the morning's high sun: ${morning}`);
  assert.equal(away, 0, `at midnight ${midnight} on the plane, ${away} of them not on their way home`);
});

test("the generic ant has no heat: no body heat, no deaths of heat", () => {
  const g = new Game(generateOneWorld(1), { antCount: 60, rival: false }, gameRng(1));
  run(g, 30);
  assert.equal(g.player.params.heatDay, 0);
  assert.ok(g.player.bodyHeat.every((b) => b === 0));
  assert.equal(g.player.diedHot, 0);
});
