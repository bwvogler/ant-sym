import { test } from "node:test";
import assert from "node:assert/strict";
import { canResume, policyLock, shouldStart, type JevStatus } from "../policyLock.ts";

const server = { hasBackend: true, hasKey: true };
const caps = { capUsd: 0.1, capSeconds: 1800 };
const off: JevStatus = { phase: "off", run: null, lastError: null };
const running: JevStatus = { phase: "running", run: { stopReason: null, caps }, lastError: null };
const stopped = (
  stopReason: "user" | "spend-cap" | "time-cap" | "formed" | "budget" | null,
  lastError: string | null = null,
): JevStatus => ({ phase: "stopped", run: { stopReason, caps }, lastError });

test("policies can change whenever Jev could run: running, starting, idle, or after a time cap (PR #42 review S6)", () => {
  assert.equal(policyLock(server, running), null);
  assert.equal(policyLock(server, off), null, "never started: a change starts it");
  assert.equal(policyLock(server, off, true), null, "starting: the words are asked once it runs");
  assert.equal(policyLock(server, stopped("time-cap")), null, "a run that ran out of time: a change starts another");
  for (const [b, s] of [
    [null, running],
    [{ hasBackend: false, hasKey: false }, running],
    [{ hasBackend: true, hasKey: false }, running],
    [server, stopped("spend-cap")],
    [server, stopped("user")],
    [server, stopped(null, "boom")],
    [server, { phase: "off", run: null, lastError: "start failed (500)" }],
  ] as const)
    assert.notEqual(policyLock(b, s), null, JSON.stringify([b, s]));
});

test("each lock says why, and the cap reads in dollars", () => {
  assert.match(policyLock({ hasBackend: false, hasKey: false }, off)!, /No Jev server/);
  assert.match(policyLock({ hasBackend: true, hasKey: false }, off)!, /JEV_API_KEY/);
  assert.match(policyLock(server, stopped("spend-cap"))!, /\$0\.10/);
  assert.match(policyLock(server, stopped("user"))!, /Resume/);
  // The overall daily budget (PR #42 review S8): spent, nothing more is asked and the editors lock until tomorrow.
  const spent: JevStatus = {
    phase: "stopped",
    run: { stopReason: "budget", caps, budget: { day: "2026-11-07", usdPerDay: 0.1, spentUsd: 0.1, remainingUsd: 0 } },
    lastError: null,
  };
  assert.match(policyLock(server, spent)!, /daily budget \(\$0\.10\) is spent.*until tomorrow/);
  assert.equal(shouldStart(server, spent, false), false, "a spent budget starts no run");
  assert.match(policyLock(server, { phase: "off", run: null, lastError: "start failed (500)" })!, /start failed \(500\)/);
});

test("only a change of words starts Jev: never the page's load or a time cap by itself", () => {
  assert.equal(shouldStart(server, off, false), true, "a change, with no run yet");
  assert.equal(shouldStart(server, stopped("time-cap"), false), true, "a change after a run ran out of time");
  assert.equal(shouldStart(server, off, true), false, "not while a start is on the wire");
  assert.equal(shouldStart(server, running, false), false, "already running");
  assert.equal(
    shouldStart(server, { phase: "off", run: null, lastError: "start failed (500)" }, false),
    false,
    "a failed start waits for Resume",
  );
  assert.equal(shouldStart(server, stopped("spend-cap"), false), false);
  assert.equal(shouldStart(server, stopped("user"), false), false);
  assert.equal(shouldStart({ hasBackend: true, hasKey: false }, off, false), false);
  assert.equal(shouldStart({ hasBackend: false, hasKey: false }, off, false), false);
  assert.equal(shouldStart(null, off, false), false);
});

test("Resume is offered only where a run could start", () => {
  assert.equal(canResume(server, stopped("user"), false), true);
  assert.equal(canResume(server, stopped("spend-cap"), false), true, "a new run has its own cap");
  assert.equal(canResume(server, running, false), false);
  assert.equal(canResume(server, off, true), false);
  assert.equal(canResume({ hasBackend: true, hasKey: false }, off, false), false);
  assert.equal(canResume({ hasBackend: false, hasKey: false }, off, false), false);
});
