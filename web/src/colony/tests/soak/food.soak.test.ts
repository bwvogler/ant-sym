// The long games of food.test.ts (split out so no file nears the 60 s per-file limit on CI, ja-6mj); the quick tests are in food.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { responses, type Responses } from "../../responses.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";
import { SMALL_SIDE } from "../builders.ts";

// Nest slice 5 (docs/nest-and-home.md §3.6): food lies in chambers. Foragers bring it to reception; porters carry it to
// where brood and the queen want it, and the rest down to stores; the queen and larvae eat what lies by them.


/** The most food drifted from the map's starting total over a two-colony game, every 5 s: map + jaws + larder + brood (1 + fed each) + 4 a birth. */
function drift(over?: Partial<Responses>, seconds = 300): { worst: number; g: Game } {
  const map = generateSideWorld(1, { ...SMALL_SIDE, nestCount: 2 });
  const g = new Game(map, { antCount: 200, rivalAnts: 200 }, mulberry32(7));
  if (over) for (const c of g.colonies) c.responses = responses(over);
  let worst = 0;
  for (let k = 0; k < 30 * seconds; k++) {
    g.tick(1 / 30);
    if (k % 150) continue;
    let s = map.foodLeft;
    for (const c of g.colonies) {
      for (let i = 0; i < c.n; i++) if (c.alive[i] && c.carrying[i]) s += 1;
      s += c.larder + 4 * c.births + c.eaten;
      for (const b of c.brood.items) s += 1 + b.fed;
    }
    s += g.royalFood();
    worst = Math.max(worst, Math.abs(s - map.foodTotal));
  }
  return { worst, g };
}

test("food is conserved over a game: map + jaws + larder + brood (1 + fed each) + 4 a birth is what the map started with", () => {
  // Review of slice 4: the invariant held to 2e-10 in reviewers' runs, but nothing tested it. 150 s of the 300 it ran: a 1 % leak
  // on every stock into or out of a chamber drifts the books by 1.6 at either length (the bound is 1e-6), and by 150 s the brood is raised.
  const { worst, g } = drift(undefined, 150);
  assert.ok(g.colonies.every((c) => c.births > 0 && c.portTrips > 0), "brood raised, food moved");
  assert.ok(worst < 1e-6, `food drifted by ${worst}`);
});

test("food is conserved when carriers put it down anywhere (behaviour MR 2: on the ground, in tunnels, a porter's in a chamber)", () => {
  let n = 0;
  const where = new Set<string>();
  const { worst, g } = drift({
    carry: (t) => {
      if (t.carrying !== "food" || n++ % 40) return "take";
      where.add(`${t.porter ? "porter" : "forager"} ${t.place}`);
      return "put down";
    },
  }, 150); // half the game: the file stays well inside its 60 s beside test:slow (review of #35)
  assert.ok(where.has("forager out") && where.has("forager tunnel") && where.has("porter chamber"), [...where].join(", "));
  assert.ok(g.colonies.every((c) => c.portTrips > 0), "food still moved");
  assert.ok(worst < 1e-6, `food drifted by ${worst}`);
});
