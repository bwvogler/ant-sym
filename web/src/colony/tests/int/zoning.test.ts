import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, CURTAIN, LIFESPAN, MIDDLE, PLANE, YOUNG } from "../../colony.ts";
import { CountGrid } from "../../battle.ts";
import { Game } from "../../game.ts";
import { responses } from "../../responses.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { digCell, isSky, mulberry32, OPEN, rockAt } from "../../world.ts";
import { curtainHole, oneColony, own, smallOne } from "../builders.ts";

// Nest slice 6 (docs/nest-and-home.md §3.5, Tschinkel): who works where goes by age. The young nurse, deep with the
// queen and brood, and never go out; the middle-aged dig and carry inside; the old forage. On one world: inside is the curtain, out
// is the plane (S2.3c).

function aged(c: Colony, share: number): void {
  for (let i = 0; i < c.n; i++) {
    c.age[i] = share * LIFESPAN;
    c.lifespan[i] = Infinity;
  }
}

test("bands: by age", () => {
  const { c } = oneColony(5);
  c.age[0] = 0;
  c.age[1] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
  c.age[2] = (MIDDLE + 0.1) * LIFESPAN;
  assert.deepEqual([c.band(0), c.band(1), c.band(2)], [0, 1, 2]);
});

/** The share of an age's ants, not carrying, out on the plane over 90 s (sampled each second); each age's game played once. */
const shares = new Map<number, number>();
const outShare = (share: number): number => {
  const known = shares.get(share);
  if (known !== undefined) return known;
  const g = new Game(smallOne(2), { antCount: 120, rival: false }, mulberry32(3));
  aged(g.player, share);
  let out = 0;
  let n = 0;
  for (let k = 0; k < 30 * 90; k++) {
    g.tick(1 / 30);
    if (k % 30 !== 0) continue;
    const c = g.player;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || c.carrying[i] || c.pellet[i]) continue;
      n++;
      if (c.layer[i] === PLANE) out++;
    }
  }
  shares.set(share, out / n);
  return out / n;
};

test("the old go out (the old climb out to forage)", () => {
  // That the young never go out is int/oneWorldGame's "the young never go out…".
  const old = outShare(MIDDLE + 0.1);
  assert.ok(old > 0.1, `the old forage: ${(old * 100).toFixed(0)} % out`);
});

test(
  "the middle-aged go out less than the old",
  { todo: "ja-zamh: on one world the middle-aged go out more (seed 3: 66 % vs 52 %)" },
  () => {
    const middle = outShare((YOUNG + MIDDLE) / 2);
    const old = outShare(MIDDLE + 0.1);
    assert.ok(
      middle > 0 && middle < old,
      `the middle-aged go out less than the old: ${(middle * 100).toFixed(0)} % vs ${(old * 100).toFixed(0)} %`,
    );
  },
);

test("the young sit deeper than the old, and only the middle-aged dig", () => {
  const g = new Game(smallOne(2), { antCount: 300, rival: false }, mulberry32(5));
  const c = g.player;
  const hole = curtainHole(own(c));
  // Ages well inside each band, so none crosses into the next in the two minutes (an ant mid-dig as it comes of age finishes).
  for (let i = 0; i < c.n; i++) {
    c.age[i] = [0.02, 0.22, 0.5][i % 3]! * LIFESPAN;
    c.lifespan[i] = Infinity;
  }
  let dugByOthers = 0;
  for (let k = 0; k < 30 * 120; k++) {
    const before = c.soilDug;
    const bandsDigging = new Map<number, number>();
    for (let i = 0; i < c.n; i++) if (c.alive[i] && c.digT[i]! > 0) bandsDigging.set(i, c.band(i));
    g.tick(1 / 30);
    if (c.soilDug > before) for (const [, b] of bandsDigging) if (b !== 1) dugByOthers++;
  }
  assert.equal(dugByOthers, 0, "nobody but the middle-aged was digging");
  const depth = [0, 0, 0];
  const count = [0, 0, 0];
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i]) continue;
    const b = c.band(i);
    depth[b]! += c.layer[i] === CURTAIN ? Math.max(0, c.y[i]! - hole.y) : 0; // on the plane: at the ground, 0 deep
    count[b]!++;
  }
  assert.ok(
    depth[0]! / count[0]! > depth[2]! / count[2]!,
    `young ${(depth[0]! / count[0]!).toFixed(1)} rows deep, old ${(depth[2]! / count[2]!).toFixed(1)}`,
  );
  // …and with the queen: of the ants underground, the young nearer her than the middle-aged (they keep to the royal and
  // brood marks; inside anyway, they'd otherwise wander the nest like anyone).
  const near = [0, 0, 0];
  const inside = [0, 0, 0];
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i] || c.layer[i] !== CURTAIN) continue;
    near[c.band(i)]! += Math.hypot(c.x[i]! - c.queen!.x, c.y[i]! - c.queen!.y);
    inside[c.band(i)]!++;
  }
  assert.ok(
    near[0]! / inside[0]! < near[1]! / inside[1]!,
    `from the queen, underground: young ${(near[0]! / inside[0]!).toFixed(1)}, middle-aged ${(near[1]! / inside[1]!).toFixed(1)}`,
  );
});

