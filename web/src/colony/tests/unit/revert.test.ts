import { test } from "node:test";
import assert from "node:assert/strict";
import { LARVA } from "../../brood.ts";
import { Colony } from "../../colony.ts";
import { CELL, cellOf } from "../../hex.ts";
import { NEED_FETCH } from "../../hunger.ts";
import { worksInside } from "../../nestWork.ts";
import { fetches } from "../../tunnel.ts";
import { BROOD_SMELL, REVERT_BELOW } from "../../tuning.ts";
import { EXPLORE } from "../../vocab.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";
import { SMALL_SIDE, ageOf } from "../builders.ts";

// Task reversion (ja-7r7x, docs/task-reversion.md, PRD §74): an old ant at home that meets no young nestmates nurses as
// the young do, if it is among the share `revert` of the old that can. World 2 of SMALL_SIDE, a fixed "explore" policy.

const colony = (revert: number, n: number) =>
  new Colony(generateSideWorld(2, SMALL_SIDE), { antCount: n, maxAnts: n, revert }, mulberry32(7), (() => "explore") as never);

/** Ant i of age band `band` at the nest's centre, exploring, empty-jawed. */
function home(c: Colony, i: number, band: 0 | 1 | 2) {
  c.age[i] = ageOf(band);
  c.x[i] = c.nest.x;
  c.y[i] = c.nest.y;
  c.mode[i] = EXPLORE;
  c.carrying[i] = 0;
}

/** A larva lying at the nest's centre (where `home` puts the ants): brood the old ant meets. */
function larvaAtHome(c: Colony) {
  cellOf(c.nest.x, c.nest.y);
  const b = c.brood.add(CELL[0], CELL[1], c.map.chambers!.at(CELL[0], CELL[1]));
  b.stage = LARVA;
  b.energy = 1;
  return b;
}

/** Hold ants in place (the test is the sense, not where they walk) and step `secs` seconds. */
function hold(c: Colony, secs: number, place: () => void) {
  for (let t = 0; t < 30 * secs; t++) {
    place();
    c.tick(1 / 30);
  }
}

test("youngMet: an old ant at home beside a young one keeps meeting it; alone, the sense fades over YOUNG_TAU and it reverts", () => {
  const c = colony(1, 2);
  hold(c, 120, () => {
    home(c, 0, 2);
    home(c, 1, 0); // a young nestmate on the same cell
  });
  assert.ok(c.youngMet[0] > 0.9, `beside a young one: ${c.youngMet[0]}`);
  assert.equal(c.reverts(0), false);
  const alone = colony(1, 1);
  assert.equal(alone.youngMet[0], 1, "born as if among the young");
  larvaAtHome(alone);
  hold(alone, 240, () => home(alone, 0, 2));
  assert.ok(alone.broodMet[0] > 0.9, `beside a larva: ${alone.broodMet[0]}`);
  assert.ok(alone.youngMet[0] < REVERT_BELOW, `alone for 240 s: ${alone.youngMet[0]}`);
  assert.equal(alone.reverts(0), true, "an old ant meeting brood and no young reverts");
});

test("no brood, no reversion: an old ant at home that meets neither young nor brood keeps foraging (review of #217, D1)", () => {
  const c = colony(1, 1);
  hold(c, 240, () => home(c, 0, 2));
  assert.ok(c.youngMet[0] < REVERT_BELOW, "it has met no young");
  assert.ok(c.broodMet[0] < 0.01, `nor brood: ${c.broodMet[0]}`);
  assert.equal(c.reverts(0), false, "a colony with no brood (one at its cap lays none) keeps its foragers");
  assert.equal(c.mayGoOut(0), true);
});

test("a middle-aged nestmate is not a young one: an old ant beside it, by brood, still reverts", () => {
  const c = colony(1, 2);
  larvaAtHome(c);
  hold(c, 240, () => {
    home(c, 0, 2);
    home(c, 1, 1); // middle-aged, on the same cell
  });
  assert.ok(c.youngMet[0] < REVERT_BELOW, `the middle-aged don't count: ${c.youngMet[0]}`);
  assert.equal(c.reverts(0), true);
});

