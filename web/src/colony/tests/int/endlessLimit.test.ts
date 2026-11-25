import assert from "node:assert/strict";
import { test } from "node:test";
import { generateEndlessWorld } from "../../endlessWorld.ts";
import { Game, gameRng, MAX_COLONIES } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import type { Flight } from "../../royal.ts";
import { mulberry32 } from "../../world.ts";

// Woken and founded colonies skip the old limit of 6 on an endless plane; the awake cap is the bound (PRD §66, `ja-y4eg`, owner 2026-11-25).

const SPECS = [{ antCount: 10 }, { antCount: 10 }];

test("a bounded map keeps the limit of MAX_COLONIES and an endless plane has none", () => {
  const bounded = new Game(generateOneWorld(3), { regrow: 0, autoFound: false }, mulberry32(5), SPECS);
  assert.equal(bounded.colonyLimit, MAX_COLONIES);
  assert.equal(new Game(generateEndlessWorld(4), {}, gameRng(4), SPECS).colonyLimit, Infinity);
});

test("on an endless plane sites wake past 6 colonies and a flown queen founds the 9th", () => {
  const g = new Game(generateEndlessWorld(4), {}, gameRng(4), SPECS);
  const SIZE = 8;
  while (g.colonies.length < SIZE) {
    const s = g.sites[0];
    if (!s) break;
    g.wakeSite({ x: s.x, y: s.y, rx: s.rx!, ry: s.ry!, heading: s.heading }, { ants: 5 });
  }
  assert.equal(g.colonies.length, SIZE, "8 woken colonies, no refusal at 6");
  let founded = -1;
  for (let j = 0; j < 30 && founded < 0; j++) {
    const m = g.colonies[j % 2]!;
    const f: Flight = { mother: j % 2, x: m.nest.x, y: m.nest.y, load: 0, strain: 0, at: g.time, food: 1 };
    g.flights.push(f);
    founded = g.found(f);
    if (founded < 0)
      assert.ok(!/colonies already/.test(g.lastLoss?.reason ?? ""), `a loss for room, never for the count (${g.lastLoss?.reason})`);
  }
  assert.ok(founded >= SIZE, `a ninth colony is founded (index ${founded})`);
});
