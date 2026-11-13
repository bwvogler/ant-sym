import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { inertLevers } from "../../levers.ts";
import { CHANNELS, Pheromones, type Channel } from "../../pheromone.ts";
import { GENERIC_ANT, type Species } from "../../species.ts";
import { generateWorld, mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// ja-fnd.5.11: a species' channel set (ColonyParams.channelSet). A channel it lacks is never laid on any layer, so it holds nothing, wakes no chunk
// and reads 0; the fungus's levers on it have nothing to bend (inertLevers). The generic ant has every channel: goldens bit-exact.

const NO_ALARM: Channel[] = CHANNELS.filter((ch) => ch !== "alarm");
const QUIET: Species = { ...GENERIC_ANT, id: "quiet", name: "Quiet", params: { channelSet: NO_ALARM } };

test("a channel the species lacks takes no scent and reads 0; the others work as before", () => {
  const map = generateWorld(1, { size: { w: 40, h: 30 } });
  const ph = new Pheromones(map, undefined, ["food", "home"]);
  ph.deposit("alarm", 10, 10, 5);
  ph.deposit("food", 10, 10, 5);
  assert.equal(ph.read("alarm", 10, 10), 0);
  assert.equal(ph.live("alarm"), false, "no chunk woke");
  assert.ok(ph.read("food", 10, 10) > 0);
  assert.equal(ph.has("alarm"), false);
  assert.equal(ph.has("food"), true);
  assert.equal(new Pheromones(map).has("alarm"), true, "no set: every channel");
});

test("the fungus's levers on channels a species lacks are inert", () => {
  assert.deepEqual(inertLevers(null), [], "the generic ant: none");
  assert.deepEqual(inertLevers(NO_ALARM).sort(), ["alarm", "alarmLaid"]);
  const trailless = inertLevers(["home"]);
  for (const id of ["food", "rival", "trail", "leak", "alarm", "alarmLaid", "marks"]) assert.ok(trailless.includes(id), id);
  assert.ok(!trailless.includes("home"));
  assert.ok(!inertLevers(["home", "royal"]).includes("marks"), "a lever on several channels still acts while the species has one of them");
});

test("a species without alarm raises none in a game where the generic ant does", () => {
  const alarmed = (species: Species) => {
    const g = new Game(smallOne(7), { antCount: 60, rivalAnts: 60, species }, mulberry32(3));
    let live = false;
    for (let k = 0; k < 30 * 30; k++) {
      g.tick(1 / 30);
      live ||= g.colonies.some((c) => c.layers.some((l) => l.ph.live("alarm")));
    }
    for (const c of g.colonies) for (const l of c.layers) assert.equal(l.ph.has("alarm"), species !== QUIET, "every layer carries the set");
    return live;
  };
  assert.equal(alarmed(GENERIC_ANT), true, "the generic ant raises alarm here");
  assert.equal(alarmed(QUIET), false);
});
