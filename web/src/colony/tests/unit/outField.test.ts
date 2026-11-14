import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, type Colony } from "../../colony.ts";
import { Game, gameRng } from "../../game.ts";
import { nx as stepX, ny as stepY } from "../../hex.ts";
import { outDistAt, outField } from "../../homing.ts";
import { isSky, OPEN, rockAt, setRock } from "../../world.ts";
import { smallOne } from "../builders.ts";

// The way-out field over a window of columns round the hole (endless world §7, E1.4): it must read every cell as a walk
// over the whole curtain does, however far the nest's tunnels reach.

/** Steps from each cell of the curtain to the colony's hole through open ground underground: the walk over the whole map. */
function wholeWalk(c: Colony): Map<number, number> {
  const map = c.map;
  const { w, h } = map.size;
  const x0 = map.x0;
  const key = (x: number, y: number) => y * w + x - x0;
  const dist = new Map([[key(c.entranceCol, c.entranceRow), 0]]);
  const queue: [number, number][] = [[c.entranceCol, c.entranceRow]];
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q]!;
    const d = dist.get(key(x, y))! + 1;
    for (let dir = 0; dir < 6; dir++) {
      const tx = stepX(x, y, dir);
      const ty = stepY(y, dir);
      if (tx < x0 || ty < 0 || tx >= x0 + w || ty >= h || dist.has(key(tx, ty))) continue;
      if (rockAt(map, tx, ty) !== OPEN || isSky(map, tx, ty)) continue;
      dist.set(key(tx, ty), d);
      queue.push([tx, ty]);
    }
  }
  return dist;
}

function sameAsWholeWalk(c: Colony, what: string): void {
  const ref = wholeWalk(c);
  const { w, h } = c.map.size;
  const x0 = c.map.x0;
  let reached = 0;
  for (let y = 0; y < h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const want = ref.get(y * w + x - x0) ?? -1;
      if (want >= 0) reached++;
      assert.equal(outDistAt(c, x, y), want, `${what}: cell (${x}, ${y})`);
    }
  assert.ok(reached > 1, `${what}: the hole reaches some tunnel`);
}

function curtainColony(k = 0): Colony {
  const g = new Game(smallOne(), { antCount: 4, rivalAnts: 4 }, gameRng(1));
  const c = g.colonies[k]!;
  c.bind(CURTAIN);
  return c;
}

/** Open a band three rows deep under the hole, from its column to column `to`, either way. */
function tunnel(c: Colony, to: number): void {
  const [a, b] = to < c.entranceCol ? [to, c.entranceCol] : [c.entranceCol, to];
  for (let y = c.entranceRow + 1; y <= c.entranceRow + 3; y++) for (let x = a; x <= b; x++) setRock(c.map, x, y, OPEN);
}

test("the way-out field covers a window round the hole, not the whole curtain, and reads as a walk over the whole curtain does", () => {
  const c = curtainColony();
  tunnel(c, c.entranceCol + 40);
  const f = outField(c);
  assert.ok(f.w < c.map.size.w, `the window (${f.w} columns) is narrower than the curtain (${c.map.size.w})`);
  assert.equal(f.dist.length, f.w * c.map.size.h);
  sameAsWholeWalk(c, "a tunnel inside the window");
});

for (const [k, side] of [
  [0, "right"],
  [1, "left"],
] as const)
  test(`a tunnel dug past the window's ${side} edge widens the window, and every cell still reads as the walk over the whole curtain`, () => {
    const c = curtainColony(k);
    const first = outField(c);
    const far = side === "right" ? first.x0 + first.w + 20 : first.x0 - 20;
    assert.ok(far >= c.map.x0 && far < c.map.x0 + c.map.size.w, "the tunnel's end is on the curtain");
    tunnel(c, far);
    c.outDist = null; // built afresh over the dug ground
    const f = outField(c);
    assert.ok(f.w > first.w, `the window widened past ${first.w} columns (now ${f.w})`);
    assert.ok(f.x0 <= far && far < f.x0 + f.w, "it reaches the tunnel's end");
    sameAsWholeWalk(c, `a tunnel past the first window's ${side} edge`);
  });
