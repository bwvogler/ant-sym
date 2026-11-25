import assert from "node:assert/strict";
import { test } from "node:test";
import { fogFromUrl } from "../fog/sources.ts";

// The page's fog switch (docs/fog-of-war.md §5.4, PRD §89): on by default since F6, off with `?fog=0`.

test("the page has the fog unless the address says fog=0", () => {
  assert.equal(fogFromUrl(""), true, "by default");
  assert.equal(fogFromUrl("?fog=1"), true, "the old switch still reads as on");
  assert.equal(fogFromUrl("?seed=3"), true, "other parameters change nothing");
  assert.equal(fogFromUrl("?fog=0"), false, "fog=0 turns it off");
  assert.equal(fogFromUrl("?seed=3&fog=0"), false, "among others");
});
