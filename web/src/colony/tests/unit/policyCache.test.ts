import assert from "node:assert/strict";
import { test } from "node:test";
import { hash, PolicyCache } from "../../policyCache.ts";

test("PolicyCache keeps answers per context and round-trips through entries()", () => {
  const c = new PolicyCache<string>("ctx");
  c.put("k", "explore");
  assert.equal(c.get("k"), "explore");
  assert.equal(new PolicyCache<string>("ctx", c.entries()).size, 1);
  c.clear();
  assert.equal(c.size, 0);
});

test("hash is an 8-digit hex string that changes with the text", () => {
  assert.match(hash("a"), /^[0-9a-f]{8}$/);
  assert.notEqual(hash("a"), hash("b"));
});
