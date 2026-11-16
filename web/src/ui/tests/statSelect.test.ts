import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chapterNameOf,
  evolutionOf,
  flightInAir,
  outcomeOf,
  simTime,
  situationsSeenOf,
  slowPace,
  sameList,
  sameRecord,
  StatSelection,
  tickGate,
  wholeStats,
} from "../statSelect.ts";
import { statsOf } from "../stats.ts";
import { buildGame, DEFAULT_COLONY_CONTROLS } from "../useColony.ts";
import type { ColonyStats } from "../stats.ts";

// A slice of the stats for a component (ja-fnd.6.1 part 2): what StatSelection keeps between ticks, and the selectors the page shares.

const SETTINGS = { species: DEFAULT_COLONY_CONTROLS.species, seed: 1, antCount: 8, rival: true, generation: 0 };

/** A loop whose stats a test sets by hand. */
function fakeLoop(first: ColonyStats | null = null) {
  let stats = first;
  const subs = new Set<() => void>();
  return {
    stats: () => stats,
    subscribe: (fn: () => void) => (subs.add(fn), () => void subs.delete(fn)),
    set(s: ColonyStats | null) {
      stats = s;
      for (const fn of subs) fn();
    },
    subs,
  };
}

/** Stats from a real game: a fresh object each call, with `over` laid on. */
function stats(over: Partial<ColonyStats> = {}): ColonyStats {
  const game = buildGame(SETTINGS);
  return { ...statsOf(game, 0, 4), ...over };
}

test("a selection gives the same value until the stats change, and runs the selector once for the same stats", () => {
  const a = stats();
  const loop = fakeLoop(a);
  const sel = new StatSelection<number>(loop);
  let runs = 0;
  const select = (s: ColonyStats | null) => (runs++, s?.time ?? 0);
  assert.equal(sel.read(select), a.time);
  sel.read(select);
  sel.read(select);
  assert.equal(runs, 1, "the same stats and selector: kept");
  loop.set({ ...a, time: a.time + 1 });
  assert.equal(sel.read(select), a.time + 1);
  assert.equal(runs, 2);
});

test("a result that is equal to the last one is the last one: an object a selector builds anew each time does not change the snapshot", () => {
  const loop = fakeLoop(stats({ time: 1 }));
  const sel = new StatSelection<{ n: number }>(loop);
  const select = (s: ColonyStats | null) => ({ n: s?.counts.explore ?? 0 });
  const eq = (a: { n: number }, b: { n: number }) => a.n === b.n;
  const first = sel.read(select, eq);
  loop.set({ ...loop.stats()!, time: 2 }); // other stats changed, this slice did not
  assert.equal(sel.read(select, eq), first, "the same object");
  assert.equal(
    sel.read(select, eq),
    first,
    "and again on the same stats: what was handed out is what is kept (getSnapshot must not change)",
  );
  loop.set({ ...loop.stats()!, counts: { ...loop.stats()!.counts, explore: 99 } });
  const next = sel.read(select, eq);
  assert.notEqual(next, first);
  assert.equal(next.n, 99);
  // without eq, an object per call is a change each time (Object.is)
  const sel2 = new StatSelection<{ n: number }>(loop);
  const a = sel2.read(select);
  loop.set({ ...loop.stats()! });
  assert.notEqual(sel2.read(select), a);
});

test("a selector that changes between renders is run again on the same stats, and its result kept while it is equal", () => {
  const loop = fakeLoop(stats({ time: 5, pace: 4 }));
  const sel = new StatSelection<number | null>(loop);
  const slow = (speed: number) => (s: ColonyStats | null) => slowPace(s, true, speed);
  assert.equal(sel.read(slow(4)), null, "4× asked, 4 managed");
  assert.equal(sel.read(slow(8)), 4, "8× asked: slow");
  assert.equal(sel.read(slow(8)), 4);
  assert.equal(sel.read(slow(4)), null, "back");
});

test("a selection is told what the loop tells: subscribe is the loop's, and an unsubscribe is its too", () => {
  const loop = fakeLoop(stats());
  const sel = new StatSelection<number>(loop);
  let told = 0;
  const off = sel.subscribe(() => told++);
  loop.set(stats());
  assert.equal(told, 1);
  off();
  loop.set(stats());
  assert.equal(told, 1);
  assert.equal(loop.subs.size, 0);
});

