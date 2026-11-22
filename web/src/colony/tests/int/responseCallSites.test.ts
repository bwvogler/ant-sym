import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { RESPONSE_HOOKS, type ResponseHook } from "../../colonyBrain.ts";
import { Game } from "../../game.ts";
import { localResponses, responses, type Responses, type Touch } from "../../responses.ts";
import type { AntDraw } from "../../weighted.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne, ticks } from "../builders.ts";

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

test("one world: every response the colonies ask carries the ant's draw", () => {
  // A minute of seed 7's small one world, 120 ants a side, asks every hook (measured, S2.3c: contact 221 times, leave 27,613).
  const { r, asks } = spies();
  const g = new Game(smallOne(7), {}, mulberry32(3), [
    { antCount: 120, responses: r },
    { antCount: 120, responses: r },
  ]);
  ticks(g, 60 * 30);
  for (const h of RESPONSE_HOOKS) assert.equal(asks[h].bare, 0, `${h} asked ${asks[h].bare} times without a draw`);
  for (const h of RESPONSE_HOOKS) assert.ok(asks[h].drawn > 0, `${h} never asked: ${JSON.stringify(asks)}`);
});

// The gate at the top of a shaft asks `leave`; asked directly here too.
test("the leave response at the gate carries the ant's draw", () => {
  const { r, asks } = spies();
  const c = new Game(smallOne(7), {}, mulberry32(3), [{ antCount: 10 }]).colonies[0]!;
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
      // the draw is `antDraw(i)` itself, or a variable the file set from it (`const draw = col.antDraw(i)`)
      const arg = /\bdraw\b/.test(call) && /const draw = col\.antDraw\(/.test(text);
      assert.ok(/antDraw\(/.test(call) || arg, `${f}:${line} asks ${m[1]} without the ant's draw: ${call}`);
    }
  }
  assert.ok(calls.length >= 10, `found only ${calls.join(", ")}`);
});
