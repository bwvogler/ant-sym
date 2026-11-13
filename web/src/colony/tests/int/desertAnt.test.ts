import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE } from "../../colony.ts";
import { MODE_WORDS, policyContext } from "../../colonyBrain.ts";
import { DESERT_ANT, DESERT_MODE_WORDS, DESERT_SCHEMA } from "../../desertAnt.ts";
import { desertNoTrail, runAssay } from "../../experiment.ts";
import { Game, gameRng } from "../../game.ts";
import { LANES } from "../../lanes.ts";
import { inertLevers } from "../../levers.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import type { Policy, SpeciesSituation } from "../../vocab.ts";

// ja-rf5.3: the desert ant on the descriptor (docs/desert-ant.md, PRD §60.2). A species made only of the descriptor's pieces: its own lane words
// and situation (mode, tired, enemy), no follow and no stance lane, no trail or alarm channel, no corpse removal, its own local rule.

test("its lane is its own: its context, its 16 situations, no follow, no stance lane", () => {
  assert.notEqual(policyContext("forage", DESERT_MODE_WORDS), policyContext("forage", MODE_WORDS));
  assert.equal(DESERT_SCHEMA.size, 16);
  assert.equal(LANES.mode.valid("k", "follow", DESERT_MODE_WORDS), false);
  assert.equal(DESERT_ANT.lanes.stance, undefined);
  assert.deepEqual(
    inertLevers(DESERT_ANT.params.channelSet ?? null).sort(),
    ["alarm", "alarmLaid", "food", "leak", "rival"],
    "home and trail still reach its road signs",
  );
});

test("it plays a game alone: no trail, its own situations, food found and brought home", () => {
  const asked: SpeciesSituation[] = [];
  const spy: Policy = (s) => (asked.push(s as SpeciesSituation), DESERT_ANT.policy!(s));
  const g = new Game(generateOneWorld(1), { antCount: 60, rival: false, species: { ...DESERT_ANT, policy: spy } }, gameRng(1));
  for (let k = 0; k < 30 * 120; k++) g.tick(1 / 30);
  const c = g.player;
  const plane = c.layers[PLANE]!.ph;
  assert.equal(plane.live("food"), false, "no food trail");
  assert.equal(plane.live("home"), false, "no home trail");
  assert.equal(plane.live("alarm"), false, "no alarm");
  assert.ok(
    asked.length > 0 && asked.every((s) => JSON.stringify(Object.keys(s)) === '["mode","tired","enemy"]'),
    "asked only its own fields",
  );
  assert.ok(
    asked.every((s) => s.mode !== "follow"),
    "never following",
  );
  assert.equal(c.seen.length, DESERT_SCHEMA.size);
  assert.ok(c.stored > 0, `food brought home (${c.stored})`);
  assert.equal(c.params.undertakes, false);
});

test("D1: a desert ant lays no trail (the assay, with the species)", () => {
  for (const seed of [1, 2]) assert.equal(runAssay(desertNoTrail, seed, { game: { species: DESERT_ANT } }).metrics.pass, 1, `seed ${seed}`);
});
