import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, Selection } from "../store.ts";

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
  s.update((n) => n + 1);
  assert.equal(s.get(), 11);
  const heard: string[] = [];
  const stop = s.subscribe(() => {
    heard.push("a");
    stop();
  });
  s.subscribe(() => heard.push("b"));
  s.set(12);
  s.set(13);
  assert.deepEqual(heard, ["a", "b", "b"]);
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

test("a selection keeps its value while the source, the selector and (by eq) the result hold", () => {
  const sel = new Selection<{ a: number; b: number[] }, number[]>();
  const src = { a: 1, b: [1, 2] };
  const pick = (s: { a: number; b: number[] }) => s.b.map((x) => x * s.a);
  const first = sel.read(src, pick);
  assert.equal(sel.read(src, pick), first, "the same source and selector: not run again");
  const same = { a: 1, b: [1, 2] };
  const eq = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  assert.notEqual(sel.read(same, pick), first, "without eq a new source gives a new array");
  const kept = sel.read({ a: 1, b: [1, 2] }, pick, eq);
  assert.equal(sel.read({ a: 1, b: [1, 2] }, pick, eq), kept, "with eq the array is kept while it holds");
  assert.notEqual(sel.read({ a: 2, b: [1, 2] }, pick, eq), kept, "a changed result is a new value");
  const fixed = { a: 3, b: [1] };
  assert.deepEqual(sel.read(fixed, pick), [3]);
  assert.deepEqual(
    sel.read(fixed, (s) => [s.a]),
    [3],
    "a new selector on the same source is run",
  );
  assert.deepEqual(
    sel.read(fixed, () => [9]),
    [9],
    "and its result is the one given back",
  );
});
