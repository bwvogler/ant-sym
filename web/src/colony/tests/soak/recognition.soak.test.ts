// The long games of recognition.test.ts (split out so no file nears the 60 s per-file limit on CI, ja-6mj); the quick tests are in recognition.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STRAINS } from "../../fungus.ts";
import { Game } from "../../game.ts";
import { CURTAIN } from "../../colony.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// Recognition (ja-t4d.3): enemies are strangers by odour, not by colony; the
// fungus calms (B1), widens a host's tolerance (B4) and gives it its own odour
// (B3/B7); a colony full of hosts drifts toward that odour, and two colonies
// that come to smell alike stop fighting: unified.

// A whole game, so slower than the rest: its own timeout, and a small one world (160 × 100 plane).
const GAME = { timeout: 60_000 };

/** Seed 2, 150 + 150 ants, Garden painted on the nests of `which` colonies, five sim-minutes. */
function garden(which: "both" | "one"): Game {
  const strain = STRAINS.findIndex((s) => s.id === "garden");
  const g = new Game(smallOne(2), { antCount: 150, rivalAnts: 150 }, mulberry32(13));
  // Painted in the curtain round each royal chamber (S2.3c: on a small one world).
  for (const c of which === "both" ? g.colonies : [g.player]) g.paintSpores(c.nest.x, c.nest.y, c.nest.r + 2, 3, 0.3, strain, CURTAIN);
  for (let k = 0; k < 30 * 300; k++) g.tick(1 / 30);
  return g;
}

// Whether Garden painted on one colony crosses into the rival depends on the map (over seeds 1–6 it
// reaches the rival's nest on every one, and unifies most), so this checks what holds on all of them.
test(
  "in a real game: Garden in one colony moves that colony halfway and no further; the rival, if it crosses, stops halfway too",
  GAME,
  () => {
    const g = garden("one");
    assert.ok(
      g.player.nestOdour > 0.2 && g.player.nestOdour <= 0.5,
      `the player's nest moved toward the fungal odour, no further: ${g.player.nestOdour.toFixed(2)}`,
    );
    assert.ok(g.rival!.nestOdour >= 0.5, `the rival's nest stops at the fungal odour too: ${g.rival!.nestOdour.toFixed(2)}`);
  },
);
