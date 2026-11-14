import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { EXPLORE } from "../../vocab.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";
import { SMALL_SIDE, ageOf } from "../builders.ts";

// forageDig (ja-16rp, docs/foraging-tunnels.md, PRD §70): an old forager home from a trip with nothing digs in the nest
// for forageDig seconds instead of going straight back out. Assay P1 (pockets) measures what it does over an hour; these
// pin when a bout starts, what it lets the ant do, and when it ends. World 2 of SMALL_SIDE, as restFetch.test.

/** `n` ants on world 2; a fixed "explore" policy unless `local` (the local rule, under which a tired forager turns home). */
const colony = (forageDig: number, n = 1, local = false) =>
  local
    ? new Colony(generateSideWorld(2, SMALL_SIDE), { antCount: n, maxAnts: n, forageDig }, mulberry32(7))
    : new Colony(generateSideWorld(2, SMALL_SIDE), { antCount: n, maxAnts: n, forageDig }, mulberry32(7), (() => "explore") as never);

/** Ant i of age band `band`, empty-jawed and exploring at the nest's centre. */
function inNest(c: Colony, i: number, band: 0 | 1 | 2) {
  cellOf(c.nest.x, c.nest.y);
  c.age[i] = ageOf(band);
  c.x[i] = centreX(CELL[0], CELL[1]);
  c.y[i] = centreY(CELL[1]);
  c.mode[i] = EXPLORE;
  c.carrying[i] = 0;
}

test("forageDig: on a bout an old forager digs and stays in; without a bout, or with the setting off, it forages", () => {
  const c = colony(120);
  inNest(c, 0, 2);
  assert.equal(c.forageDigs(0), false, "no bout yet");
  assert.equal(c.digs(0), false, "the old don't dig the nest");
  assert.equal(c.outbound(0), true, "the old go out");
  c.digBout[0] = 30;
  assert.equal(c.forageDigs(0), true);
  assert.equal(c.digs(0), true, "on a bout it digs");
  assert.equal(c.outbound(0), false, "on a bout it stays in");
  inNest(c, 0, 1);
  assert.equal(c.forageDigs(0), false, "only the old take a foraging dig");
  const off = colony(0);
  inNest(off, 0, 2);
  off.digBout[0] = 30;
  assert.equal(off.forageDigs(0), false, "forageDig 0: a bout left in the array does nothing");
  assert.equal(off.outbound(0), true);
});

test("forageDig: a bout runs down while the ant explores in the nest, and ends when it picks up food", () => {
  const c = colony(120);
  inNest(c, 0, 2);
  c.digBout[0] = 10;
  for (let t = 0; t < 30; t++) {
    c.mode[0] = EXPLORE;
    c.tick(1 / 30);
  }
  assert.equal(c.under[0], 1, "it stayed in");
  assert.ok(c.digBout[0] < 10 && c.digBout[0] > 8.5, `a second's exploring took about a second off (${c.digBout[0]})`);
  c.carrying[0] = 1;
  c.tick(1 / 30);
  assert.equal(c.digBout[0], 0, "food in its jaws ends the bout");
});

test("forageDig: a bout starts only for an old forager coming home with nothing, at the setting's length", () => {
  // Old foragers, on the local rule, each about to tire once out (fatigue just under patience): a search fails soon and
  // they come home empty.
  const run = (forageDig: number) => {
    const c = colony(forageDig, 12, true);
    for (let i = 0; i < c.n; i++) c.age[i] = ageOf(2);
    const prev = new Float32Array(c.n);
    const out = new Uint8Array(c.n); // out on the ground since its last bout began
    let starts = 0;
    for (let t = 0; t < 30 * 40; t++) {
      for (let i = 0; i < c.n; i++) if (c.under[i] === 0 && c.digBout[i] === 0) c.fatigue[i] = Math.max(c.fatigue[i], c.patience(i) * 0.98);
      c.tick(1 / 30);
      for (let i = 0; i < c.n; i++) {
        if (c.under[i] === 0) out[i] = 1;
        if (c.digBout[i] > prev[i]) {
          starts++;
          assert.equal(out[i], 1, "after a trip out");
          out[i] = 0;
          assert.equal(c.digBout[i], forageDig, "a bout starts at forageDig seconds");
          assert.equal(c.band(i), 2, "an old ant");
          assert.equal(c.carrying[i], 0, "with nothing in its jaws");
          assert.equal(c.under[i], 1, "at home");
        }
        prev[i] = c.digBout[i];
      }
    }
    return starts;
  };
  assert.ok(run(120) > 0, "foragers home empty began bouts");
  assert.equal(run(0), 0, "with the setting off none does");
});