test("revert 0: the sense is not kept and nobody reverts (main)", () => {
  const c = colony(0, 1);
  hold(c, 240, () => home(c, 0, 2));
  assert.equal(c.youngMet[0], 1, "never updated");
  c.youngMet[0] = 0;
  assert.equal(c.reverts(0), false);
});

test("a reverted old ant stays in and works inside at the young's threshold; the young, the middle-aged and a forager outside never revert", () => {
  const c = colony(1, 1);
  home(c, 0, 2);
  c.under[0] = 1;
  c.youngMet[0] = 0;
  c.broodMet[0] = 1;
  assert.equal(c.reverts(0), true);
  assert.equal(c.mayGoOut(0), false, "it stays in like the young");
  assert.equal(c.outbound(0), false, "not a forager on its way out");
  assert.equal(worksInside(c, 0), true, "it works inside whatever its felt need");
  c.need[0] = NEED_FETCH;
  assert.equal(fetches(c, 0), true, "it fetches at the young's threshold");
  c.need[0] = 0;
  for (const band of [0, 1] as const) {
    c.age[0] = ageOf(band);
    assert.equal(c.reverts(0), false, `band ${band} doesn't revert`);
  }
  c.age[0] = ageOf(2);
  c.under[0] = 0;
  assert.equal(c.reverts(0), false, "out on the ground it is a forager");
});

test("only the share `revert` of the old can revert, each by its own draw", () => {
  const n = 200;
  const count = (share: number) => {
    const c = colony(share, n);
    let k = 0;
    for (let i = 0; i < n; i++) {
      c.age[i] = ageOf(2);
      c.under[i] = 1;
      c.youngMet[i] = 0;
      c.broodMet[i] = 1;
      if (c.reverts(i)) k++;
    }
    return k;
  };
  const quarter = count(0.25);
  assert.ok(Math.abs(quarter - 50) <= 4, `about a quarter of 200: ${quarter}`);
  assert.equal(count(1), n, "all");
  assert.equal(count(0), 0, "none");
});

test("a reverted ant goes back once it meets young again", () => {
  const c = colony(1, 2);
  larvaAtHome(c);
  hold(c, 240, () => {
    home(c, 0, 2);
    home(c, 1, 0);
    c.x[1] = c.nest.x + 400; // the young one far off
  });
  assert.equal(c.reverts(0), true, "reverted while alone");
  hold(c, 30, () => {
    home(c, 0, 2);
    home(c, 1, 0); // the young one back beside it
  });
  assert.ok(c.youngMet[0] >= REVERT_BELOW, `met young again: ${c.youngMet[0]}`);
  assert.equal(c.reverts(0), false, "back to foraging");
});

test("the young gone, an old ant by brood reverts; the brood gone too, it stops (both grids rebuilt each tick)", () => {
  const c = colony(1, 2);
  const b = larvaAtHome(c);
  const away = () => {
    home(c, 0, 2);
    home(c, 1, 0);
    c.x[1] += 200; // the young one kept well out of reach
  };
  hold(c, 120, () => {
    home(c, 0, 2);
    home(c, 1, 0);
  });
  assert.equal(c.reverts(0), false, "a young one beside it");
  hold(c, 240, away);
  assert.equal(c.reverts(0), true, "the young gone, the brood still there");
  b.x += 10; // the larva carried off, out of smell
  hold(c, 240, away);
  assert.equal(c.reverts(0), false, "the brood gone too");
});

test("brood is smelt a few cells off: an old ant BROOD_SMELL cells from a larva, meeting no young, reverts; further off, not", () => {
  const at = (dx: number) => {
    const c = colony(1, 1);
    const b = larvaAtHome(c);
    b.x += dx;
    hold(c, 240, () => home(c, 0, 2));
    return c.reverts(0);
  };
  assert.equal(at(BROOD_SMELL), true, "within smell");
  assert.equal(at(BROOD_SMELL + 6), false, "out of smell");
});
