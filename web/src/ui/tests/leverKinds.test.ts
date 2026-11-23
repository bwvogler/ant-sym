import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LETHAL_LEVERS, LEVERS } from "../../colony/index.ts";
import { LEVER_KIND, LEVER_KINDS } from "../leverKinds.ts";

// How a lever's kind looks and reads, once (ja-fnd.6.4.4): the ant card, the Policy tab and the Lab's levers used to choose each for themselves.

test("every kind of lever has a row, and the list names them all in the Levers tab's order", () => {
  const kinds = new Set(LEVERS.map((v) => v.kind));
  assert.deepEqual([...kinds].sort(), Object.keys(LEVER_KIND).sort(), "a kind with no row, or a row for none");
  assert.deepEqual([...LEVER_KINDS], ["perceive", "emit", "lethal"]);
  for (const v of LEVERS) assert.ok(LEVER_KIND[v.kind], v.id);
});

test("the colours and words of each kind are as the three places had them", () => {
  assert.deepEqual(LEVER_KIND.perceive, {
    tone: "text-spore",
    row: "perceives",
    what: "what it perceives",
    chipOn: "border-accent bg-accent-soft text-accent",
  });
  assert.deepEqual(LEVER_KIND.emit, {
    tone: "text-accent",
    row: "gives off",
    what: "what it gives off",
    chipOn: "border-accent bg-accent-soft text-accent",
  });
  assert.deepEqual(LEVER_KIND.lethal, { tone: "text-err", row: "lethal", what: "lethal", chipOn: "border-err bg-err-soft text-err" });
});

test("a chip is in the lethal colours exactly when the lever is lethal (the Lab used the set of lethal ids, this uses the kind)", () => {
  for (const v of LEVERS) assert.equal(LEVER_KIND[v.kind].chipOn.includes("border-err"), LETHAL_LEVERS.has(v.id), v.id);
});

// No component chooses a lever kind's colour for itself.
const UI = new URL("../", import.meta.url).pathname;

test("no component branches on a lever's kind for its colour or its words", () => {
  const found = readdirSync(UI)
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => /kind === "(perceive|emit)"|kind === "lethal" \?/.test(readFileSync(join(UI, f), "utf8")));
  assert.deepEqual(found, [], "use LEVER_KIND (ui/leverKinds.ts)");
});
