import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERIC_ANT, speciesById } from "../../species.ts";
import { NEGLECTUS_ANT, NEGLECTUS_MODE_WORDS, NEGLECTUS_TOLERANCE, neglectusPolicy } from "../../neglectus.ts";
import { localPolicy } from "../../localRules.ts";
import { decodeSituation, SITUATIONS } from "../../situation.ts";
import { MODE_WORDS, policyContext, DOCTRINES } from "../../colonyBrain.ts";
import { Game, gameRng } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";

// The invasive garden ant on the descriptor (ja-e668.3, PRD §64.2): one supercolony's tolerance (owner, 2026-11-15) and its own mode words.

const game = (species = GENERIC_ANT, params = {}) =>
  new Game(generateOneWorld(1), { species, ...params }, gameRng(1), [{ antCount: 200 }, { antCount: 200 }]);

test("the invasive garden ant is a species the page can name, with its own mode words", () => {
  assert.equal(speciesById("neglectus"), NEGLECTUS_ANT);
  const forage = DOCTRINES[0]!.text;
  assert.notEqual(policyContext(forage, NEGLECTUS_MODE_WORDS), policyContext(forage, MODE_WORDS), "its words ask under their own context");
  // One population has no one to fight (owner, review of #244 D1): its words offer no fight (ja-e668.11 brings it back in mixed worlds).
  assert.deepEqual(Object.keys(NEGLECTUS_MODE_WORDS.criteria).sort(), ["explore", "follow", "return"]);
  // Its local rule offers only those: where the generic rule would fight, it explores; elsewhere it is the generic rule.
  let fights = 0;
  for (let c = 0; c < SITUATIONS; c++) {
    const sit = decodeSituation(c);
    const g = localPolicy(sit);
    if (g === "fight") fights++;
    assert.equal(neglectusPolicy(sit), g === "fight" ? "explore" : g);
  }
  assert.ok(fights > 0, "the generic rule fights somewhere (the check is not vacuous)");
  assert.equal(NEGLECTUS_ANT.policy, neglectusPolicy);
});

test("its tolerance reaches recognition, where fights are judged; the generic ant's and a game's own stay as they were", () => {
  assert.equal(game(NEGLECTUS_ANT).recognition.params.tolerance, NEGLECTUS_TOLERANCE);
  assert.equal(game().recognition.params.tolerance, 0.35);
  assert.equal(game(NEGLECTUS_ANT, { recognition: { tolerance: 0.5 } }).recognition.params.tolerance, 0.5, "a game's own wins");
  // At a tolerance of 1 every gap is within it: recognition is whole, not 0/0 (the unity score).
  const u = game(NEGLECTUS_ANT).unity();
  assert.equal(u.alike, true);
  assert.ok(Number.isFinite(u.score), `score ${u.score}`);
});

test("one supercolony: the two colonies never fight, where the generic ant's do", () => {
  // Retune (brood-odour climb on by default, which moved every game's stream): whether the two colonies meet inside 180 s is a property of the
  // world and the stream, and on world 1 / seed 1 (the old fixture) the generic ant no longer fights (it also does not on seeds 3 and 7). It
  // fights on seeds 2, 4, 5, 6 and 8 (first loss at 23, 48, 55, 42 and 61 s; 16, 3, 16, 24 and 12 losses by 180 s). So the check is played on
  // seeds 2, 4 and 6, each of which must hold the same bounds: the generic ant loses ants (not vacuous), the invasive garden ant none. Each run is 100 s,
  // not 180 (a 180 s game now takes ~23 s, and six of them would near the file's 120 s limit); the generic ant's first loss on these seeds is at 23, 48 and 42 s.
  for (const seed of [2, 4, 6]) {
    const losses = (sp: typeof GENERIC_ANT, seconds: number) => {
      const g = new Game(generateOneWorld(seed), { species: sp }, gameRng(seed), [{ antCount: 200 }, { antCount: 200 }]);
      for (let k = 0; k < 30 * seconds; k++) g.tick(1 / 30);
      return g.colonies.reduce((s, c) => s + c.losses, 0);
    };
    assert.ok(losses(GENERIC_ANT, 100) > 0, `seed ${seed}: the generic ant fights here (the test is not vacuous)`);
    assert.equal(losses(NEGLECTUS_ANT, 100), 0, `seed ${seed}`);
  }
});
