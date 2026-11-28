import { test } from "node:test";
import assert from "node:assert/strict";
import { freshReach, inReach, inReachShared, inReachSharedCells } from "../../grid.ts";
import { mulberry32, OPEN, ROCK, SOIL, worldFromArrays } from "../../world.ts";
import { nestAt } from "../hexmaps.ts";
import { CHUNK_BITS } from "../../chunks.ts";

// ja-lp4.6.7: the sensors' shared search (one search of the window round the ant, by rows of bits) must answer exactly as
// inReach's own queue does, for every sensor, on every kind of ground, by the map's edges and under one world's surface rows.

test("inReachShared answers as inReach: random ground, random tips, by the edges (a map's first column negative too) and under surface rows", () => {
  const rng = mulberry32(7);
  let asked = 0;
  let open = 0;
  for (let m = 0; m < 60; m++) {
    const w = 14 + Math.floor(rng() * 20);
    const h = 12 + Math.floor(rng() * 16);
    const share = 0.35 + rng() * 0.5;
    const rock = new Uint8Array(w * h);
    for (let k = 0; k < rock.length; k++) rock[k] = rng() < share ? OPEN : rng() < 0.8 ? SOIL : ROCK;
    // Half the maps start at a negative column, as one world's curtain does (map.x0; review of #214, S1).
    const off = m % 2 === 1 ? -1 - Math.floor(rng() * 40) : 0;
    const map = worldFromArrays({ w, h }, [nestAt(off + 1, 1, 1)], { rock, food: new Float32Array(w * h), x0: off });
    if (m % 3 === 0) map.surfaceRows = 1 + Math.floor(rng() * 4);
    // Cells of the map's chunks that lie off the map read as rock to rockAt whatever they hold; open them on these maps, so
    // the window's clip to the map (x0 to x0 + w - 1) is what keeps them out (review of #214, S1).
    if (off !== 0)
      for (let cy = 0; cy <= (h - 1) >> CHUNK_BITS; cy++)
        for (let cx = off >> CHUNK_BITS; cx <= (off + w - 1) >> CHUNK_BITS; cx++) {
          const a = map.rock.chunk(cx, cy) as Uint8Array;
          for (let k = 0; k < a.length; k++) {
            const x = (cx << CHUNK_BITS) + (k & ((1 << CHUNK_BITS) - 1));
            const y = (cy << CHUNK_BITS) + (k >> CHUNK_BITS);
            if (x < off || x >= off + w || y >= h) a[k] = OPEN;
          }
        }
    for (let ant = 0; ant < 200; ant++) {
      const x0 = off + rng() * w;
      const y0 = rng() * h * (Math.sqrt(3) / 2);
      freshReach();
      for (let s = 0; s < 3; s++) {
        const a = rng() * 2 * Math.PI;
        const d = 1 + rng() * 5;
        const x1 = x0 + Math.cos(a) * d;
        const y1 = y0 + Math.sin(a) * d;
        const want = inReach(map, x0, y0, x1, y1);
        assert.equal(inReachShared(map, x0, y0, x1, y1), want, `map ${m}, (${x0}, ${y0}) to (${x1}, ${y1})`);
        asked++;
        if (want) open++;
      }
    }
  }
  assert.ok(open > asked / 5 && open < asked, `both answers met: ${open} of ${asked} reachable`);
});

test("a reused origin sees a detour open and close after terrain edits", () => {
  const w = 16;
  const map = worldFromArrays({ w, h: 16 }, [], { rock: new Uint8Array(w * 16).fill(SOIL), food: new Float32Array(w * 16) });
  for (const [x, y] of [
    [4, 8],
    [6, 8],
    [4, 9],
  ])
    map.rock.set(x!, y!, OPEN);
  const canReach = () => {
    freshReach();
    return inReachSharedCells(map, 4, 8, 6, 8);
  };
  assert.equal(canReach(), false);
  map.rock.set(5, 9, OPEN);
  assert.equal(canReach(), true);
  // Raw chunk edits also invalidate the window, even without a soil change counter.
  map.rock.chunk(0, 0)![9 * 64 + 5] = ROCK;
  assert.equal(canReach(), false);
});
