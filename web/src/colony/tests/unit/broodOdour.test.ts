import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony.ts";
import { loadColony, saveColony } from "../../colonySave.ts";
import { FAINT } from "../../vocab.ts";
import { generateSideWorld, mulberry32, OPEN, rockAt } from "../../world.ts";
import { SMALL_SIDE } from "../builders.ts";

// Brood odour (ja-k4k.15.2, docs/brood-odour.md): the brood gives off its own scent where it lies, reaching two or three
// cells, strongest on the pile. Off (broodOdour 0) the channel stays empty.

/** A colony of one ant with `items` brood items on one cell of the royal chamber, run `seconds`; the cell and the row's open cells east. */
function pile(items: number, broodOdour: number, seconds = 30) {
  const map = generateSideWorld(2, SMALL_SIDE);
  const c = new Colony(map, { antCount: 1, maxAnts: 1, broodOdour }, mulberry32(1), () => "explore");
  const royal = map.chambers!.list.find((k) => k.colony === 0 && k.role === "royal")!;
  const y = royal.floorRow - 3;
  const x = royal.x0 + 1;
  c.brood.items.length = 0;
  for (let k = 0; k < items; k++) c.brood.add(x, y, royal.id);
  // Held at the egg stage, so the pile stays as laid (nothing hatches, is fed or carried in the half minute).
  for (let k = 0; k < 30 * seconds; k++) {
    for (const b of c.brood.items) b.t = 0;
    c.tick(1 / 30);
  }
  const at = (d: number) => c.ph.fields.broodOdour.get(x + d, y);
  for (let d = 0; d <= 3; d++) assert.equal(rockAt(map, x + d, y), OPEN, `open ground ${d} cells east (the test's own check)`);
  return { c, at };
}

test("brood odour: strongest on the brood, falling off with distance, below FAINT three cells out even from a pile of 20", () => {
  const one = pile(1, 1);
  assert.ok(one.at(0) > one.at(1) && one.at(1) > one.at(2), `falls off: ${[0, 1, 2].map((d) => one.at(d).toFixed(3)).join(", ")}`);
  assert.ok(one.at(1) >= FAINT, `a single egg is smelt a cell away: ${one.at(1).toFixed(3)}`);
  const many = pile(20, 1);
  assert.ok(many.at(2) >= FAINT, `a pile is smelt two cells away: ${many.at(2).toFixed(3)}`);
  assert.ok(many.at(3) < FAINT, `and not three: ${many.at(3).toFixed(3)}`);
});

test("brood odour off (broodOdour 0): nothing is laid, the channel stays empty", () => {
  const off = pile(20, 0, 5);
  let any = 0;
  off.c.ph.fields.broodOdour.forEach((_, __, a) => (any += a.reduce((s, v) => s + v, 0)));
  assert.equal(any, 0);
});

test("brood odour is saved with the colony's fields and loads back as it was", () => {
  const { c, at } = pile(5, 1, 5);
  const saved = JSON.parse(JSON.stringify(saveColony(c))) as Record<string, unknown>;
  const map = generateSideWorld(2, SMALL_SIDE);
  const back = new Colony(map, { antCount: 1, maxAnts: 1, broodOdour: 1 }, mulberry32(1), () => "explore");
  loadColony(back, saved);
  const royal = map.chambers!.list.find((k) => k.colony === 0 && k.role === "royal")!;
  for (let d = 0; d <= 3; d++) assert.equal(back.ph.fields.broodOdour.get(royal.x0 + 1 + d, royal.floorRow - 3), at(d), `${d} cells east`);
});
