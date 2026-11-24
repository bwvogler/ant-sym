import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { generateEndlessWorld, type EndlessWorld } from "../../endlessWorld.ts";
import { Game, gameRng, GAME_REGROW } from "../../game.ts";
import { STRAINS } from "../../fungus.ts";
import { PLANE } from "../../vocab.ts";
import { DT } from "../builders.ts";

// The acceptance of the endless world (PRD §66 E6.0.3, `ja-qpv.9`): a game over the endless plane plays five simulated minutes headless with the awake rule
// on and the fungus landed, and a site the fungus's body comes within W of wakes. Each colony is small (40 ants) to keep the file within its time.

const SEED = 3;
const games: Game[] = [];
afterEach(() => {
  games.length = 0;
});

test("five minutes on the endless plane: the awake rule on, the fungus landed, a wild site woken by its body, no throw", () => {
  const world = generateEndlessWorld(SEED) as EndlessWorld;
  const g = new Game(world, { regrow: GAME_REGROW, autoFound: false }, gameRng(SEED), [{ antCount: 40 }, { antCount: 40 }]);
  games.push(g);
  g.enableSleep();
  g.land(
    0,
    STRAINS.findIndex((s) => s.id === "garden"),
    { evolve: true },
  );
  const start = g.colonies.length;
  let painted: { rx: number; ry: number } | null = null;
  for (let k = 0; k < 300 / DT; k++) {
    g.tick(DT);
    if (k === Math.round(60 / DT)) {
      // The fungus's body near a site that is still asleep: paint spores a hundred cells from it (inside W).
      const s = g.sites.find((o) => o.rx !== undefined);
      assert.ok(s, "a wild site is listed near the awake colonies");
      painted = { rx: s.rx!, ry: s.ry! };
      g.paintSpores(s.x - 100, s.y, 6, 5, 0, 1);
    }
  }
  assert.ok(painted);
  assert.ok(g.colonies.length > start, `a site woke (${start} colonies at the start, ${g.colonies.length} now)`);
  assert.ok(!g.sites.some((s) => s.rx === painted!.rx && s.ry === painted!.ry), "the woken site is a colony, not a listed site");
  const w = g.founded.find((f) => f.wild && f.wild.rx === painted!.rx && f.wild.ry === painted!.ry);
  assert.ok(w, "recorded in the foundings as a wild colony");
  assert.ok(g.time >= 300);
  // chunks were made only where something awake read: a few hundred, not a plane
  assert.ok(world.plane.rock.count < 2000, `${world.plane.rock.count} chunks made`);
  assert.ok(g.colonies.some((c) => c.layers[PLANE] && c.population > 0));
});
