import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { RESPONSE_HOOKS, type ResponseHook } from "../../colonyBrain.ts";
import { Game } from "../../game.ts";
import { localResponses, responses, type Responses, type Touch } from "../../responses.ts";
import type { AntDraw } from "../../weighted.ts";
import { generateSideWorld, generateWorld, mulberry32, type WorldMap } from "../../world.ts";
import { SMALL_SIDE, ticks } from "../builders.ts";

// Every place the colony asks a response hook hands it the ant's draw (ja-m7rr; review of #223: the food pick-up and the drop
// at the nest asked without one, so on the top-down map every get and drop played Jev's top answer). A new call site that
// forgets the draw fails here.

/** Responses answering as the local ones do, counting each hook's asks with a draw and without. */
function spies(): { r: Responses; asks: Record<ResponseHook, { drawn: number; bare: number }> } {
  const asks = Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, { drawn: 0, bare: 0 }])) as Record<
    ResponseHook,
    { drawn: number; bare: number }
  >;
  const over = Object.fromEntries(
    RESPONSE_HOOKS.map((h) => [
      h,
      (t: Touch, draw?: AntDraw) => {
        asks[h][draw ? "drawn" : "bare"]++;
        return (localResponses[h] as (t: Touch) => unknown)(t);
      },
    ]),
  ) as Partial<Responses>;
  return { r: responses(over), asks };
}

/** Each view, and the hooks a minute of it is sure to ask (60 s, seeded: the side view's two nests meet, the top-down ones don't). */
const VIEWS: [string, () => WorldMap, number, ResponseHook[]][] = [
  ["top-down", () => generateWorld(1, { size: { w: 160, h: 100 } }), 200, ["get", "carry", "drop", "trail"]],
  ["side", () => generateSideWorld(2, { ...SMALL_SIDE, nestCount: 2 }), 120, ["get", "carry", "drop", "trail", "contact"]],
];

for (const [view, map, ants, met] of VIEWS)
  test(`${view}: every response the colonies ask carries the ant's draw`, () => {
    const { r, asks } = spies();
    const g = new Game(map(), { antCount: ants, rivalAnts: ants }, mulberry32(3), { responses: r, rivalResponses: r });
    ticks(g, 60 * 30);
    for (const h of RESPONSE_HOOKS) assert.equal(asks[h].bare, 0, `${h} asked ${asks[h].bare} times without a draw`);
    for (const h of met) assert.ok(asks[h].drawn > 0, `${h} never asked: ${JSON.stringify(asks)}`);
  });

// The gate at home asks `leave` only where the colony gates leaving (one world's shafts); asked directly here.
test("the leave response at the gate carries the ant's draw", () => {
  const { r, asks } = spies();
  const c = new Game(generateWorld(1, { size: { w: 160, h: 100 } }), { antCount: 10, rival: false }, mulberry32(3)).player;
  c.responses = r;
  c.leaves(0, 1 / 30, false);
  assert.deepEqual(asks.leave, { drawn: 1, bare: 0 });
});

// The games above reach most call sites, not all (a corpse hauled, soil picked up on one world's plane, brood: review of #223, S3).
// So the source too: every call of a response hook in colony/ hands it the ant's draw.
test("every response hook called in colony/ is handed antDraw", () => {
  const dir = new URL("../../", import.meta.url);
  const calls: string[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(new URL(f, dir), "utf8");
    for (const m of text.matchAll(/\b(?:resp|responses)\.(get|carry|drop|trail|contact|leave)\(/g)) {
      // the call's arguments, to its closing parenthesis (a call Prettier wrapped spans lines)
      let depth = 1;
      let end = m.index + m[0].length;
      for (; depth > 0 && end < text.length; end++) depth += text[end] === "(" ? 1 : text[end] === ")" ? -1 : 0;
      const call = text.slice(m.index, end);
      const line = text.slice(0, m.index).split("\n").length;
      calls.push(`${f}:${line}`);
      assert.match(call, /antDraw\(/, `${f}:${line} asks ${m[1]} without the ant's draw: ${call}`);
    }
  }
  assert.ok(calls.length >= 11, `found only ${calls.join(", ")}`);
});
