import { test } from "node:test";
import { CELL, cellOf } from "../../hex.ts";
import { at, nestAt, put } from "../hexmaps.ts";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../../battle.ts";
import { Colony, localPolicy, localStance } from "../../colony.ts";
import { MODES, type Situation, type StanceSituation } from "../../vocab.ts";
import { localResponses, responses } from "../../responses.ts";
import { Game } from "../../game.ts";
import { foodIn, generateWorld, mulberry32, OPEN_WORLD, reachable, worldFromArrays, type WorldMap } from "../../world.ts";
import { touch } from "../../sense.ts";

/** A bare 40×12 field with two nests, no food. */
function arena(): WorldMap {
  const size = { w: 40, h: 12 };
  const nests = [nestAt(4, 6, 2), nestAt(36, 6, 2)];
  return worldFromArrays(size, nests);
}

/** Put `count` living ants of colony c in cell (x, y), and kill the rest. */
function crowd(c: Colony, x: number, y: number, count: number): void {
  for (let i = 0; i < c.n; i++) {
    c.alive[i] = i < count ? 1 : 0;
    put(c, i, x, y);
  }
}

const sit = (s: Partial<Situation>): Situation => ({
  mode: "explore",
  tired: false,
  foodTrail: "none",
  homeTrail: "none",
  alarm: "none",
  enemy: "none",
  stance: "forage",
  ...s,
});
const view = (s: Partial<StanceSituation>): StanceSituation => ({
  stance: "forage",
  ants: "some",
  losses: "none",
  enemyNearNest: false,
  intake: "some",
  larder: "low",
  ...s,
});

test("generateWorld: two nests, a walk apart, joined on foot, with food away from both", () => {
  for (let seed = 1; seed <= 15; seed++) {
    const m = generateWorld(seed, OPEN_WORLD);
    assert.equal(m.nests.length, 2);
    assert.equal(m.nest, m.nests[0]);
    const [a, b] = m.nests as [WorldMap["nest"], WorldMap["nest"]];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(d >= 0.7 * 140 && d < 260, `seed ${seed}: nests ${d.toFixed(0)} cells apart`);
    const reach = reachable(m, a.x, a.y);
    cellOf(b.x, b.y);
    assert.equal(reach[CELL[1] * m.size.w + CELL[0]], 1, `seed ${seed}: the rival nest cannot be walked to`);
  }
});

test("localPolicy: enemies near are the contact response's (MR 4); raids take explorers, not followers; defence answers alarm; a fight over sends the ant home", () => {
  assert.equal(
    localPolicy(sit({ enemy: "near", tired: true })),
    "return",
    "an enemy near is no mode question any more: tired, it goes home",
  );
  assert.equal(localPolicy(sit({ stance: "raid", mode: "explore" })), "fight");
  assert.equal(localPolicy(sit({ stance: "raid", mode: "follow", foodTrail: "strong" })), "follow");
  assert.equal(localPolicy(sit({ stance: "defend", alarm: "faint" })), "fight");
  assert.equal(localPolicy(sit({ stance: "forage", alarm: "strong", mode: "explore" })), "explore", "foragers leave alarm to steering");
  assert.equal(localPolicy(sit({ mode: "fight" })), "return");
});

test("localStance: defend a nest under attack, raid when food is scarce or the colony is full and fed, else forage", () => {
  assert.equal(localStance(view({ enemyNearNest: true, losses: "some" })), "defend");
  assert.equal(localStance(view({ enemyNearNest: true })), "forage", "an enemy passing by is not an attack");
  assert.equal(localStance(view({ intake: "none" })), "raid");
  assert.equal(localStance(view({ intake: "none", ants: "few" })), "forage", "too few to raid");
  assert.equal(localStance(view({ larder: "full", ants: "many" })), "raid");
  assert.equal(localStance(view({})), "forage");
});

