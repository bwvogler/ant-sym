import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COLONY } from "../../params.ts";
import { MARKS, MAX_LEVEL } from "../../pheromone.ts";
import { layMark } from "../../sense.ts";
import { MARK_DECAY } from "../../tuning.ts";
import { centreX, centreY } from "../../hex.ts";
import { OPEN, isSky, rockAt } from "../../world.ts";
import { oneColony } from "../builders.ts";

// Floor marks (nest slice 3), the max rule (markMax 1, PRD §77.8): a cell is raised to the ant's own level, the field's cap fading with the
// seconds since its last chamber, so a busy tunnel keeps a slope; markMax 0 adds every tick up to the cap, which saturates it.

const ROYAL = MARKS.indexOf("royal") + 1;
/** layMark adds the tick to the seconds since the chamber before it lays. */
const TICK = 1 / 30;

/** One ant laying the royal mark on a tunnel cell, held `since` seconds from its chamber, for `ticks` ticks; the cell's level after. */
function laid(markMax: number, since: number, ticks: number, markDecay?: number, start = 0): number {
  const { map, c } = oneColony(1, { markMax, ...(markDecay === undefined ? {} : { markDecay }) });
  const royal = map.chambers!.list.find((k) => k.colony === 0 && k.role === "royal")!;
  // The open cell in no chamber nearest the royal chamber's floor row (a tunnel's), under the sky.
  let at: [number, number] | null = null;
  let best = Infinity;
  for (let y = royal.y1 + 1; y < map.size.h; y++)
    for (let x = map.x0; x < map.x0 + map.size.w; x++)
      if (rockAt(map, x, y) === OPEN && map.chambers!.at(x, y) < 0 && !isSky(map, x, y)) {
        const d = Math.abs(x - royal.x0) + (y - royal.y1);
        if (d < best) {
          best = d;
          at = [x, y];
        }
      }
  assert.ok(at, "an open cell outside every chamber (the test's own check)");
  const [x, y] = at;
  c.x[0] = centreX(x, y);
  c.y[0] = centreY(y);
  c.under[0] = 1;
  c.ph.fields.royal.set(x, y, start);
  for (let k = 0; k < ticks; k++) {
    c.lastRole[0] = ROYAL;
    c.sinceRole[0] = since;
    layMark(c, 0, 1 / 30);
  }
  return c.ph.fields.royal.get(x, y);
}

test("floor marks: added every tick (the default), a tunnel saturates at the cap whatever its distance, and shows no slope", () => {
  assert.equal(DEFAULT_COLONY.markMax, 0);
  const near = laid(0, 1, 30 * 40);
  const far = laid(0, 20, 30 * 40);
  assert.equal(near, MAX_LEVEL);
  assert.equal(far, MAX_LEVEL, "the cell 20 s from its chamber holds as much as the one 1 s from it");
});

test("floor marks: with markMax 1 a busy tunnel keeps its slope: the cell holds the ant's own level, never more, however long it is laid", () => {
  const near = laid(1, 1, 30 * 40);
  const far = laid(1, 20, 30 * 40);
  assert.ok(Math.abs(near - MAX_LEVEL * Math.exp(-(1 + TICK) / MARK_DECAY)) < 1e-3, `near ${near}`);
  assert.ok(Math.abs(far - MAX_LEVEL * Math.exp(-(20 + TICK) / MARK_DECAY)) < 1e-3, `far ${far}`);
  assert.ok(near > far + 5, `a slope to follow: ${near} against ${far}`);
});

test("floor marks: markMax 1 only raises: a higher mark is kept, and the decay is the param", () => {
  assert.equal(laid(1, 20, 5, undefined, 17), 17, "a cell above the ant's level stays");
  const quick = laid(1, 20, 5, 6);
  assert.ok(Math.abs(quick - MAX_LEVEL * Math.exp(-(20 + TICK) / 6)) < 1e-3, `markDecay 6: ${quick}`);
  assert.equal(DEFAULT_COLONY.markDecay, MARK_DECAY, "the default decay is the tuning constant");
});
