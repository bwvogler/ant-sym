import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ago,
  clearNotices,
  clearToasts,
  currentToasts,
  dismissToast,
  HOLD_MS,
  LOG_MAX,
  markNoticesRead,
  noticeLog,
  noticesOpen,
  pushToast,
  setNoticesOpen,
  SWIPE_PX,
  swipeOutcome,
  TAP_PX,
  toastPlace,
  unreadNotices,
} from "../toasts.ts";

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

test("every notice raised goes in the log, newest first, unread until the log is opened; dismissing keeps it there", () => {
  clearNotices();
  for (const t of [...currentToasts()]) dismissToast(t.id);
  const a = pushToast("first", "info", 1000);
  pushToast("first", "info", 2000); // still showing: not raised again, not logged again
  pushToast("second", "good", 3000);
  dismissToast(a);
  assert.deepEqual(
    noticeLog().map((n) => [n.text, n.tone, n.at, n.read]),
    [
      ["second", "good", 3000, false],
      ["first", "info", 1000, false],
    ],
  );
  assert.equal(unreadNotices(), 2);
  markNoticesRead();
  assert.equal(unreadNotices(), 0);
  // Raised again once it is gone from the field: a new entry.
  pushToast("first", "info", 4000);
  assert.equal(noticeLog().length, 3);
  assert.equal(unreadNotices(), 1);
  clearNotices();
  assert.equal(noticeLog().length, 0);
  assert.ok(currentToasts().length > 0, "clearing the log leaves the field's toasts");
});

test("the log keeps the newest LOG_MAX", () => {
  clearNotices();
  for (let k = 0; k < LOG_MAX + 5; k++) {
    const id = pushToast(`n${k}`);
    dismissToast(id);
  }
  assert.equal(noticeLog().length, LOG_MAX);
  assert.equal(noticeLog()[0]!.text, `n${LOG_MAX + 4}`);
});

test("a tap or a swipe past SWIPE_PX sideways or down dismisses; a small drag slides back", () => {
  assert.equal(swipeOutcome(0, 0), "dismiss", "a tap");
  assert.equal(swipeOutcome(TAP_PX, 0), "dismiss");
  assert.equal(swipeOutcome(SWIPE_PX, 0), "dismiss");
  assert.equal(swipeOutcome(-SWIPE_PX, 0), "dismiss");
  assert.equal(swipeOutcome(0, SWIPE_PX), "dismiss", "down");
  assert.equal(swipeOutcome(30, 0), "stay");
  assert.equal(swipeOutcome(0, -SWIPE_PX), "stay", "up is not a swipe away");
  assert.equal(swipeOutcome(0, 0, HOLD_MS), "stay", "a hold to read is not a tap (review of #219, N1)");
  assert.equal(swipeOutcome(0, 0, HOLD_MS - 1), "dismiss");
  assert.equal(swipeOutcome(SWIPE_PX, 0, 5 * HOLD_MS), "dismiss", "a slow swipe still swipes");
});

test("how long ago, in a few words", () => {
  assert.equal(ago(0, 10_000), "just now");
  assert.equal(ago(0, 5 * 60_000), "5 min ago");
  assert.equal(ago(0, 2 * 3_600_000), "2 h ago");
  assert.equal(ago(0, 44_000), "just now");
  assert.equal(ago(0, 46_000), "1 min ago");
  assert.equal(ago(0, 90 * 60_000), "2 h ago");
});

test("the bell's list open hides the field's toasts: a flag the toasts read", () => {
  assert.equal(noticesOpen(), false);
  setNoticesOpen(true);
  assert.equal(noticesOpen(), true);
  setNoticesOpen(false);
  assert.equal(noticesOpen(), false);
});

test("closing the list clears the field: its toasts go, the log keeps them (review of #219, N5)", () => {
  clearNotices();
  pushToast("seen in the list");
  assert.ok(currentToasts().length > 0);
  clearToasts();
  assert.equal(currentToasts().length, 0);
  assert.equal(noticeLog()[0]!.text, "seen in the list");
});

test("where notices sit: the builder's tray and the Lab's workbench keep their places, and a phone's open sheet is not covered (review of #182, N10)", () => {
  const at = (building: boolean, drawer: boolean, lab: boolean) => toastPlace({ building, drawer, lab });
  assert.equal(at(false, false, false), "bottom");
  assert.equal(at(false, false, true), "lab");
  assert.equal(at(false, true, false), "sheet", "an open drawer: unseen on a phone (they wait in the bell), the bottom's place from sm up");
  assert.equal(at(false, true, true), "sheet-lab");
  for (const drawer of [false, true])
    for (const lab of [false, true]) assert.equal(at(true, drawer, lab), "top", "building: always under the HUD");
});
