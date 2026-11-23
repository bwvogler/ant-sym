import { test } from "node:test";
import assert from "node:assert/strict";
import { browserStorage, type KeyStore, persisted } from "../storage.ts";

// The page's one guarded way to keep a value (ja-fnd.6.1.2): missing, blocked or full storage leaves it for this page, and nothing throws.

/** A localStorage stand-in; `broken` throws on every call, as blocked storage can. */
function fake(broken = false) {
  const m = new Map<string, string>();
  const fail = () => {
    throw new Error("blocked");
  };
  const store: KeyStore & { m: Map<string, string> } = {
    getItem: (k) => (broken ? fail() : (m.get(k) ?? null)),
    setItem: (k, v) => (broken ? fail() : void m.set(k, v)),
    removeItem: (k) => (broken ? fail() : void m.delete(k)),
    m,
  };
  return store;
}

test("a value kept under its key is read back; null forgets it; other keys are left alone", () => {
  const st = fake();
  const a = persisted("a", { store: () => st });
  const b = persisted("b", { store: () => st });
  assert.equal(a.get(), null);
  a.set("1");
  b.set("2");
  assert.equal(a.get(), "1");
  assert.equal(st.m.get("a"), "1", "under the key it was given, as it was");
  a.set(null);
  assert.equal(a.get(), null);
  assert.equal(st.m.has("a"), false, "removed, not stored as the word null");
  assert.equal(b.get(), "2");
});

test("blocked storage reads as none and a set does not throw; missing storage the same", () => {
  for (const store of [() => fake(true), () => null]) {
    const p = persisted("k", { store });
    assert.equal(p.get(), null);
    assert.doesNotThrow(() => p.set("v"));
    assert.doesNotThrow(() => p.set(null));
    assert.equal(p.get(), null, "without `memory` nothing is held");
  }
  const throwing = persisted("k", {
    store: () => {
      throw new Error("the getter itself throws");
    },
  });
  assert.equal(throwing.get(), null);
  assert.doesNotThrow(() => throwing.set("v"));
});

test("with `memory` the last value set holds for this page when storage cannot, and forgetting it clears that too", () => {
  const p = persisted("k", { store: () => fake(true), memory: true });
  assert.equal(p.get(), null);
  p.set("kept");
  assert.equal(p.get(), "kept");
  p.set(null);
  assert.equal(p.get(), null);
  const st = fake();
  const q = persisted("k", { store: () => st, memory: true });
  st.m.set("k", "stored");
  assert.equal(q.get(), "stored", "storage first");
  q.set("mine");
  st.m.set("k", "theirs"); // another tab wrote it
  assert.equal(q.get(), "theirs", "storage before this page's copy");
  st.m.delete("k");
  assert.equal(q.get(), "mine", "the copy when storage has none");
});

test("a store with only the one method a caller needs works for that call (the tutorial's flag)", () => {
  let written: [string, string] | null = null;
  persisted("t", { store: () => ({ setItem: (k: string, v: string) => void (written = [k, v]) }) as unknown as KeyStore }).set("done");
  assert.deepEqual(written, ["t", "done"]);
  assert.equal(persisted("t", { store: () => ({ getItem: () => "done" }) as unknown as KeyStore }).get(), "done");
});

test("browserStorage is none where there is no localStorage, and none where reading it throws", () => {
  const g = globalThis as { localStorage?: unknown };
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    delete g.localStorage;
    assert.equal(browserStorage(), null);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    assert.equal(browserStorage(), null);
    const ok = fake();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: ok });
    assert.equal(browserStorage(), ok);
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete g.localStorage;
  }
});
