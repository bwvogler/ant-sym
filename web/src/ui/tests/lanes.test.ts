import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMS, DOCTRINES, fungusContext, policyContext, stanceContext } from "../../colony/index.ts";
import { DEFAULT_COLONY_JEV } from "../colonyJev.ts";
import { LANE_KINDS, laneOfContext, PER_REQUEST, type LaneName } from "../../colony/index.ts";
import { perRequest, requestFor } from "../prompt.ts";

// One row a lane (colony/lanes.ts): the prefixes must be the ones the brains really put on their contexts, or a stored answer would be
// checked against no lane.

const NAMES = Object.keys(LANE_KINDS) as LaneName[];

test("each lane's context prefix is the one its brain puts on its cache contexts, and no prefix hides another", () => {
  assert.equal(laneOfContext(policyContext(DOCTRINES[0]!.text)), "mode");
  assert.equal(laneOfContext(stanceContext(DOCTRINES[0]!.text)), "stance");
  assert.equal(laneOfContext(fungusContext(AIMS[0]!.text, "side")), "fungus");
  assert.equal(laneOfContext(fungusContext(AIMS[0]!.text, "top")), "fungus");
  assert.equal(laneOfContext("something-else"), null);
  for (const a of NAMES)
    for (const b of NAMES) if (a !== b) assert.ok(!LANE_KINDS[a].contextPrefix.startsWith(LANE_KINDS[b].contextPrefix), `${a} vs ${b}`);
});

test("ids and counters are distinct per lane, and the request sizes are what the cost estimates use", () => {
  assert.equal(new Set(NAMES.map((n) => LANE_KINDS[n].idPrefix)).size, NAMES.length);
  assert.equal(new Set(NAMES.map((n) => LANE_KINDS[n].counter)).size, NAMES.length);
  assert.equal(perRequest("mode"), PER_REQUEST);
  assert.equal(perRequest("stance"), PER_REQUEST);
  assert.equal(perRequest("fungus"), LANE_KINDS.fungus.perRequest);
  assert.ok(LANE_KINDS.fungus.perRequest < PER_REQUEST);
  assert.ok(DEFAULT_COLONY_JEV.batch >= 1);
});

test("only the ants' mode lane is tallied as hits and misses; the fungus's replies do not make the ants reconsider", () => {
  assert.deepEqual(
    NAMES.filter((n) => LANE_KINDS[n].countsHits),
    ["mode"],
  );
  assert.deepEqual(
    NAMES.filter((n) => !LANE_KINDS[n].reconsiders),
    ["fungus"],
  );
});

test("a request's items carry the ids of their lane's row: s0 for ants' modes, c0 for stances, h0 for the fungus", () => {
  assert.deepEqual(
    Object.fromEntries(NAMES.map((n) => [n, LANE_KINDS[n].idPrefix])),
    { mode: "s", stance: "c", fungus: "h" },
    "these are on the wire and in the cached requests",
  );
  const sample = {
    mode: {
      lane: "mode",
      situation: { mode: "explore", tired: false, foodTrail: "none", homeTrail: "none", alarm: "none", enemy: "none", stance: "forage" },
    },
  } as const;
  assert.ok(JSON.stringify(requestFor(sample.mode, DOCTRINES[0]!.text, 2)).includes('"s1"'));
});
