// The long games of food.test.ts (split out so no file nears the 60 s per-file limit on CI, ja-6mj); the quick tests are in food.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { localResponses, responses, type Responses } from "../../responses.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// Nest slice 5 (docs/nest-and-home.md §3.6): food lies in chambers. Foragers bring it to reception; porters carry it to
// where brood and the queen want it, and the rest down to stores; the queen and larvae eat what lies by them.

/**
 * The most food drifted from the world's starting total over a two-colony game, every 5 s: both layers + jaws + larder + brood
 * (1 + fed each) + 4 a birth. On seed 1's small one world (S2.3c).
 */
function drift(over?: Partial<Responses>, seconds = 300): { worst: number; g: Game } {
  const w = smallOne(1);
  const g = new Game(w, { antCount: 200, rivalAnts: 200 }, mulberry32(7));
  if (over) for (const c of g.colonies) c.responses = responses(over);
  let worst = 0;
  for (let k = 0; k < 30 * seconds; k++) {
    g.tick(1 / 30);
    if (k % 150) continue;
    let s = w.plane.foodLeft + w.curtain.foodLeft;
    for (const c of g.colonies) {
      for (let i = 0; i < c.n; i++) if (c.alive[i] && c.carrying[i]) s += 1;
      s += c.larder + 4 * c.births + c.eaten;
      for (const b of c.brood.items) s += 1 + b.fed;
    }
    s += g.royalFood();
    worst = Math.max(worst, Math.abs(s - w.plane.foodTotal - w.curtain.foodTotal));
  }
  return { worst, g };
}

test("food is conserved over a game: map + jaws + larder + brood (1 + fed each) + 4 a birth is what the map started with", () => {
  // Review of slice 4: the invariant held to 2e-10 in reviewers' runs, but nothing tested it. 150 s of the 300 it ran: a 1 % leak
  // on every stock into or out of a chamber drifts the books by 1.6 at either length (the bound is 1e-6), and by 150 s the brood is raised.
  const { worst, g } = drift(undefined, 150);
  // Measured (S2.3c): births 66 and 49; porter trips 329 and 0 (the rival's foragers put all of theirs where it is eaten).
  assert.ok(
    g.colonies.every((c) => c.births > 0),
    "brood raised",
  );
  assert.ok(g.player.portTrips > 0, "food moved");
  assert.ok(worst < 1e-6, `food drifted by ${worst}`);
});

test("food is conserved when carriers put it down anywhere (behaviour MR 2: on the ground, in tunnels, a porter's in a chamber)", () => {
  // On one world a carrier is asked every tick, so a load put down at every 40th ask (as in the side view) never got home and no
  // porter had food to carry: one forager ask in 2,000 and one porter ask in 200 (S2.3c).
  const n = { porter: 0, forager: 0 };
  const every = { porter: 200, forager: 2000 };
  const where = new Set<string>();
  const { worst, g } = drift(
    {
      carry: (t) => {
        const who = t.porter ? "porter" : "forager";
        if (t.carrying !== "food" || n[who]++ % every[who]) return localResponses.carry(t);
        where.add(`${t.porter ? "porter" : "forager"} ${t.place}`);
        return "put down";
      },
    },
    210,
  ); // 210 s of the 300 (review of #35: the file stays inside its limit). With piErrorLaw 1 the player's first porter trip
  // came at ~165 s here, not ~105 s (food home by 150 s: 380, against 462 by the odometer law), so 150 s saw none.
  assert.ok(where.has("forager out") && where.has("forager tunnel") && where.has("porter chamber"), [...where].join(", "));
  assert.ok(g.player.portTrips > 0, "food still moved");
  assert.ok(worst < 1e-6, `food drifted by ${worst}`);
});
