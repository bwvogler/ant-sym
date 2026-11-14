import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { localPolicy } from "../../colony.ts";
import { readMode } from "../../colonyBrain.ts";
import { generateWorld, mulberry32 } from "../../world.ts";
import { isWeighted, pick, topOf, weigh, weightedValid, weightsOf } from "../../weighted.ts";
import { MODES, type Mode, type Policy } from "../../vocab.ts";
import { ticks } from "../builders.ts";

// Jev's mode with its probabilities (ja-nan3; weighted.ts): kept with the answer, drawn from by each ant with its
// colony's rng, and drawn afresh after `reroll` seconds; a policy that never draws leaves the game as it was.

const MODES_ALL = [...MODES];

test("weigh keeps Jev's choice first, the other allowed modes by probability, and drops what would almost never be drawn", () => {
  assert.equal(
    weigh("follow", { follow: 0.6, explore: 0.3, return: 0.098, fight: 0.002 }, MODES_ALL),
    "follow=0.601,explore=0.301,return=0.098",
  );
  // renormalised over what is kept; a choice that is not the most likely still comes first (it is what the caches held)
  assert.equal(weigh("explore", { follow: 0.5, explore: 0.25, fight: 0.25 }, ["follow", "explore"]), "explore=0.333,follow=0.667");
  assert.equal(weigh("return", undefined, MODES_ALL), "return", "no probabilities: a bare mode");
  assert.equal(weigh("return", { return: 0.999, explore: 0.001 }, MODES_ALL), "return", "nothing else worth drawing: a bare mode");
  assert.equal(weigh("fight", { explore: 1 }, MODES_ALL), "fight", "probabilities that miss the choice are not trusted");
});

test("readMode reads a reply's probabilities over the modes allowed", () => {
  const answers = {
    s0_mode: { type: "choice" as const, choice: "follow", probabilities: { follow: 0.7, explore: 0.2, return: 0.1 } },
    s1_mode: { type: "choice" as const, choice: "follow" },
    s2_mode: { type: "choice" as const, choice: "dance", probabilities: { dance: 1 } },
  };
  assert.equal(readMode(answers, "s0"), "follow=0.7,explore=0.2,return=0.1");
  assert.equal(readMode(answers, "s0", ["follow", "return"]), "follow=0.875,return=0.125", "a species' modes only");
  assert.equal(readMode(answers, "s1"), "follow");
  assert.equal(readMode(answers, "s2"), null);
});

test("an answer parses, checks and reads its choice whether weighted or bare", () => {
  assert.equal(topOf("follow=0.7,explore=0.3"), "follow");
  assert.equal(topOf("follow"), "follow");
  assert.deepEqual(weightsOf("follow=0.7,explore=0.3"), [
    ["follow", 0.7],
    ["explore", 0.3],
  ]);
  assert.deepEqual(weightsOf("follow"), [["follow", 1]]);
  assert.equal(weightsOf("follow=x"), null);
  assert.equal(weightsOf("follow=1.5"), null);
  assert.equal(isWeighted("follow"), false);
  const ok = (m: string) => (MODES as readonly string[]).includes(m);
  assert.ok(weightedValid("follow=0.7,explore=0.3", ok));
  assert.ok(weightedValid("return", ok));
  assert.ok(!weightedValid("follow=0.7,dance=0.3", ok));
  assert.ok(!weightedValid("", ok));
});

test("pick draws once by probability, and not at all without a draw, from a bare answer or at temperature 0", () => {
  let calls = 0;
  const at = (u: number) => Object.assign(() => (calls++, u), { temperature: 1 });
  const w = "follow=0.6,explore=0.3,return=0.1";
  assert.equal(pick(w), "follow");
  assert.equal(pick(w, at(0)), "follow");
  assert.equal(pick(w, at(0.65)), "explore");
  assert.equal(pick(w, at(0.95)), "return");
  assert.equal(calls, 3, "one draw a pick");
  calls = 0;
  assert.equal(pick("return", at(0.95)), "return");
  assert.equal(
    pick(
      w,
      Object.assign(() => (calls++, 0.95), { temperature: 0 }),
    ),
    "follow",
  );
  assert.equal(calls, 0, "a bare answer and temperature 0 never draw");
  // temperature flattens or sharpens: at a high one the three are close to even, at a low one Jev's choice almost always
  const share = (temperature: number) => {
    let follow = 0;
    for (let k = 0; k < 1000; k++)
      if (
        pick(
          w,
          Object.assign(() => (k + 0.5) / 1000, { temperature }),
        ) === "follow"
      )
        follow++;
    return follow / 1000;
  };
  assert.ok(Math.abs(share(1) - 0.6) < 0.01);
  assert.ok(share(100) < 0.36 && share(100) > 0.31, `high temperature: ${share(100)}`);
  assert.ok(share(0.1) > 0.98, `low temperature: ${share(0.1)}`);
});

const game = (params: { reroll?: number; sampleTemp?: number } = {}) =>
  new Game(generateWorld(1, { size: { w: 120, h: 80 } }), { antCount: 40, rivalAnts: 10 }, mulberry32(3), { colony: params });

/** A policy that answers every situation with the same distribution, drawn from as the page's does. */
const drawing =
  (w: string): Policy =>
  (_s, draw) =>
    pick(w, draw) as Mode;

test("ants of one colony asked the same weighted answer draw different modes, and draw again after `reroll` seconds", () => {
  const g = game({ reroll: 2 });
  const c = g.player;
  c.bindPolicy("mode", drawing("explore=0.5,follow=0.5"));
  ticks(g, 3);
  const empty = [...Array(c.params.antCount).keys()].filter((i) => c.alive[i] && !c.carrying[i] && !c.pellet[i]);
  const modes = new Set(empty.map((i) => c.mode[i]));
  assert.ok(modes.size >= 2, "one situation, more than one mode");
  assert.ok(
    empty.some((i) => c.redraw[i] > 0),
    "an ant that drew has a clock to draw again",
  );
  const before = c.decisions;
  ticks(g, Math.round(2.5 * 30));
  assert.ok(c.decisions > before + empty.length / 2, `asked again on the clock (${c.decisions - before} decisions)`);
});

test("a policy that never draws leaves every ant without a clock (the local rule's game is unchanged)", () => {
  const g = game();
  const c = g.player;
  c.bindPolicy("mode", (s) => localPolicy(s));
  ticks(g, 30);
  for (let i = 0; i < c.params.antCount; i++) assert.equal(c.redraw[i], -1);
});

test("the Lab's setChoice reaches every colony, and colonies founded after it", () => {
  const g = game();
  g.setChoice({ sampleTemp: 0.5, reroll: 4 });
  for (const c of g.colonies) assert.deepEqual([c.params.sampleTemp, c.params.reroll], [0.5, 4]);
  const later = g.colonies[g.addColony({ x: 80, y: 50, antCount: 5, odour: 0.5 })]!;
  assert.deepEqual([later.params.sampleTemp, later.params.reroll], [0.5, 4]);
  assert.equal(later.policyDraw.temperature, 0.5, "the draw a colony hands its policy carries its temperature");
});
