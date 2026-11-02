import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, localPolicy, REST, type Situation } from "../colony.ts";
import { Game } from "../game.ts";
import { centreX, centreY } from "../hex.ts";
import { generateSideWorld, generateWorld, mulberry32, OPEN, OPEN_WORLD, rockAt } from "../world.ts";

// Nest slice 3 (docs/nest-and-home.md §3.3): chambers have roles, ants lay their chamber's mark on the floor as road
// signs, and an ant inside the nest is asked by where it is, not by the home trail.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

test("roles and road signs: chambers dug get roles (brood among them), and the royal mark is strongest in the royal chamber", () => {
  const map = generateSideWorld(2, SMALL);
  const g = new Game(map, { antCount: 400, rival: false }, mulberry32(4));
  for (let k = 0; k < 30 * 240; k++) g.tick(1 / 30);
  const ch = map.chambers!;
  const mine = ch.list.filter((c) => c.colony === 0 && c.cells > 0);
  assert.equal(mine.filter((c) => c.role === "royal").length, 1, "one royal chamber");
  assert.ok(mine.every((c) => c.role !== "none"), `roles: ${mine.map((c) => c.role).join(", ")}`);
  assert.ok(mine.some((c) => c.role === "brood"), "brood chambers");
  // Mean royal mark in the royal chamber vs in every other chamber.
  const ph = g.player.ph;
  const sum = new Map<number, [number, number]>();
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++) {
      const id = ch.at(x, y);
      if (id < 0 || rockAt(map, x, y) !== OPEN) continue;
      const a = sum.get(id) ?? [0, 0];
      a[0] += ph.fields.royal.get(x, y);
      a[1]++;
      sum.set(id, a);
    }
  const mean = (id: number) => (sum.get(id)![0] / sum.get(id)![1]);
  const royal = mine.find((c) => c.role === "royal")!.id;
  for (const c of mine) if (c.id !== royal && c.cells > 4) assert.ok(mean(royal) > mean(c.id), `royal mark: royal chamber ${mean(royal).toFixed(2)} vs ${c.role} ${c.id} ${mean(c.id).toFixed(2)}`);
});

test("inside the nest an ant is asked where it is, not the home trail: just home with food, it is asked as in the royal chamber", () => {
  const map = generateSideWorld(2, SMALL);
  const asked: Situation[] = [];
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), (s) => {
    asked.push(s);
    return "explore";
  });
  // Carrying food into the royal chamber: it puts it down, and is asked afresh.
  c.x[0] = map.nest.x;
  c.y[0] = map.nest.y - 1;
  c.carrying[0] = 1;
  c.mode[0] = 2;
  for (let k = 0; k < 30 && c.stored === 0; k++) c.tick(1 / 30);
  assert.equal(c.stored, 1);
  c.tick(1 / 30);
  const last = asked.at(-1)!;
  assert.equal(last.homeTrail, "royal", `asked ${JSON.stringify(last)}`);
  assert.equal(c.mode[0], 0, "its policy's answer: out again");
  // On the ground the home trail is what it reads.
  const d = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), (s) => {
    asked.push(s);
    return "explore";
  });
  d.x[0] = centreX(10, 0);
  d.y[0] = centreY(0);
  for (let y = 0; y < map.size.h; y++)
    if (rockAt(map, 10, y) === OPEN) {
      d.x[0] = centreX(10, y);
      d.y[0] = centreY(y);
      break;
    }
  asked.length = 0;
  d.tick(1 / 30);
  assert.ok(["none", "faint", "strong"].includes(asked[0]!.homeTrail), `on the ground: ${asked[0]!.homeTrail}`);
});

test("ja-qnx: a policy that always says 'return' to a homing ant no longer parks the colony at home (both views)", () => {
  // The cached-answer trap: an ant just home with food, still in "return", asked and told "return" again, stayed home
  // for good (its time out resets at the nest): all 300 of 300. It rests REST seconds and is asked afresh as an explorer,
  // so about a third are resting at home at any moment.
  const stubborn = (s: Situation) => (s.mode === "return" ? "return" : localPolicy(s));
  for (const map of [generateWorld(1, OPEN_WORLD), generateSideWorld(2, SMALL)]) {
    const c = new Colony(map, { antCount: 300, maxAnts: 300 }, mulberry32(9), stubborn);
    for (let k = 0; k < 30 * 150; k++) c.tick(1 / 30);
    let parked = 0;
    for (let i = 0; i < c.n; i++) if (c.alive[i] && c.mode[i] === 2 && !c.carrying[i] && !c.pellet[i] && c.since[i] === 0) parked++;
    assert.ok(c.stored > 30, `${map.sky ? "side" : "top-down"}: food home ${c.stored}`);
    assert.ok(parked < 150, `${map.sky ? "side" : "top-down"}: ${parked} of 300 resting at home in return`);
  }
  assert.ok(REST > 0);
});
