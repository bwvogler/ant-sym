import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COLONY } from "../../params.ts";
import { generateEndlessPlane } from "../../endlessMap.ts";
import { MARKS, MAX_LEVEL, Pheromones } from "../../pheromone.ts";
import { layMark } from "../../sense.ts";
import { centreX, centreY } from "../../hex.ts";
import { OPEN, isSky, rockAt } from "../../world.ts";
import { oneColony } from "../builders.ts";

// Floor marks (nest slice 3), the max rule (markMax 1, PRD §77.8): a cell is raised to the ant's own level, the field's cap fading with the
// seconds since its last chamber, so a busy tunnel keeps a slope; markMax 0 adds every tick up to the cap, which saturates it.

const ROYAL = MARKS.indexOf("royal") + 1;
/** layMark adds the tick to the seconds since the chamber before it lays. */
const TICK = 1 / 30;

/** One ant laying the royal mark on a tunnel cell, held `since` seconds from its chamber, for `ticks` ticks; the cell's level after. */
function laid(markMax: number, since: number, ticks: number, markDecay?: number, start = 0, gain = 1): number {
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
  c.layGain[0] = gain;
  c.ph.fields.royal.set(x, y, start);
  for (let k = 0; k < ticks; k++) {
    c.lastRole[0] = ROYAL;
    c.sinceRole[0] = since;
    layMark(c, 0, 1 / 30);
  }
  return c.ph.fields.royal.get(x, y);
}

test("floor marks: added every tick (markMax 0, the old rule at its 30 s decay), a tunnel saturates at the cap whatever its distance, and shows no slope", () => {
  const near = laid(0, 1, 30 * 40, 30);
  const far = laid(0, 20, 30 * 40, 30);
  assert.equal(near, MAX_LEVEL);
  assert.equal(far, MAX_LEVEL, "the cell 20 s from its chamber holds as much as the one 1 s from it");
});

test("floor marks: with markMax 1 a busy tunnel keeps its slope: the cell holds the ant's own level, never more, however long it is laid", () => {
  const near = laid(1, 1, 30 * 40);
  const far = laid(1, 20, 30 * 40);
  assert.ok(Math.abs(near - MAX_LEVEL * Math.exp(-(1 + TICK) / DEFAULT_COLONY.markDecay)) < 1e-3, `near ${near}`);
  assert.ok(Math.abs(far - MAX_LEVEL * Math.exp(-(20 + TICK) / DEFAULT_COLONY.markDecay)) < 1e-3, `far ${far}`);
  assert.ok(near > far + 5, `a slope to follow: ${near} against ${far}`);
});

test("floor marks: markMax 1 only raises: a higher mark is kept, and the decay is the param", () => {
  assert.equal(laid(1, 20, 5, undefined, 17), 17, "a cell above the ant's level stays");
  const slow = laid(1, 20, 5, 30);
  assert.ok(Math.abs(slow - MAX_LEVEL * Math.exp(-(20 + TICK) / 30)) < 1e-3, `markDecay 30: ${slow}`);
  assert.equal(DEFAULT_COLONY.markMax, 1, "the max rule is the default (PRD §77.8)");
  assert.equal(DEFAULT_COLONY.markDecay, 6, "the default decay");
});

test("floor marks: under markMax 1 the lay gain scales the level raised to (the fungus lay lever), capped at the field's maximum", () => {
  const level = (since: number) => MAX_LEVEL * Math.exp(-(since + TICK) / 30);
  const half = laid(1, 10, 5, 30, 0, 0.5);
  assert.ok(Math.abs(half - 0.5 * level(10)) < 1e-3, `gain 0.5 lowers the mark: ${half} against ${0.5 * level(10)}`);
  assert.equal(
    laid(1, 10, 5, 30, 0, 2),
    MAX_LEVEL,
    "gain 2 on a mark of 14.3 is capped at the field's maximum, so it only reaches further",
  );
  const far = laid(1, 30, 5, 30, 0, 2);
  assert.ok(Math.abs(far - 2 * level(30)) < 1e-3, `gain 2 where it is not capped: ${far} against ${2 * level(30)}`);
  assert.equal(laid(1, 10, 5, 30, 0, 0), 0, "gain 0 lays nothing");
});

test("floor marks: raiseCell reaches every cell of an endless plane, north of the origin and past the nominal box (as depositCell)", () => {
  const ph = new Pheromones(generateEndlessPlane(1));
  for (const [x, y] of [
    [5, -7],
    [-300, -40],
    [40, 20],
  ] as const) {
    ph.raiseCell("royal", x, y, 10);
    assert.equal(ph.fields.royal.get(x, y), 10, `(${x}, ${y})`);
    ph.depositCell("royal", x, y, 3);
    assert.equal(ph.fields.royal.get(x, y), 13, `depositCell lays on it too (${x}, ${y})`);
  }
});