test("a young ant in a chamber turns toward the brood's odour, not the queen's position (ja-k4k.15)", () => {
  // One young ant mid-chamber facing up, brood odour under its left antenna, the queen moved to its right: over 100 single ticks
  // it turns left, up the odour. By the queen's position (broodClimb 0, the rule before) it would turn right; with the climb on
  // and no odour it would turn either way alike.
  const w = smallOne(2);
  const royal = w.curtain.chambers!.list.find((k) => k.colony === 0 && k.role === "royal")!;
  const x = centreX(Math.round((royal.x0 + royal.x1) / 2), royal.floorRow - 5);
  const y = centreY(royal.floorRow - 5);
  const turn = (broodClimb: number, odour: number, broodCrowd = 0, here = 1) => {
    let sum = 0;
    const trials = 100;
    for (let t = 0; t < trials; t++) {
      const c = new Colony(
        w.curtain,
        { antCount: 1, maxAnts: 5, broodOdour: 1, broodClimb, broodCrowd },
        mulberry32(t + 1),
        () => "explore",
        {
          plane: w.plane,
          line: w.line,
        },
      );
      c.age[0] = 0.02 * LIFESPAN;
      c.lifespan[0] = Infinity;
      c.x[0] = x;
      c.y[0] = y;
      c.heading[0] = -Math.PI / 2;
      c.queen!.x = x + 6;
      c.queen!.y = y;
      const { sensorDistance: d, sensorAngle: a } = c.params;
      cellOf(x + Math.cos(-Math.PI / 2 - a) * d, y + Math.sin(-Math.PI / 2 - a) * d);
      if (odour > 0) c.layers[CURTAIN]!.ph.fields.broodOdour.set(CELL[0], CELL[1], odour);
      // `here` ants in the ant's own cell, itself included, as the game's friends grid counts.
      const grid = new CountGrid();
      c.friends = grid;
      cellOf(x, y);
      grid.add(CELL[0], CELL[1], here);
      cellOf(x + Math.cos(-Math.PI / 2 - a) * d, y + Math.sin(-Math.PI / 2 - a) * d);
      c.tick(1 / 30);
      sum += c.heading[0]! + Math.PI / 2;
    }
    return sum / trials;
  };
  const toward = turn(1, 50);
  const queen = turn(0, 50);
  const blind = turn(1, 0);
  // Left is a smaller angle (−a from straight ahead).
  assert.ok(toward < -0.005, `toward the odour: ${toward.toFixed(4)} rad a tick`);
  assert.ok(queen > 0.005, `broodClimb 0 turns to the queen instead: ${queen.toFixed(4)}`);
  assert.ok(Math.abs(blind) < 0.005, `no odour, no bias: ${blind.toFixed(4)}`);
  // ja-k4k.15.6: with 6 nestmates already in its cell (7 counting itself) and the limit at 6, it stops climbing; with 5, it still does;
  // the limit off (0) it climbs however many stand there.
  const full = turn(1, 50, 6, 7);
  const room = turn(1, 50, 6, 6);
  const off = turn(1, 50, 0, 40);
  assert.ok(Math.abs(full) < 0.005, `a full cell: no climb ${full.toFixed(4)}`);
  assert.ok(room < -0.005, `one short of full: still climbs ${room.toFixed(4)}`);
  assert.ok(off < -0.005, `no limit: climbs ${off.toFixed(4)}`);
});

test("an old forager in a dead-end tunnel whose tip lies just under the ground by the hole goes back down and out by the shaft (review of #25)", () => {
  // Stepping straight toward the hole, the tip is nearer it than anything round it: old ants don't dig, so the first cut
  // parked them there until their mode changed. They climb out by the way through the tunnels (#climbOut).
  const { map, c } = oneColony(1, {}, () => "explore", 4);
  const n = c.nest;
  cellOf(n.entrance!.x, n.entrance!.y);
  const ex = CELL[0];
  const ey = CELL[1];
  cellOf(n.x, n.y);
  const cy = CELL[1];
  // A branch east out of the chamber's upper side, then straight up, its tip two rows under the ground line beside the hole.
  const tipX = ex + 4;
  let x = CELL[0];
  while (rockAt(map, x, cy - 3) === OPEN) x++;
  for (; x <= tipX; x++) digCell(map, x, cy - 3);
  for (let y = cy - 3; y >= ey + 2; y--) digCell(map, tipX, y);
  assert.ok(!isSky(map, tipX, ey + 1) && rockAt(map, tipX, ey + 1) !== OPEN, "a dead end under the crust");
  c.outDist = null; // the way-out field is built afresh over the dug branch
  c.responses = responses({ leave: () => "now" }); // alone, it would wait at the top of the shaft for company
  aged(c, MIDDLE + 0.2);
  c.putAnt(0, CURTAIN, centreX(tipX, ey + 5), centreY(ey + 5));
  c.heading[0] = -Math.PI / 2;
  let out = -1;
  for (let k = 0; k < 30 * 60 && out < 0; k++) {
    c.tick(1 / 30);
    if (c.layer[0] === PLANE) out = k / 30;
  }
  assert.equal(c.mode[0], 0, "still exploring (a forager on its way out)");
  assert.ok(out >= 0, "out on the ground within a minute");
});
