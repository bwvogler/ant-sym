import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  Game,
  GENERIC_ANT,
  LANES,
  generateWorld,
  localResponses,
  localStance,
  mulberry32,
  policyContext,
  situationKey,
  stanceContext,
  stanceKey,
  type LaneWords,
  type Mode,
  type Species,
} from "../../colony/index.ts";
import { ColonyJev } from "../colonyJev.ts";

// ja-fnd.5.8: the Jev client asks under the game's species' lane words (Species.lanes), and a species with no stance lane has none in the client.
// Checked through the cache: an answer seeded under a context is used only if a lane of the attached species asks under that context.

const LONE_MODE: LaneWords<Mode> = {
  legend: "Each key in `ants` is the situation of one lone forager. It leaves no trail and follows none. ",
  criteria: { explore: "explore: search alone for food", return: "return: walk home", fight: "fight: attack a stranger" },
  version: 1,
};
const LONE: Species = { id: "lone", name: "Lone forager", params: {}, responses: localResponses, lanes: { mode: LONE_MODE } };

const DOCTRINE = "forage";
const sit = LANES.mode.sample;
const stanceSit = LANES.stance.sample;
const live = new Set<ColonyJev>();
afterEach(() => {
  for (const j of live) j.dispose();
  live.clear();
});

function setup(species: Species | undefined, before?: (g: Game) => void) {
  const g = new Game(
    generateWorld(1, { size: { w: 60, h: 40 } }),
    { antCount: 5, rival: false, species: species ?? GENERIC_ANT },
    mulberry32(1),
  );
  const jev = new ColonyJev({});
  live.add(jev);
  jev.setDoctrine(DOCTRINE);
  before?.(g);
  if (species) jev.attachColonies(g.colonies, species);
  else jev.attachColonies(g.colonies);
  return { g, jev };
}

/** An answer other than the local rule's, so a hit is told apart from the local rule. */
function notLocal(allowed: readonly string[]): Mode {
  const local = LANES.mode.local(sit);
  return allowed.find((m) => m !== local) as Mode;
}

test("the generic ant asks under the generic contexts, whether or not the species is named", () => {
  for (const species of [undefined, GENERIC_ANT]) {
    const { g, jev } = setup(species);
    const answer = notLocal(["explore", "follow", "return", "fight"]);
    assert.equal(jev.seed(policyContext(DOCTRINE), [[situationKey(sit), answer]]), 1);
    assert.equal(g.player.policy(sit), answer, "the colony's mode lane reads the generic context");
    assert.equal(jev.seed(stanceContext(DOCTRINE), [[stanceKey(stanceSit), "raid"]]), 1, "the generic ant has a stance lane");
    assert.equal(jev.stancePolicy(stanceSit), "raid");
  }
});

test("a species asks under its own lane words: its own context, and only its own answers are accepted", () => {
  const { g, jev } = setup(LONE);
  const key = situationKey(sit);
  const answer = notLocal(Object.keys(LONE_MODE.criteria));
  assert.equal(jev.seed(policyContext(DOCTRINE), [[key, answer]]), 1, "a mode context, checked against the species' answers");
  assert.equal(g.player.policy(sit), LANES.mode.local(sit), "but the species' lane does not read the generic context");
  const own = policyContext(DOCTRINE, LONE_MODE);
  assert.notEqual(own, policyContext(DOCTRINE));
  assert.equal(jev.seed(own, [[key, "follow"]]), 0, "follow is not among the species' answers");
  assert.equal(jev.seed(own, [[key, answer]]), 1);
  assert.equal(g.player.policy(sit), answer, "the species' lane reads its own context");
  assert.equal(jev.state.cached, 1);
});

test("a species with no stance lane has none in the client: nothing seeded, counted or asked there", () => {
  let before: Game["player"]["stancePolicy"] | undefined;
  const { g, jev } = setup(LONE, (game) => (before = game.player.stancePolicy)); // read before the client attaches
  assert.equal(jev.seed(stanceContext(DOCTRINE), [[stanceKey(stanceSit), "raid"]]), 0);
  assert.equal(jev.state.stancesCached, 0);
  assert.equal(g.player.stancePolicy, before, "the colony keeps the stance policy the Game gave it");
  assert.equal(jev.stancePolicy(stanceSit), localStance(stanceSit));
  jev.setDoctrine("raid often"); // a new doctrine re-contexts only the lanes the species has
  assert.equal(jev.state.stancesCached, 0);
});

test("the species' own local rule stands in while a situation is unanswered (ja-fnd.5.9)", () => {
  const rule = () => "fight" as const;
  const { g, jev } = setup({ ...LONE, policy: rule });
  assert.equal(g.player.policy(sit), "fight", "the colony plays the species' rule, not the generic one");
  assert.equal(jev.explain(sit).mode, "fight");
  assert.equal(jev.explain(sit).by, "local");
});

test("a species with no mode words of its own still has its local rule in the client's fallbacks (review of #121, S2)", () => {
  const rule = () => "fight" as const;
  const { jev } = setup({ ...LONE, lanes: {}, policy: rule });
  assert.equal(jev.explain(sit).mode, "fight", "explain falls back to the species' rule");
  assert.equal(jev.explain(sit).by, "local");
  assert.equal(jev.policy(sit), "fight", "and so does the client's policy");
});