test("the selectors read the stats, and cope with none yet", () => {
  assert.equal(wholeStats(null), null);
  assert.equal(simTime(null), 0);
  assert.equal(flightInAir(null), false);
  assert.equal(outcomeOf(null), "playing");
  assert.equal(chapterNameOf(null), undefined);
  assert.equal(evolutionOf(null), null);
  assert.equal(situationsSeenOf(null), null);
  assert.equal(slowPace(null, true, 4), null);
  const s = stats({ time: 12.5, flights: 2, outcome: "unified", situationsSeen: 7 });
  assert.equal(wholeStats(s), s);
  assert.equal(simTime(s), 12.5);
  assert.equal(flightInAir(s), true);
  assert.equal(flightInAir({ ...s, flights: 0 }), false);
  assert.equal(outcomeOf(s), "unified");
  assert.equal(chapterNameOf(s), s.chapter.chapter);
  assert.equal(evolutionOf(s), s.evolution);
  assert.equal(situationsSeenOf(s), 7);
});

test("slowPace: only while playing, only when the pace is measured and under 85% of the speed asked", () => {
  const s = (pace: number) => stats({ pace });
  assert.equal(slowPace(s(3), true, 4), 3, "3 of 4: slow");
  assert.equal(slowPace(s(3.4), true, 4), null, "exactly 85%: not slow");
  assert.equal(slowPace(s(3.39), true, 4), 3.39);
  assert.equal(slowPace(s(3), false, 4), null, "paused");
  assert.equal(slowPace(s(0), true, 4), null, "no pace measured yet");
});

test("a read of game state the stats don't hold (useGameRead): run on each new stats, the same value while it is equal", () => {
  const loop = fakeLoop(stats({ time: 1 }));
  const sel = new StatSelection<boolean[]>(loop);
  const game = { revealed: [false, false] };
  const read = () => [...game.revealed]; // a new list each call: the list's own equality keeps it
  const first = sel.read(read, sameList);
  loop.set({ ...loop.stats()!, time: 2 });
  assert.equal(sel.read(read, sameList), first, "nothing changed: the same list");
  game.revealed[1] = true; // a tick sets it; the next stats are taken
  assert.equal(sel.read(read, sameList), first, "not before the stats are: the game is read on a tick");
  loop.set({ ...loop.stats()!, time: 3 });
  const next = sel.read(read, sameList);
  assert.notEqual(next, first);
  assert.deepEqual(next, [false, true]);
});

test("sameList and sameRecord: by items, in order, and by keys and values (NaN is itself)", () => {
  assert.ok(sameList([1, 2], [1, 2]));
  assert.ok(!sameList([1, 2], [2, 1]));
  assert.ok(!sameList([1], [1, 2]));
  assert.ok(sameList([NaN], [NaN]));
  assert.ok(sameRecord({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(!sameRecord({ a: 1 }, { a: 2 }));
  assert.ok(!sameRecord({ a: 1 }, { a: 1, b: 2 }));
  assert.ok(!sameRecord({ a: 1, b: 2 }, { a: 1 }), "a key the other lacks");
  assert.ok(!sameRecord({ a: undefined }, { b: undefined }), "the same count of keys, not the same keys");
  assert.ok(sameRecord(null, null));
  assert.ok(!sameRecord(null, {}));
  assert.ok(!sameRecord({}, null));
});

test("tickGate lets the first tick through, then one every `everyMs` of its clock and no more", () => {
  let now = 1000;
  const pass = tickGate(250, () => now);
  assert.equal(pass(), true, "the first");
  now += 150;
  assert.equal(pass(), false, "150 ms on: too soon");
  now += 99;
  assert.equal(pass(), false, "249 ms since the last that passed");
  now += 1;
  assert.equal(pass(), true, "250 ms");
  now += 100;
  assert.equal(pass(), false, "counted from the one that passed, not from the ones refused");
  now += 150;
  assert.equal(pass(), true);
  assert.equal(tickGate(0, () => 5)(), true, "no spacing: every tick");
});
