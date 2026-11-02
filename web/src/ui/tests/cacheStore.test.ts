import { test } from "node:test";
import assert from "node:assert/strict";
import { storageCache, STORE_PREFIX } from "../cacheStore.ts";

/** A Storage stand-in over a Map. */
function memory(): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test("storageCache: round trip under the prefix; junk and malformed pairs are dropped", () => {
  const m = memory();
  const store = storageCache(() => m);
  store.save("ctx", [["a", "follow"]]);
  assert.equal(m.data.has(STORE_PREFIX + "ctx"), true);
  assert.deepEqual(store.load("ctx"), [["a", "follow"]]);
  m.data.set(STORE_PREFIX + "bad", "{not json");
  assert.deepEqual(store.load("bad"), []);
  m.data.set(STORE_PREFIX + "odd", JSON.stringify([["a", "b"], ["x"], [1, "y"], ["z", 2], "w", ["p", "q", "r"]]));
  assert.deepEqual(store.load("odd"), [["a", "b"]]);
  assert.deepEqual(store.load("missing"), []);
});

test("storageCache: a save merges with what another tab stored under the same context", () => {
  const m = memory();
  const tabA = storageCache(() => m);
  const tabB = storageCache(() => m);
  tabA.save("ctx", [["a", "follow"]]);
  tabB.save("ctx", [["b", "explore"]]); // tab B never loaded "a"
  assert.deepEqual(new Map(tabA.load("ctx")), new Map([["a", "follow"], ["b", "explore"]]));
  tabB.save("ctx", [["a", "return"]]);
  assert.equal(new Map(tabA.load("ctx")).get("a"), "return", "the newer answer for a key wins");
});

test("storageCache: blocked or missing storage starts cold and never throws", () => {
  const blocked = storageCache(() => {
    throw new Error("SecurityError");
  });
  assert.deepEqual(blocked.load("ctx"), []);
  blocked.save("ctx", [["a", "b"]]);
  const none = storageCache(() => null);
  assert.deepEqual(none.load("ctx"), []);
  none.save("ctx", [["a", "b"]]);
  const full = storageCache(() => ({ getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } }));
  full.save("ctx", [["a", "b"]]);
});
