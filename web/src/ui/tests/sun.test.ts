import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COLONY, DESERT_ANT, type ColonyParams } from "../../colony/index.ts";
import { sunChip } from "../sun.ts";

// ja-rf5.8 (review of #194, S2): the HUD's sun chip says what the desert ants see of the sun, and the ground's heat, as the game runs.
const P = { ...DEFAULT_COLONY, ...DESERT_ANT.params } as ColonyParams;
const light = (1 - P.heatNight) * P.heatDay;

test("the sun chip follows the day: high and hottest at noon, down and cool at night; short on a phone", () => {
  const noon = light / 2 - P.heatStart;
  assert.equal(sunChip(P, noon), `sun high · ${P.heatNoon} °C`);
  assert.equal(sunChip(P, noon, true), `high · ${P.heatNoon}°`);
  const night = light + (P.heatNight * P.heatDay) / 2 - P.heatStart;
  assert.equal(sunChip(P, night), `sun down · ${P.heatDawn} °C`);
  assert.notEqual(sunChip(P, 0), sunChip(P, noon), "it changes as the game runs");
});