test("fights: equal numbers trade; the bigger crowd loses fewer; fighters lay alarm in their own field", () => {
  let evenA = 0;
  let evenB = 0;
  let smallLost = 0;
  let bigLost = 0;
  for (let round = 0; round < 40; round++) {
    const m = arena();
    const a = new Colony(m, { antCount: 20, maxAnts: 20, nest: 0 }, mulberry32(round));
    const b = new Colony(m, { antCount: 20, maxAnts: 20, nest: 1 }, mulberry32(round + 1000));
    crowd(a, 20, 6, 10);
    crowd(b, 20, 6, 10);
    const grids = [occupancy(a, new CountGrid()), occupancy(b, new CountGrid())];
    const [da, db] = resolveFights([a, b], grids, 0.2, mulberry32(round + 7));
    evenA += da!;
    evenB += db!;
    if (round === 0)
      assert.ok(a.ph.read("alarm", at(20, 6).x, at(20, 6).y) > 0 && b.ph.read("alarm", at(20, 6).x, at(20, 6).y) > 0, "both laid alarm");

    const small = new Colony(m, { antCount: 20, maxAnts: 20, nest: 0 }, mulberry32(round + 2));
    const big = new Colony(m, { antCount: 20, maxAnts: 20, nest: 1 }, mulberry32(round + 3));
    crowd(small, 20, 6, 4);
    crowd(big, 20, 6, 16);
    const g2 = [occupancy(small, new CountGrid()), occupancy(big, new CountGrid())];
    const [ds, dbig] = resolveFights([small, big], g2, 0.2, mulberry32(round + 9));
    smallLost += ds! / 4;
    bigLost += dbig! / 16;
  }
  assert.ok(evenA > 0 && evenB > 0);
  assert.ok(Math.abs(evenA - evenB) < 0.5 * Math.max(evenA, evenB), `even fight: ${evenA} vs ${evenB}`);
  assert.ok(smallLost > 3 * bigLost, `outnumbered lose a bigger share: ${smallLost.toFixed(2)} vs ${bigLost.toFixed(2)}`);
});

test("no enemy within a cell: no fight", () => {
  const m = arena();
  const a = new Colony(m, { antCount: 5, maxAnts: 5, nest: 0 }, mulberry32(1));
  const b = new Colony(m, { antCount: 5, maxAnts: 5, nest: 1 }, mulberry32(2));
  crowd(a, 5, 6, 5);
  crowd(b, 30, 6, 5);
  const deaths = resolveFights([a, b], [occupancy(a, new CountGrid()), occupancy(b, new CountGrid())], 1, () => 0);
  assert.deepEqual(deaths, [0, 0]);
});

test("kill drops carried food where the ant falls; the larder becomes ants in free slots, up to the cap", () => {
  const m = arena();
  const c = new Colony(m, { antCount: 3, maxAnts: 4, nest: 0, foodPerAnt: 4 }, mulberry32(3), () => "explore");
  c.carrying[0] = 1;
  put(c, 0, 10, 3);
  c.kill(0);
  assert.equal(foodIn(m, 10, 3), 1);
  assert.equal(m.foodLeft, 1, "the map counts the dropped food");
  assert.equal(c.population, 2);
  assert.equal(c.losses, 1);
  c.larder = 13;
  c.tick(1 / 30);
  assert.equal(c.population, 4, "two new ants (8 food), the cap");
  assert.equal(c.larder, 5, "the rest waits");
  assert.equal(c.births, 2);
  assert.equal(c.alive[0], 1, "a dead slot was reused");
});

test("a fighting ant goes for the enemy it can see", () => {
  const m = arena();
  const c = new Colony(m, { antCount: 1, maxAnts: 1, wander: 0, deposit: 0 }, mulberry32(4), () => "fight");
  const enemies = new CountGrid();
  enemies.add(20, 8, 3); // two rows south of the ant
  c.enemies = enemies;
  put(c, 0, 20, 6);
  c.heading[0] = 0; // east
  for (let k = 0; k < 15; k++) c.tick(1 / 30);
  assert.ok(c.y[0] > at(20, 6).y + 0.3, `it turned south toward the enemy: y ${c.y[0]}`);
});

