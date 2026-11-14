import { test } from "node:test";
import assert from "node:assert/strict";
import { type Command, rank, wordScore } from "../commands.ts";

// The command palette's matching (PRD §69.3).

const C = (label: string, group = "Panels", words?: string): Command => ({ id: label, label, group, ...(words ? { words } : {}) });
const list = [
  C("Play"),
  C("Speed 8×", "Game"),
  C("Mutations", "Panels", "evolve body upgrades"),
  C("The fungus"),
  C("Learn: Food trail", "Learn"),
  C("Learn: Home trail", "Learn"),
  C("Go to Amber's nest", "Map"),
];
const labels = (q: string) => rank(list, q).map((c) => c.label);

test("a word's score: its start, a word's start in it, inside it, its letters in order", () => {
  assert.equal(wordScore("Mutations", "mut"), 4);
  assert.equal(wordScore("The fungus", "fun"), 3);
  assert.equal(wordScore("Learn: Food trail", "food"), 3, "after a colon and a space");
  assert.equal(wordScore("Mutations", "tat"), 2);
  assert.equal(wordScore("Mutations", "mtn"), 1);
  assert.equal(wordScore("Mutations", "z"), 0);
});

test("an empty query lists everything in order", () => {
  assert.deepEqual(
    labels(""),
    list.map((c) => c.label),
  );
  assert.deepEqual(
    labels("   "),
    list.map((c) => c.label),
  );
});

test("the best match first; a label match beats the group's or the extra words'", () => {
  assert.equal(labels("mut")[0], "Mutations");
  assert.equal(labels("evolve")[0], "Mutations", "the extra words find it");
  assert.equal(labels("trail")[0], "Learn: Food trail", "ties keep the given order");
  assert.deepEqual(labels("home trail"), ["Learn: Home trail"], "every word must match");
  assert.deepEqual(labels("learn"), ["Learn: Food trail", "Learn: Home trail"]);
});

test("nothing matches: nothing listed", () => {
  assert.deepEqual(labels("zebra"), []);
});

test("letters in order still find a command, below a real match", () => {
  const r = labels("amb");
  assert.equal(r[0], "Go to Amber's nest");
});

test("a match in the label outranks the same match in the extra words, whatever the order", () => {
  const two = [C("Mutations", "Speed"), C("Speed 8×", "Game")]; // "speed" starts both: the group's and the label
  assert.deepEqual(
    rank(two, "speed").map((c) => c.label),
    ["Speed 8×", "Mutations"],
  );
});
