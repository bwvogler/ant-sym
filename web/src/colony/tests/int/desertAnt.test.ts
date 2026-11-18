import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE, type Colony } from "../../colony.ts";
import { MODE_WORDS, policyContext } from "../../colonyBrain.ts";
import { DESERT_ANT, DESERT_MODE_WORDS, DESERT_SCHEMA } from "../../desertAnt.ts";
import { localResponses, type Touch } from "../../responses.ts";
import { desertNoTrail, runAssay } from "../../experiment.ts";
import { Game, gameRng } from "../../game.ts";
import { LANES } from "../../lanes.ts";
import { inertLevers } from "../../levers.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { own, planeHole, smallOne } from "../builders.ts";
import type { Policy, SpeciesSituation } from "../../vocab.ts";

// ja-rf5.3: the desert ant on the descriptor (docs/desert-ant.md, PRD §60.2). A species made only of the descriptor's pieces: its own lane words
// and situation (mode, tired, enemy), no follow and no stance lane, no trail or alarm channel, no corpse removal, its own local rule.

test("its lane is its own: its context, its 128 situations, no follow", () => {
  assert.notEqual(policyContext("forage", DESERT_MODE_WORDS), policyContext("forage", MODE_WORDS));
  assert.equal(DESERT_SCHEMA.size, 128);
  assert.equal(LANES.mode.valid("k", "follow", DESERT_MODE_WORDS), false);
  assert.deepEqual(
    inertLevers(DESERT_ANT.params.channelSet ?? null, true).sort(),
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
    asked.length > 0 && asked.every((s) => JSON.stringify(Object.keys(s)) === '["mode","tired","hot","sun","enemy"]'),
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

test("each desert ant's stance is its own, like any ant's: a threat felt on home ground makes it defend, far from home it does not (owner, #184 D1)", () => {
  const g = new Game(smallOne(7), { antCount: 6, rivalAnts: 6, species: DESERT_ANT, regrow: 0 }, gameRng(1));
  const [a, b] = g.colonies as [Colony, Colony];
  for (const c of [a, b]) for (let i = 0; i < c.n; i++) c.alive[i] = i === 0 ? 1 : 0;
  // Ant 0 of the first colony has felt a threat (as oneWorldGame's and aphids' tests give it); it stands at its own hole, then at the other colony's.
  const stand = (hole: { x: number; y: number }): string => {
    for (let k = 0; k < 10; k++) {
      a.putAnt(0, PLANE, hole.x, hole.y);
      a.threat[0] = 5 * a.params.defendAt;
      g.tick(1 / 30);
    }
    return a.stanceOf(0);
  };
  assert.equal(stand(planeHole(own(a))), "defend", "on home ground it defends");
  assert.equal(stand(planeHole(own(b))), "forage", "far from home the same threat does not make it stand");
  assert.equal(g.player.params.maxAnts, 200, "about 200 workers (C. fortis)");
});

test("it fights a stranger it touches with nothing in its jaws, whatever the odds; a carrier takes its load home (owner, review of #138 D1)", () => {
  const t = { carrying: "none", stance: "forage", mode: "explore", odds: "outnumbered" } as Touch;
  assert.equal(localResponses.contact(t), "flee", "the generic ant turns away here");
  assert.equal(DESERT_ANT.responses.contact(t), "fight");
  assert.equal(DESERT_ANT.responses.contact({ ...t, carrying: "food" } as Touch), "flee");
});
