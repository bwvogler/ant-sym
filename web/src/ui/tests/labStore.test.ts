import { test } from "node:test";
import assert from "node:assert/strict";
import { closeLab, labTarget, openLab, toggleLab } from "../labStore.ts";
import { closeLearn, learnTarget, openLearn } from "../learn.ts";

// Lab mode's store (PRD §69.8): l toggles it at History; a "?" on the policy opens its Policy tab instead of the Codex.

test("l opens the Lab at History and closes it again", () => {
  closeLab();
  toggleLab();
  assert.deepEqual(labTarget(), { tab: "history" });
  toggleLab();
  assert.equal(labTarget(), null);
});

test("a “?” on the policy opens the Lab's Policy tab at its section, and closes the Codex that would cover it", () => {
  closeLab();
  openLearn({ tab: "guide", id: "trail-food" });
  openLearn({ tab: "policy", id: "fungus" });
  assert.equal(learnTarget(), null, "the Codex is closed");
  assert.deepEqual(labTarget(), { tab: "policy", id: "fungus" });
  const first = labTarget();
  openLearn({ tab: "policy", id: "fungus" });
  assert.notEqual(labTarget(), first, "pressed again: a new target, so its section opens again");
  openLearn({ tab: "nest" });
  assert.deepEqual(learnTarget(), { tab: "nest" }, "the Codex's own tabs still open the Codex");
  assert.deepEqual(labTarget(), { tab: "policy", id: "fungus" }, "and leave the Lab as it was");
  closeLearn();
  openLab({ tab: "levers" });
  assert.deepEqual(labTarget(), { tab: "levers" });
  closeLab();
});