test("the game: both colonies forage and grow, they meet and fight, no strategist on open ground, and food is never made or lost", () => {
  const map = generateWorld(1, OPEN_WORLD);
  const g = new Game(map, { antCount: 300, rivalAnts: 300 }, mulberry32(11));
  for (let k = 0; k < 30 * 150; k++) g.tick(1 / 30);
  const [you, rival] = g.colonies as [Colony, Colony];
  assert.ok(you.stored > 100 && rival.stored > 50, `stored ${you.stored} / ${rival.stored}`);
  assert.ok(you.births > 0 && rival.births > 0, "both grew");
  assert.ok(you.losses + rival.losses > 0, "they fought");
  assert.equal(g.strategyChoices, 0, "on open ground each ant's stance is its own (docs/stance.md): no colony stance is chosen");
  let carried = 0;
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) carried += c.alive[i]! && c.carrying[i]! ? 1 : 0;
  assert.equal(Math.round(you.foodLeft + you.stored + rival.stored + carried), map.foodTotal, "food is conserved");
  assert.ok(["playing", "unified", "fallen"].includes(g.outcome()));
});

test("the outcome: a colony with no ants and too little food for one more is beaten", () => {
  const g = new Game(generateWorld(2, OPEN_WORLD), { antCount: 10, rivalAnts: 10 }, mulberry32(5));
  // The player is the fungus (docs/fungus-policy.md §9): a colony beaten is a loss for it, whichever colony.
  for (let i = 0; i < g.rival!.n; i++) g.rival!.kill(i);
  assert.equal(g.outcome(), "fallen");
  assert.equal(g.fallen(), 1);
  g.rival!.larder = 4;
  assert.equal(g.outcome(), "playing", "it can still raise an ant");
  for (let i = 0; i < g.player.n; i++) g.player.kill(i);
  assert.equal(g.outcome(), "fallen");
  assert.equal(g.fallen(), 0);
});

test("contact (behaviour MR 4): a foraging ant meeting strangers runs straight away from them, not just home", () => {
  // The strangers stand between the ant and its nest (to the west): homing alone would walk it into them.
  const m = arena();
  const c = new Colony(m, { antCount: 1, maxAnts: 1, wander: 0, deposit: 0 }, mulberry32(4), () => "explore");
  const enemies = new CountGrid();
  enemies.add(18, 6, 3); // two cells west of the ant, on its line home
  c.enemies = enemies;
  put(c, 0, 20, 6);
  c.heading[0] = Math.PI; // west, toward them
  c.tick(1 / 30);
  assert.equal(c.mode[0], 2, "fleeing (return) while they are in reach");
  for (let k = 0; k < 14; k++) c.tick(1 / 30);
  assert.ok(c.x[0] > at(20, 6).x + 0.3, `it ran east, away from them and from home: x ${c.x[0]}`);
});

test("graded alarm (behaviour MR 4): a faint alarm draws a top-down explorer toward it", () => {
  const run = (amount: number) => {
    const m = arena();
    const c = new Colony(m, { antCount: 1, maxAnts: 1, wander: 0, deposit: 0 }, mulberry32(4), () => "explore");
    put(c, 0, 20, 6);
    c.heading[0] = 0; // east
    const p = at(22, 8);
    c.paint("alarm", p.x, p.y, 1, amount); // ahead and to the south
    for (let k = 0; k < 15; k++) c.tick(1 / 30);
    return c.y[0];
  };
  const y0 = at(20, 6).y;
  assert.ok(run(0.3) > y0 + 0.2, "faint: drawn south, toward it");
  assert.ok(run(12) < y0 - 0.2, "strong: turned north, away");
});

