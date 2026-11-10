import { test } from "node:test";
import assert from "node:assert/strict";
import { currentToasts, dismissToast, pushToast } from "../toasts.ts";

test("a notice is raised once while it shows, at most three show, and one can be dismissed", () => {
  const a = pushToast("Jev stopped");
  assert.equal(pushToast("Jev stopped"), a, "the same text is not raised twice");
  pushToast("b");
  pushToast("c");
  pushToast("d", "warn");
  assert.deepEqual(
    currentToasts().map((t) => t.text),
    ["b", "c", "d"],
    "the oldest goes first",
  );
  dismissToast(currentToasts()[0]!.id);
  assert.deepEqual(
    currentToasts().map((t) => t.text),
    ["c", "d"],
  );
});
