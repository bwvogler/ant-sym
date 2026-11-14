import { test } from "node:test";
import assert from "node:assert/strict";
import { MODE_CRITERIA } from "../../colonyBrain.ts";
import { Game } from "../../game.ts";
import { localResponses } from "../../responses.ts";
import { defineSchema } from "../../schema.ts";
import type { Species } from "../../species.ts";
import { SITUATION_SCHEMA, type LaneWords, type Mode, type SpeciesSituation } from "../../vocab.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// ja-fnd.5.10, review of #122 (S2, S3): a species whose schema re-declares the generic fields plays exactly as the generic ant. A game of 35 s:
// the shortest that brings strangers into contact, whose answer the tick keeps with the species' own mode step (shorter games miss that path).
// Its own file, so the other species-situation tests stay quick.

const WORDS: LaneWords<Mode> = { legend: "the same fields", criteria: MODE_CRITERIA, version: 1 };

test("a species that re-declares the generic fields plays exactly as the generic ant (review of #122, S2)", () => {
  const same = defineSchema<SpeciesSituation>(SITUATION_SCHEMA.fields as never);
  const words: LaneWords<Mode> = { ...WORDS, schema: same };
  const mirror: Species = { id: "mirror", name: "Mirror", params: {}, responses: localResponses, lanes: { mode: words } };
  const play = (species?: Species) => {
    const g = new Game(smallOne(7), species ? { antCount: 40, species } : { antCount: 40 }, mulberry32(2));
    for (let k = 0; k < 30 * 35; k++) g.tick(1 / 30);
    return g;
  };
  // and in another order (mode last: its step in the code is 1, not the generic 972), so a code built with the wrong step shows
  const reordered = defineSchema<SpeciesSituation>([...SITUATION_SCHEMA.fields.slice(1), SITUATION_SCHEMA.fields[0]!] as never);
  const shuffled: Species = { ...mirror, id: "shuffled", lanes: { mode: { ...words, schema: reordered } } };
  const generic = play();
  // What the ants do, as the golden masters compare it, and the generic question each keeps (S1, S3); the species codes in `asked` differ by design when the fields are reordered.
  const behaviour = (g: Game) =>
    JSON.stringify(
      g.colonies.map((c) => [c.x, c.y, c.heading, c.mode, c.carrying, c.alive, c.question].map((a) => Array.from(a.subarray(0, c.n)))),
    );
  for (const g of [play(mirror), play(shuffled)]) {
    assert.equal(behaviour(g), behaviour(generic));
    assert.equal(g.player.decisions, generic.player.decisions, "as many questions");
  }
  assert.ok(generic.player.decisions > 0);
});