test("raids by trail (behaviour MR 5.2): a scout that meets strangers outside goes home laying the raid trail", () => {
  const run = (raidGate: number) => {
    const g = new Game(arena(), { antCount: 6, rivalAnts: 6 }, mulberry32(5), { stance: () => "raid", colony: { raidGate } });
    const [a, b] = g.colonies as [Colony, Colony];
    for (let i = 0; i < a.n; i++) {
      a.alive[i] = i < 1 ? 1 : 0;
      b.alive[i] = i === 0 ? 1 : 0;
    }
    // Ant 0 is out on the field beside a stranger, on a scout's errand.
    g.tick(1 / 30); // the strategist's first answer sets the stance
    put(a, 0, 20, 6);
    put(b, 0, 20, 6);
    a.recruited[0] = 1;
    let reported = 0;
    for (let k = 0; k < 30; k++) {
      if (!a.reporting[0]) put(a, 0, 20, 6); // it stays beside the stranger until it has met it long enough
      put(b, 0, 20, 6);
      b.alive[0] = 1; // the stranger stays (the fight would kill it)
      g.tick(1 / 30);
      if (a.reporting[0]) reported++;
    }
    return { reported, live: a.ph.live("raid") };
  };
  const trail = run(1);
  assert.ok(trail.reported > 0 && trail.live, "a finder turned for home and laid the raid trail");
  const old = run(0);
  assert.equal(old.reported, 0, "raidGate 0: no finders");
  assert.ok(!old.live, "raidGate 0: no trail");
});

test("raids by trail (review of #41): a raider with no enemy near climbs the raid trail; a finder is not made on the trail", () => {
  // One raider out on an open field, a raid gradient rising to the east, and nothing else: it walks up the gradient.
  const m = arena();
  const c = new Colony(m, { antCount: 1, maxAnts: 1, nest: 0, stanceGate: 0 }, mulberry32(4)); // a raid stance told to every ant: the climb alone
  c.stance = "raid";
  for (let y = 1; y <= 10; y++)
    for (let x = 8; x <= 38; x++) {
      const p = at(x, y);
      c.ph.deposit("raid", p.x, p.y, 0.1 * (x - 6));
    }
  put(c, 0, 14, 6);
  c.heading[0] = Math.PI; // facing away from it
  const x0 = c.x[0];
  for (let k = 0; k < 120; k++) c.tick(1 / 30);
  assert.ok(c.x[0] > x0 + 6, `climbed east: ${x0.toFixed(1)} → ${c.x[0].toFixed(1)}`);

  // A stranger beside a raider that stands on a raid trail is fought, not reported: the trail is where a scout was before.
  const g = new Game(arena(), { antCount: 6, rivalAnts: 6 }, mulberry32(5), { stance: () => "raid" });
  const [a, b] = g.colonies as [Colony, Colony];
  for (let i = 0; i < a.n; i++) {
    a.alive[i] = i === 0 ? 1 : 0;
    b.alive[i] = i === 0 ? 1 : 0;
  }
  put(a, 0, 20, 6);
  put(b, 0, 20, 6);
  const here = at(20, 6);
  let reported = 0;
  for (let k = 0; k < 90; k++) {
    a.ph.deposit("raid", here.x, here.y, 1);
    put(b, 0, 20, 6);
    g.tick(1 / 30);
    if (a.reporting[0]) reported++;
  }
  assert.equal(reported, 0, "no finder on a raid trail");
});

