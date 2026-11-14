import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony.ts";
import { CELL, cellOf, centreX, centreY, hexDistance, nx as stepX, ny as stepY } from "../../hex.ts";
import { EXPLORE, RETURN } from "../../vocab.ts";
import { digCell, generateSideWorld, inBounds, isSky, mulberry32, OPEN, rockAt, type WorldMap } from "../../world.ts";
import { SMALL_SIDE, ageOf } from "../builders.ts";

// restFetch (ja-4rfr): hungry ants who would otherwise sit still or leave go to the stores. On economy.test's map a
// colony starved beside ~500 stored food: the old retire inside in "return", tired, and only explorers fetched, by felt
// need alone, and only in tunnels. Hunger bites only late in an hour-long game, so the slow tier was all that reached it;
// these put the hunger in at once. World 2 of SMALL_SIDE: the hole at cell (109, 39), a shaft down to the royal chamber
// (rows 48 on), the nest's centre at (106, 53).

/**
 * A four-cell store holding 20 food, its floor mark laid as ants coming from it would: strongest there, fading a little a
 * step along every open way. "shaft": off the shaft four rows below the hole. "far": off the royal chamber's far side
 * from the shaft, along the nest's row. "side": at the end of a tunnel six cells long off the shaft seven rows below the
 * hole, off every way home.
 */
function stocked(map: WorldMap, where: "shaft" | "far" | "side") {
  const ch = map.chambers!;
  let sx: number;
  let sy: number;
  let dir: number;
  if (where === "shaft") {
    cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
    sy = CELL[1] + 4;
    sx = CELL[0];
    for (let x = CELL[0] - 3; x <= CELL[0] + 3 && rockAt(map, sx, sy) !== OPEN; x++) sx = x;
    dir = 1;
  } else if (where === "side") {
    cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
    sy = CELL[1] + 7;
    sx = CELL[0];
    for (let x = CELL[0] - 3; x <= CELL[0] + 3 && rockAt(map, sx, sy) !== OPEN; x++) sx = x;
    for (let k = 1; k <= 6; k++) digCell(map, sx - k, sy); // the side tunnel
    sx -= 6;
    dir = -1;
  } else {
    cellOf(map.nest.x, map.nest.y);
    sy = CELL[1];
    sx = CELL[0];
    while (rockAt(map, sx - 1, sy) === OPEN) sx--; // the chamber's far wall
    dir = -1;
  }
  const store = ch.add(0, sy, "store");
  for (let k = 1; k <= 4; k++) {
    digCell(map, sx + dir * k, sy);
    ch.claim(store.id, sx + dir * k, sy, (a, b) => rockAt(map, a, b) === OPEN);
  }
  store.food = 20;
  return { store, cell: [sx + dir * 3, sy] as const, mouth: [sx - dir * 6, sy] as const };
}

/** A colony of `n` ants on world 2 with a store (see stocked), its mark laid, and a fixed policy if one is given. */
function colony(restFetch: number, n: number, where: "shaft" | "far" | "side", policy?: () => string) {
  const map = generateSideWorld(2, SMALL_SIDE);
  const { store, cell, mouth } = stocked(map, where);
  const c = policy
    ? new Colony(map, { antCount: n, maxAnts: n, restFetch }, mulberry32(7), policy as never)
    : new Colony(map, { antCount: n, maxAnts: n, restFetch }, mulberry32(7));
  c.larder += store.food; // the larder is the food in the chambers
  const seen = new Map<number, number>([[cell[0] * 4096 + cell[1], 0]]);
  const queue: [number, number][] = [[cell[0], cell[1]]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const d = seen.get(x * 4096 + y)!;
    c.ph.depositCell("store", x, y, Math.max(0.5, 20 - d * 0.4));
    for (let k = 0; k < 6; k++) {
      const tx = stepX(x, y, k);
      const ty = stepY(y, k);
      if (!inBounds(map, tx, ty) || rockAt(map, tx, ty) !== OPEN || isSky(map, tx, ty) || seen.has(tx * 4096 + ty)) continue;
      if (where === "far" && map.chambers!.at(tx, ty) < 0) continue; // across the chamber only: the shaft smells of none
      seen.set(tx * 4096 + ty, d + 1);
      queue.push([tx, ty]);
    }
  }
  return { c, map, store, cell, mouth };
}

