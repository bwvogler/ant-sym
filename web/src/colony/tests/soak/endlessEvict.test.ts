import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { CHUNK_BITS } from "../../chunks.ts";
import { saveEndless } from "../../endlessMap.ts";
import { generateEndlessWorld, type EndlessWorld } from "../../endlessWorld.ts";
import { Game, gameRng, GAME_REGROW } from "../../game.ts";
import { STRAINS } from "../../fungus.ts";
import { CELL, cellOf } from "../../hex.ts";
import { takeFoodCell } from "../../world.ts";
import { DT } from "../builders.ts";

// Freeing far ground changes memory and nothing else (PRD §66 E4.4b, `ja-hacj`): a game with eviction on and off holds equal colonies, changed chunks, fungus
// and counters, because a chunk nobody changed is made again identical, and a chunk somebody did change is kept.

const SEED = 3;
const hash = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex");

function make(evict: boolean, sleep: boolean) {
  const world = generateEndlessWorld(SEED) as EndlessWorld;
  const g = new Game(world, { regrow: GAME_REGROW, autoFound: false }, gameRng(SEED), [{ antCount: 40 }, { antCount: 40 }]);
  g.evict = evict;
  if (sleep) g.enableSleep();
  g.land(
    0,
    STRAINS.findIndex((s) => s.id === "garden"),
    { evolve: true },
  );
  return { g, world };
}

/** The host (ant 0 of colony 0, carrying the fungus) crosses `cells` cells east at 60 a second and back, and the game then runs on `after` s. Returns where it began. */
function walk(g: Game, cells: number, after: number): { x: number; y: number } {
  const c = g.colonies[0]!;
  const x0 = c.x[0]!;
  const y0 = c.y[0]!;
  for (let leg = 0; leg < 2; leg++)
    for (let s = 0; s <= cells; s += 2) {
      c.putAnt(0, 0, x0 + (leg === 0 ? s : cells - s), y0);
      c.load[0] = 1;
      g.tick(DT);
    }
  for (let k = 0; k < Math.round(after / DT); k++) g.tick(DT);
  return { x: x0, y: y0 };
}

function state(m: { g: Game; world: EndlessWorld }) {
  return {
    colonies: hash(m.g.colonies.map((c) => c.saveState())),
    changed: hash(saveEndless(m.world.plane)),
    fungus: hash(m.g.fungus.saveState()),
    regrown: m.g.regrown,
    foodTotal: m.world.plane.foodTotal,
    foodLeft: m.world.plane.foodLeft,
  };
}

test("a game that frees far ground equals one that keeps it: awake rule on, a host walking 1,200 cells out and back", () => {
  const on = make(true, true);
  const off = make(false, true);
  walk(on.g, 1200, 60);
  walk(off.g, 1200, 60);
  const [a, b] = [on.world.plane, off.world.plane];
  assert.ok(b.rock.count > a.rock.count + 20, `kept ${b.rock.count} rock chunks, freed down to ${a.rock.count}`);
  assert.ok(b.food.count > a.food.count + 5, `kept ${b.food.count} food chunks, freed down to ${a.food.count}`);
  assert.deepEqual(state(on), state(off));
});

test("food eaten in a chunk that was freed and made again regrows as in a game that kept it (awake rule off: regrowth is everywhere)", () => {
  const run = (evict: boolean) => {
    const m = make(evict, false);
    const map = m.world.plane;
    // a chunk with food 8 to 17 chunks out along the host's way, which the game reads now (so its piles are noted) and frees later
    const c = m.g.colonies[0]!;
    cellOf(c.x[0]!, c.y[0]!);
    const [hx, hy] = [CELL[0]! >> CHUNK_BITS, CELL[1]! >> CHUNK_BITS];
    const found: [number, number, number[]][] = [];
    for (let cx = hx + 8; cx < hx + 18 && found.length < 2; cx++)
      for (let cy = hy - 1; cy <= hy + 1 && found.length < 2; cy++) {
        const own = map.plane.chunk(cx, cy).food;
        const cells = [...own.keys()].filter((i) => own[i]! > 0).slice(0, 6);
        if (cells.length) found.push([cx, cy, cells]);
      }
    assert.equal(found.length, 2, "food out along the way");
    const [cx, cy, cells] = found[0]!;
    map.food.get(cx << CHUNK_BITS, cy << CHUNK_BITS);
    // food eaten in the other chunk now is a change: that chunk is the delta, and stays through the walk
    const [kx, ky, kcells] = found[1]!;
    assert.ok(takeFoodCell(map, (kx << CHUNK_BITS) + (kcells[0]! & 63), (ky << CHUNK_BITS) + (kcells[0]! >> 6)));
    walk(m.g, 1200, 60);
    if (evict) assert.equal(map.food.peek(cx, cy), undefined, "the chunk the food is eaten in was freed");
    assert.ok(map.food.peek(kx, ky), "the chunk with food already eaten was kept");
    for (const i of cells) assert.ok(takeFoodCell(map, (cx << CHUNK_BITS) + (i & 63), (cy << CHUNK_BITS) + (i >> 6)));
    for (let k = 0; k < Math.round(90 / DT); k++) m.g.tick(DT);
    return m;
  };
  const on = run(true);
  const off = run(false);
  assert.ok(on.g.regrown > 0, "the eaten food grew back");
  assert.deepEqual(state(on), state(off));
});