test("raids by trail (ja-sf1): a raider that finds nothing stronger ahead on the raid trail searches on; with raidOnward 0 it mills at the end", () => {
  // A wide raid gradient rising east from x 8 and ending at x 20, where a scout met strangers; the field goes on to the east.
  // The share of 30 s each of five raiders spends well past the end.
  const past = (raidOnward: number) => {
    let s = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const c = new Colony(
        worldFromArrays({ w: 60, h: 20 }, [nestAt(4, 10, 2), nestAt(56, 10, 2)]),
        { antCount: 1, maxAnts: 1, nest: 0, raidScout: 0, raidOnward, stanceGate: 0 },
        mulberry32(seed),
      );
      c.stance = "raid";
      put(c, 0, 12, 10);
      c.heading[0] = 0; // facing east, up the trail
      for (let k = 0; k < 30 * 30; k++) {
        if (k % 30 === 0)
          for (let y = 1; y <= 18; y++)
            for (let x = 8; x <= 20; x++) {
              const p = at(x, y);
              c.ph.deposit("raid", p.x, p.y, 0.1 * (x - 6)); // kept fresh: the end stays where it is
            }
        c.tick(1 / 30);
        if (c.x[0] > at(26, 10).x) s += 1 / (30 * 30);
      }
    }
    return s;
  };
  const mills = past(0);
  const on = past(1);
  assert.ok(mills < 0.05, `raidOnward 0: it stays at the trail's end (${mills.toFixed(2)} raider-runs past it)`);
  assert.ok(on > 0.5, `raidOnward 1: past the end it searches on (${on.toFixed(2)} raider-runs past it)`);

  // Home again, it is done with that trail end (review of #44, N2): its flag clears, even with a raid trail at home keeping it
  // recruited (else it would never climb a trail again).
  const c = new Colony(
    worldFromArrays({ w: 60, h: 20 }, [nestAt(4, 10, 2), nestAt(56, 10, 2)]),
    { antCount: 1, maxAnts: 1, nest: 0, raidScout: 0, stanceGate: 0 },
    mulberry32(1),
  );
  c.stance = "raid";
  const pastEnd = () => c.pastEnd[0];
  const lay = () => {
    for (let y = 1; y <= 18; y++)
      for (let x = 1; x <= 20; x++) {
        const p = at(x, y);
        c.ph.deposit("raid", p.x, p.y, 0.1 * (x + 2));
      }
  };
  lay();
  put(c, 0, 12, 10);
  c.heading[0] = 0; // up the trail, to its end
  for (let k = 0; k < 30 * 3 && pastEnd() === 0; k++) c.tick(1 / 30);
  assert.equal(pastEnd(), 1, "past the end");
  lay();
  put(c, 0, 4, 10); // home, on the trail
  c.tick(1 / 30);
  assert.equal(c.recruited[0], 1, "still recruited: a trail at home");
  assert.equal(pastEnd(), 0, "home clears it");
});

test("each ant's own stance (docs/stance.md): alarm near home makes it defend, the same far out doesn't; 'raid' makes a scout; a crowded home is felt", () => {
  // Alarm round one ant, kept up for 2 s: on home ground (within homeGround of its nest) it defends; 30 cells out it forages.
  // Home ground by sight of its hole, else by its vector (ja-k4k.6.2): `off` cells of error put the hole it would defend that far east.
  const threatened = (cx: number, off = 0) => {
    const c = new Colony(arena(), { antCount: 1, maxAnts: 1, nest: 0, wander: 0 }, mulberry32(13), () => "return");
    c.odoSurf[0] = off;
    c.driftSurf[0] = off > 0 ? 1 : 0;
    put(c, 0, cx, 6);
    for (let k = 0; k < 60; k++) {
      put(c, 0, cx, 6);
      c.paint("alarm", c.x[0], c.y[0], 4, 2);
      c.tick(1 / 30);
    }
    return touch(c, 0, false).stance;
  };
  assert.equal(threatened(8), "defend", "near home");
  assert.equal(threatened(34), "forage", "far out");
  // By sight where it sees its hole, else by its vector (ja-k4k.6.2, review of #180 S1).
  assert.equal(threatened(8, 30), "defend", "it sees its hole: its vector doesn't matter");
  assert.equal(threatened(11, 30), "defend", "7 cells off, it sees its hole down a clear line (NEST_SIGHT)");
  assert.equal(threatened(13, 0), "defend", "out of sight, inside home ground by its vector");
  assert.equal(threatened(13, 30), "forage", "out of sight, its vector says home is 30 cells off");
  // The colony's own stance is not read: a defend broadcast makes no one defend (review of #53, N2).
  const b = new Colony(arena(), { antCount: 1, maxAnts: 1, nest: 0 }, mulberry32(14));
  b.stance = "defend";
  put(b, 0, 20, 6);
  b.tick(1 / 30);
  assert.equal(touch(b, 0, false).stance, "forage");

  // A waiting forager whose leave answer is "raid" goes out as a raid scout.
  const r = new Colony(arena(), { antCount: 1, maxAnts: 1, nest: 0, scoutRate: 0, raidScout: 10 }, mulberry32(15));
  r.responses = responses({ leave: () => "raid" });
  put(r, 0, 4, 6);
  r.mode[0] = MODES.indexOf("return");
  for (let k = 0; k < 30 * 30 && r.recruited[0] === 0; k++) r.tick(1 / 30);
  assert.equal(r.recruited[0], 1, "recruited by its own answer");
  assert.equal(touch(r, 0, false).stance, "raid");

  // Twenty ants waiting at home: each feels the others round it.
  const g = new Game(arena(), { antCount: 20, rivalAnts: 1 }, mulberry32(16), {
    policy: () => "return",
    responses: responses({ leave: () => "wait" }),
    colony: { scoutRate: 0, crowdAt: 6 },
  });
  const c = g.player;
  for (let i = 0; i < 20; i++) put(c, i, 4, 6);
  for (let k = 0; k < 30 * 10; k++) g.tick(1 / 30);
  assert.ok(c.crowd[0] >= c.params.crowdAt, `crowded: ${c.crowd[0].toFixed(1)} nestmates felt`);
  assert.equal(touch(c, 0, false).crowd, "many");
});

