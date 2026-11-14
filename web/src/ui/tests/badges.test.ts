import { test } from "node:test";
import assert from "node:assert/strict";
import { INFECTED, type Colony, type Fungus } from "../../colony/index.ts";
import { antTag, badgeParts, nestBadge } from "../badges.ts";

// The map's words over each nest and by the followed ant (PRD §69.2).

const fungus = (infected: number, living: number) => ({ census: () => ({ infected, living }) }) as unknown as Fungus;
const colony = (queen: { alive: boolean; load: number } | null, mode: number[] = []) =>
  ({ queen, mode: Uint8Array.from(mode) }) as unknown as Colony;

test("a nest's badge: its name, the fungus's share only once it is in, and its queen", () => {
  assert.deepEqual(nestBadge(colony({ alive: true, load: 0 }), 0, fungus(0, 300)), { name: "Ink", infected: null, queen: "clean" });
  assert.deepEqual(nestBadge(colony({ alive: true, load: INFECTED }), 1, fungus(30, 300)), {
    name: "Amber",
    infected: 0.1,
    queen: "infected",
  });
  assert.equal(nestBadge(colony({ alive: false, load: 0.5 }), 0, fungus(3, 100)).queen, "lost", "a dead queen is lost, carrier or not");
  assert.equal(nestBadge(colony({ alive: true, load: INFECTED / 2 }), 0, fungus(3, 100)).queen, "clean", "a trace under INFECTED is clean");
  assert.equal(nestBadge(colony(null), 0, fungus(0, 0)).queen, null, "no queen at all");
  assert.equal(nestBadge(colony(null), 0, fungus(4, 0)).infected, null, "no living ants: no share");
});

test("its parts: the share as a percent (at least 1 once any ant carries it), the queen as a crown or a warning", () => {
  assert.deepEqual(badgeParts({ name: "Ink", infected: null, queen: "clean" }), [
    { text: "Ink", tone: "ink" },
    { text: "♛", tone: "dim" },
  ]);
  assert.deepEqual(badgeParts({ name: "Amber", infected: 0.001, queen: "infected" }), [
    { text: "Amber", tone: "ink" },
    { text: "1%", tone: "spore" },
    { text: "♛", tone: "spore" },
  ]);
  assert.deepEqual(badgeParts({ name: "Jade", infected: 0.426, queen: "lost" }).slice(1), [
    { text: "43%", tone: "spore" },
    { text: "no queen", tone: "warn" },
  ]);
  assert.deepEqual(badgeParts({ name: "Rust", infected: null, queen: null }), [{ text: "Rust", tone: "ink" }]);
});

test("the followed ant's tag: its number and its mode", () => {
  const c = colony(null, [2, 3, 0, 1]); // shuffled, so a tag read by the ant's index rather than its mode fails
  assert.equal(antTag(c, 1), "#1 · fight");
  assert.equal(antTag(c, 3), "#3 · follow");
});
