import { test } from "node:test";
import assert from "node:assert/strict";
import { DESERT_ANT } from "../../desertAnt.ts";
import { DEFAULT_MENU, STRAINS } from "../../fungus.ts";
import { Game, gameRng } from "../../game.ts";
import { encodeLevels } from "../../levers.ts";
import { generateOneWorld } from "../../oneWorld.ts";

// Split out of rouse.test.ts (ja-k4k.15.5): three 480 s games twice over took that file to 121 s, past the soak tier's 120 s limit.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

/** A one-world desert game with the fungus landed in the player's colony, its hosts pulling rouse at `level`, on game stream `rng`; passes the waiting ants met. */
function passes(level: number, seconds: number, rng: number): number {
  const g = new Game(generateOneWorld(1), { species: DESERT_ANT }, gameRng(rng), [{ antCount: 60 }]);
  g.fungus.configure({ hide: false, cull: false }, [...DEFAULT_MENU, "rouse"]);
  g.land(0, GARDEN);
  g.fungus.bindPolicy("fungus", (s) => encodeLevels({ rouse: s.task === "queen" ? 0 : level }, g.fungus.asked));
  let met = 0;
  for (let k = 0; k < seconds * 30; k++) {
    g.tick(1 / 30);
    met += g.colonies[0]!.holeSeen;
  }
  return met;
}

// Retuned with the brood-odour climb on by default (odour fade 0.1): with the odour channel running, the fungus infects only one or two hosts, and on
// most streams (1-3, 6, 7, 9, 10: also with the odour off) none of them comes down its shaft, so rouse changes nothing there (equal, never fewer). The
// property (a roused host coming down adds finders) holds where one does, so it plays 480 s on streams 4 and 5 (a third, 8, was left out to keep the file under the soak limit: it shows 384 and 417), each of which must show more passes roused.
for (const rng of [4, 5]) {
  test(`a roused desert host coming down its shaft counts as a finder to the ants waiting at the top: more passes than with rouse none (stream ${rng})`, () => {
    const off = passes(0, 480, rng);
    const on = passes(2, 480, rng);
    assert.ok(on > off, `stream ${rng}: passes the waiting ants met over eight minutes: ${on.toFixed(1)} roused, ${off.toFixed(1)} not`);
  });
}