test("raid trail recruitment (docs/stance.md, review of #53 S2): only ants at home, by degrees, never while carrying", () => {
  // 40 ants at home on a strong raid trail, 40 out on one 30 cells away; recruited at raidRecruit (0.5/s here) for 1 s.
  const g = new Game(
    worldFromArrays({ w: 60, h: 20 }, [nestAt(6, 10, 3), nestAt(56, 10, 3)]),
    { antCount: 80, rivalAnts: 5 },
    mulberry32(21),
    { policy: () => "return", responses: responses({ leave: () => "wait" }), colony: { raidRecruit: 0.5, scoutRate: 0, raidScout: 0 } },
  );
  const c = g.player;
  const home = (i: number) => i < 40;
  const place = () => {
    for (let i = 0; i < 80; i++) put(c, i, home(i) ? 6 : 36, 10);
    for (const x of [6, 36])
      for (let dx = -3; dx <= 3; dx++)
        for (let y = 6; y <= 14; y++) {
          const p = at(x + dx, y);
          c.ph.deposit("raid", p.x, p.y, 2 - Math.max(0, c.ph.read("raid", p.x, p.y))); // held at strong
        }
  };
  c.carrying[0] = 1; // a carrier at home: never recruited
  for (let k = 0; k < 30; k++) {
    place();
    g.tick(1 / 30);
  }
  let atHome = 0;
  let out = 0;
  for (let i = 1; i < 80; i++) {
    if (home(i)) atHome += c.recruited[i];
    else out += c.recruited[i];
  }
  assert.equal(out, 0, "not out at its work");
  assert.equal(c.recruited[0], 0, "not while carrying");
  // 39 at home over 1 s at 0.5/s: 1 − e^−0.5 ≈ 39 % expected (15); all at once would be 39.
  assert.ok(atHome >= 6 && atHome <= 26, `by degrees: ${atHome} of 39 at home recruited in 1 s`);
});

test("no rival, no raid (review of #53 S1): with the rival beaten, a crowded home's raid answer and a raid trail recruit no one", () => {
  const g = new Game(arena(), { antCount: 20, rivalAnts: 5 }, mulberry32(22), {
    policy: () => "return",
    colony: { scoutRate: 0, crowdAt: 2, raidScout: 5, raidRecruit: 5 },
  });
  const [c, r] = g.colonies as [Colony, Colony];
  for (let i = 0; i < r.n; i++) r.alive[i] = 0;
  r.larder = 0;
  for (let i = 0; i < 20; i++) put(c, i, 4, 6);
  for (let k = 0; k < 30 * 8; k++) {
    for (let y = 4; y <= 8; y++) for (let x = 2; x <= 6; x++) c.ph.deposit("raid", at(x, y).x, at(x, y).y, 0.05);
    g.tick(1 / 30);
  }
  let rec = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i]) rec += c.recruited[i];
  assert.equal(c.raidable, false, "the game found no rival");
  assert.equal(rec, 0, "nobody raids");
});