/** Ant i of age band `band`, starving, feeling nothing from others, empty-jawed, in `mode`, at cell (x, y). */
function hungry(c: Colony, i: number, band: 0 | 1 | 2, mode: number, x: number, y: number) {
  c.age[i] = ageOf(band);
  c.x[i] = centreX(x, y);
  c.y[i] = centreY(y);
  c.mode[i] = mode;
  c.carrying[i] = 0;
  c.energy[i] = 0.1;
  c.need[i] = 0;
}

/** Keep the ants starving (draining it is not the test) and step. */
const step = (c: Colony) => {
  for (let i = 0; i < c.n; i++) c.energy[i] = Math.min(c.energy[i], 0.1);
  c.tick(1 / 30);
};

test("restFetch: a starving old explorer in the royal chamber turns toward the store across it by its mark; without it, it heads out at the hole", () => {
  // Its own hunger makes it fetch (fetches), and in the chamber it steers by the store's mark (steer.ts).
  const run = (rf: number) => {
    const { c, map, cell } = colony(rf, 1, "far", () => "explore");
    cellOf(map.nest.x, map.nest.y);
    hungry(c, 0, 2, EXPLORE, CELL[0], CELL[1]); // the nest's centre
    c.heading[0] = -Math.PI / 2; // facing up: its left sensor, toward the store (west), reads more of the mark
    let nearest = Infinity;
    let out = 0;
    for (let t = 0; t < 30 * 20; t++) {
      step(c);
      cellOf(c.x[0], c.y[0]);
      nearest = Math.min(nearest, hexDistance(CELL[0], CELL[1], cell[0], cell[1]));
      if (!c.under[0]) out = 1;
    }
    return { nearest, out };
  };
  const on = run(1);
  const off = run(0);
  // The store's middle cell is 3 from the chamber's edge at its mouth: there or nearer, it came to the store.
  assert.ok(on.nearest <= 3, `with restFetch it came to the store (nearest ${on.nearest} cells from its middle)`);
  assert.ok(off.nearest >= 6, `without it, it never came by the store (nearest ${off.nearest})`);
  assert.equal(off.out, 1, "it went out");
});

test('restFetch: a starving ant in "return" by a store takes food on from it; without it, it carries nothing', () => {
  // In "return" (the policy keeps it there), restFetches lets it port (nestWork.ts): only explorers did.
  const run = (rf: number) => {
    const { c, map, store } = colony(rf, 1, "shaft", () => "return");
    cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
    let [x, y] = [CELL[0], CELL[1] + 7]; // three rows below the store's row: out of eating reach
    for (let dx = -3; dx <= 3 && rockAt(map, x, y) !== OPEN; dx++) x = CELL[0] + dx;
    hungry(c, 0, 1, RETURN, x, y);

    for (let t = 0; t < 30 * 20; t++) {
      step(c);
      if (c.porter[0]) return { porter: 1, food: store.food };
    }
    return { porter: 0, food: store.food };
  };
  const on = run(1);
  const off = run(0);
  assert.equal(on.porter, 1, "with restFetch it took food on from the store");
  assert.ok(on.food < 20, `the store gave it (${on.food} left)`);
  assert.equal(off.porter, 0, "without it, it went home (it may eat in passing, but carries nothing on)");
});

test("restFetch: a tired, starving ant resting at home is got up by its hunger; without it, it rests on", () => {
  // Hunger ends a tired ant's rest (arrive.ts): it is asked afresh as an explorer, here the moment REST is up.
  const run = (rf: number) => {
    const { c, map } = colony(rf, 1, "far");
    cellOf(map.nest.x, map.nest.y);
    hungry(c, 0, 2, RETURN, CELL[0], CELL[1]);
    c.tired[0] = 1;
    c.fatigue[0] = 2 * c.params.patience;
    let up = 0;
    for (let t = 0; t < 30 * 15; t++) {
      const was = c.restT[0];
      step(c);
      if (was > 0 && c.restT[0] === 0 && c.under[0]) up++; // a rest ended (it was got up), not reset by leaving home
    }
    return up;
  };
  assert.ok(run(1) >= 1, "with restFetch its rest ended");
  assert.equal(run(0), 0, "without it, it rested on");
});
