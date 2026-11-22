import { test } from "node:test";
import assert from "node:assert/strict";
import { loadColony, saveColony } from "../../colonySave.ts";
import { FAINT } from "../../vocab.ts";
import { OPEN, rockAt } from "../../world.ts";
import { oneColony } from "../builders.ts";

// Brood odour (ja-k4k.15.2, docs/brood-odour.md): the brood gives off its own scent where it lies, reaching across a
// chamber (slow to fade, 0.03 and 0.5: PRD §77.2), strongest on the pile. Off (broodOdour 0) the channel stays empty.

/** A colony of one ant with `items` brood items on one cell of the royal chamber, run `seconds`; the cell and the row's open cells east. */
function pile(items: number, broodOdour: number, seconds = 30, held = false) {
  const { map, c } = oneColony(1, { maxAnts: 1, broodOdour }, () => "explore", 1);
  const royal = map.chambers!.list.find((k) => k.colony === 0 && k.role === "royal")!;
  const y = royal.floorRow - 3;
  const x = royal.x0 + 1;
  c.brood.items.length = 0;
  for (let k = 0; k < items; k++) c.brood.add(x, y, royal.id).held = held ? 0 : -1;
  // Held at the egg stage, so the pile stays as laid (nothing hatches, is fed or carried in the half minute).
  for (let k = 0; k < 30 * seconds; k++) {
    for (const b of c.brood.items) b.t = 0;
    c.tick(1 / 30);
  }
  const at = (d: number) => c.ph.fields.broodOdour.get(x + d, y);
  for (let d = 0; d <= 3; d++) assert.equal(rockAt(map, x + d, y), OPEN, `open ground ${d} cells east (the test's own check)`);
  return { c, at };
}

test("brood odour: strongest on the brood, falling off with distance, smelt three cells out even from a single egg", () => {
  const one = pile(1, 1);
  assert.ok(
    one.at(0) > one.at(1) && one.at(1) > one.at(2) && one.at(2) > one.at(3),
    `falls off: ${[0, 1, 2, 3].map((d) => one.at(d).toFixed(3)).join(", ")}`,
  );
  assert.ok(one.at(3) >= FAINT, `a single egg is smelt three cells away: ${one.at(3).toFixed(3)}`);
  // Laid a second, not a tick: after 30 s a single egg's own cell holds about 3 (30 × as much a tick would reach the cap, 20).
  assert.ok(one.at(0) > 1 && one.at(0) < 6, `a single egg's own cell: ${one.at(0).toFixed(3)}`);
  const many = pile(20, 1);
  assert.ok(
    many.at(3) > one.at(3) * 3,
    `a pile is smelt much stronger three cells away: ${many.at(3).toFixed(3)} against ${one.at(3).toFixed(3)}`,
  );
});

test("brood odour comes from brood lying in the nest: an egg in a nurse's jaws lays none", () => {
  const carried = pile(1, 1, 5, true);
  assert.equal(carried.at(0), 0);
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
  const { map, c: back } = oneColony(1, { maxAnts: 1, broodOdour: 1 }, () => "explore", 1);
  loadColony(back, saved);
  const royal = map.chambers!.list.find((k) => k.colony === 0 && k.role === "royal")!;
  for (let d = 0; d <= 3; d++) assert.equal(back.ph.fields.broodOdour.get(royal.x0 + 1 + d, royal.floorRow - 3), at(d), `${d} cells east`);
});
