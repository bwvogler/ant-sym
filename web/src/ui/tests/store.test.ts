import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../store.ts";

// The page's store pattern (ja-fnd.6.1.1): what the Lab's, the Codex's and the lens's hand-written stores each did, once.

test("a set tells every listener, once, with the new value to read; a stopped listener hears no more", () => {
  const s = createStore(1);
  const heard: number[] = [];
  const stop = s.subscribe(() => heard.push(s.get()));
  const other: number[] = [];
  s.subscribe(() => other.push(s.get()));
  s.set(2);
  s.set(3);
  stop();
  s.set(4);
  assert.deepEqual(heard, [2, 3]);
  assert.deepEqual(other, [2, 3, 4]);
});

test("without `equal` a set of an equal value still tells (the Lab: a “?” pressed again opens its section again)", () => {
  const s = createStore<{ tab: string } | null>(null);
  let told = 0;
  s.subscribe(() => told++);
  s.set({ tab: "policy" });
  s.set({ tab: "policy" });
  s.set(null);
  s.set(null);
  assert.equal(told, 4);
});

test("with `equal` a set it calls the same changes nothing and tells nobody; the value held stays the first one", () => {
  const first = { n: 1 };
  const s = createStore(first, { equal: (a, b) => a.n === b.n });
  let told = 0;
  s.subscribe(() => told++);
  s.set({ n: 1 });
  assert.equal(told, 0);
  assert.equal(s.get(), first, "the object held is the one it was");
  s.set({ n: 2 });
  assert.equal(told, 1);
});

test("update reads the value held, and a listener that stops itself while it is told does not skip the next", () => {
  const s = createStore(10);
  s.set(20);
  s.update((n) => n + 1);
  assert.equal(s.get(), 21);
  const heard: string[] = [];
  const stop = s.subscribe(() => {
    heard.push("a");
    stop();
  });
  s.subscribe(() => heard.push("b"));
  s.set(22);
  s.set(23);
  assert.deepEqual(heard, ["a", "b", "b"]);
});

test("a set tells the listeners as they stood when it began: one that stops another, or joins, waits for the next set", () => {
  const s = createStore(0);
  const heard: string[] = [];
  let stopB = () => {};
  s.subscribe(() => {
    heard.push("A");
    stopB();
    s.subscribe(() => heard.push("C"));
  });
  stopB = s.subscribe(() => heard.push("B"));
  s.set(1);
  assert.deepEqual(heard, ["A", "B"], "B was listening when the set began; C was not");
});

test("reset goes back to the starting value and tells (a test's own store outlives it)", () => {
  const s = createStore("start");
  s.set("later");
  let told = 0;
  s.subscribe(() => told++);
  s.reset();
  assert.equal(s.get(), "start");
  assert.equal(told, 1);
});