test("raid stance as a bias (behaviour MR 5.2): an ant with no trail carries on as a forager, a trail or a scout's errand makes it a raider, and it is a forager again once home", () => {
  const colony = (raidScout: number) => {
    const c = new Colony(arena(), { antCount: 1, maxAnts: 1, nest: 0, raidScout, stanceGate: 0 }, mulberry32(8)); // the colony's stance, as on the side view
    c.stance = "raid";
    put(c, 0, 4, 6);
    return c;
  };
  // No trail, no errand: it acts on forage, however long the colony raids.
  const c = colony(0);
  for (let k = 0; k < 30 * 20; k++) c.tick(1 / 30);
  assert.equal(touch(c, 0, false).stance, "forage", "a raid stance idles no one");
  // A scout's trail under it recruits it.
  const t = colony(0);
  for (let y = 4; y <= 8; y++) for (let x = 2; x <= 6; x++) t.ph.deposit("raid", at(x, y).x, at(x, y).y, 1);
  t.tick(1 / 30);
  assert.equal(touch(t, 0, false).stance, "raid", "a trail recruits it");
  // A scout (raidScout huge: it goes at once) is out as a raider, and a forager again when it comes home without a trail.
  const sc = colony(1000);
  sc.tick(1 / 30);
  assert.equal(touch(sc, 0, false).stance, "raid", "a scout acts on the raid");
  assert.equal(sc.recruited[0], 1);
  put(sc, 0, 20, 6); // away
  sc.tick(1 / 30);
  put(sc, 0, 4, 6); // and home again
  sc.params.raidScout = 0;
  sc.tick(1 / 30);
  assert.equal(touch(sc, 0, false).stance, "forage", "home with no trail: its raid is over");
});

test("raid stance as a bias (review of #41): an ant not recruited, put in FIGHT, does not walk to the rival hole's coordinates", () => {
  const run = (raidGate: number) => {
    const m = arena();
    const c = new Colony(m, { antCount: 1, maxAnts: 1, nest: 0, raidGate, raidScout: 0 }, mulberry32(9), () => "fight");
    c.stance = "raid";
    c.raidTarget = nestAt(36, 6, 2);
    put(c, 0, 12, 6);
    c.heading[0] = Math.PI / 2; // facing across the field, not at the rival
    for (let k = 0; k < 60; k++) c.tick(1 / 30);
    return Math.hypot(c.x[0] - c.raidTarget.x, c.y[0] - c.raidTarget.y);
  };
  const off = run(0); // the old rule: straight at the coordinates
  const on = run(1);
  assert.ok(
    on > off + 4,
    `not recruited, it doesn't head for the hole: ${on.toFixed(1)} cells off against ${off.toFixed(1)} with raidGate 0`,
  );
});

test("raid stance as a bias (review of #41): leave asks a recruited ant as a raider (fight) and the others as foragers (return)", () => {
  const asked = (recruited: boolean) => {
    const c = new Colony(arena(), { antCount: 1, maxAnts: 1, nest: 0, raidScout: 0 }, mulberry32(10));
    const modes = new Set<string>();
    c.responses = { ...localResponses, leave: (t) => (modes.add(t.mode), "wait") };
    c.stance = "raid";
    put(c, 0, 4, 6);
    c.mode[0] = 2; // return
    if (recruited) c.recruited[0] = 1;
    for (let k = 0; k < 30 * 15; k++) c.tick(1 / 30);
    return [...modes];
  };
  assert.deepEqual(asked(true), ["fight"]);
  assert.deepEqual(asked(false), ["return"]);
});
