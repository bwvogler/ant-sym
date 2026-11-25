import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The switch's page wiring in `useColony` (E6.1, ja-qpv.5.1; review of #434): a hook no test here renders. Two lines carry the world of a save: without the first a
// loaded endless save would come back in whatever world the address says, and without the second a pending save would load into a game of the other world (a
// refused load). Held by source, as `minimapPageWiring.test.ts` holds the minimap's; e2e section 19 plays both in a browser. Replace with a rendered test when
// the page has one.

const hook = readFileSync(new URL("../useColony.ts", import.meta.url), "utf8");

test("loadSave puts back the world the save was made in", () => {
  assert.match(hook, /rival:\s*r\.settings\.rival,\s*world:\s*worldOf\(r\.settings\),/, "loadSave sets world from the save's settings");
});

test("a pending save loads only into a game of its own world", () => {
  assert.match(hook, /worldOf\(r\.settings\)\s*===\s*controls\.world/, "the pending-save match compares the save's world with the game's");
});
