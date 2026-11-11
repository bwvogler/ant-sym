// The long games of mound.test.ts (split out so no file nears the 60 s per-file limit on CI, ja-6mj); the quick tests are in mound.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SWELL } from "../../colony.ts";
import { Game } from "../../game.ts";
import { CELL, cellOf, nx, ny } from "../../hex.ts";
import { generateSideWorld, isSky, mulberry32, OPEN, reachable, rockAt, SOIL } from "../../world.ts";

// The mound above ground (MR 14): pellets brought out become loose soil heaped as a sandpile round the hole.

test("in a game: soil is carried out and dropped along the ground, loose soil is spread and taken down to backfill, every pellet is accounted for, nobody is buried, the way in stays open", () => {
  const map = generateSideWorld(2, { size: { w: 320, h: 200 }, nestCount: 1 });
  const g = new Game(map, { antCount: 300 }, mulberry32(7));
  const c = g.player;
  const solidT = new Float32Array(c.n);
  let maxSolid = 0;
  // 500 s: nothing dug in the last BACKFILL.young (200 s) is filled, so loose soil taken down first finds room after that,
  // and only slowly: by 300 s this game had put back 8 loose pellets on #17 and none on the nest stack (whose tunnel walker
  // steers stalled carriers to the entrance), by 500 s 45 and 35 (games 7–9 at 500 s: 12–48 on #17, 2–43 here).
  for (let k = 0; k < 30 * 500; k++) {
    g.tick(1 / 30);
    // Nobody is buried: an ant in a cell spoil was heaped on climbs out at once.
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      c.antCell(i);
      solidT[i] = rockAt(map, CELL[0] as number, CELL[1] as number) === OPEN ? 0 : solidT[i]! + 1 / 30;
      maxSolid = Math.max(maxSolid, solidT[i]!);
    }
    if (k % 300 === 0) {
      let loose = 0;
      for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) loose += map.loose!.get(x, y) && rockAt(map, x, y) === SOIL ? 1 : 0;
      const carried = c.carriedPellets();
      assert.equal(loose, map.moundCells, "the mound on the map is its count");
      assert.equal(c.soilDug, c.soilOut + c.soilFilled + carried.dug + c.soilLost, "dug = brought out + filled + carried + lost");
      assert.equal(c.loosePicked, c.looseDropped + c.looseFilled + carried.loose + c.looseLost, "loose picked up = dropped again + filled + carried + lost");
      assert.equal(map.moundCells, Math.floor(c.soilOut * SWELL + 1e-9) - c.moundLost - c.loosePicked + c.looseDropped, "the mound = soil brought out × SWELL, less what was taken off it, plus what was put back");
    }
  }
  assert.ok(c.soilOut > 50, `${c.soilOut} pellets brought out`);
  assert.equal(c.moundLost, 0);
  assert.ok(c.looseDropped > 0 && c.looseFilled > 0, `loose soil spread (${c.looseDropped}) and taken down to backfill (${c.looseFilled})`);
  assert.ok(maxSolid < 0.2, `longest any ant stood in solid ground: ${maxSolid.toFixed(2)} s`);
  // The way in: the chamber reaches the hole, and the hole the ground line.
  const walk = reachable(map, c.nest.x, c.nest.y, "open");
  cellOf(c.nest.entrance!.x, c.nest.entrance!.y);
  const hx = CELL[0] as number;
  const hy = CELL[1] as number;
  assert.equal(walk[hy * map.size.w + hx], 1, "the chamber reaches the hole");
  let out = false;
  for (let d = 0; d < 6; d++) out ||= isSky(map, nx(hx, hy, d), ny(hy, d)) && rockAt(map, nx(hx, hy, d), ny(hy, d)) === OPEN;
  assert.ok(out, "the hole opens onto the ground line");
  // The crust holds: no open ground under the ground line beside the walkway, away from the hole (no new holes).
  let holes = 0;
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++) {
      if (rockAt(map, x, y) !== OPEN || isSky(map, x, y) || Math.abs(x - hx) <= 4) continue;
      for (let d = 0; d < 6; d++) if (isSky(map, nx(x, y, d), ny(y, d)) && rockAt(map, nx(x, y, d), ny(y, d)) === OPEN) holes++;
    }
  assert.equal(holes, 0, "no holes from the tunnels onto the ground line but the entrance");
});
