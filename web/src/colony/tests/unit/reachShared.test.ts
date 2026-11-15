import { test } from "node:test";
import assert from "node:assert/strict";
import { freshReach, inReach, inReachShared } from "../../grid.ts";
import { mulberry32, OPEN, ROCK, SOIL, worldFromArrays } from "../../world.ts";
import { nestAt } from "../hexmaps.ts";

// ja-lp4.6.7: the sensors' shared search (one search of the window round the ant, by rows of bits) must answer exactly as
// inReach's own queue does, for every sensor, on every kind of ground, by the map's edges and under one world's surface rows.

test("inReachShared answers as inReach: random ground, random tips, by the edges and under surface rows", () => {
  const rng = mulberry32(7);
  let asked = 0;
  let open = 0;
  for (let m = 0; m < 60; m++) {
    const w = 14 + Math.floor(rng() * 20);
    const h = 12 + Math.floor(rng() * 16);
    const share = 0.35 + rng() * 0.5;
    const rock = new Uint8Array(w * h);
    for (let k = 0; k < rock.length; k++) rock[k] = rng() < share ? OPEN : rng() < 0.8 ? SOIL : ROCK;
    const map = worldFromArrays({ w, h }, [nestAt(1, 1, 1)], { rock, food: new Float32Array(w * h) });
    if (m % 3 === 0) map.surfaceRows = 1 + Math.floor(rng() * 4);
    for (let ant = 0; ant < 200; ant++) {
      const x0 = rng() * w;
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
