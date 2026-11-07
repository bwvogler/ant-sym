import { test } from "node:test";
import assert from "node:assert/strict";
import { canResume, policyLock, shouldStart, type JevStatus } from "../policyLock.ts";

const server = { hasBackend: true, hasKey: true };
const caps = { capUsd: 0.1, capSeconds: 1800 };
const off: JevStatus = { phase: "off", run: null, lastError: null };
const running: JevStatus = { phase: "running", run: { stopReason: null, caps }, lastError: null };
const stopped = (stopReason: "user" | "spend-cap" | "time-cap" | "formed" | null, lastError: string | null = null): JevStatus => ({ phase: "stopped", run: { stopReason, caps }, lastError });

test("policies can change only while Jev runs", () => {
  assert.equal(policyLock(server, running), null);
  for (const [b, s] of [
    [null, running],
    [{ hasBackend: false, hasKey: false }, running],
    [{ hasBackend: true, hasKey: false }, running],
    [server, off],
    [server, stopped("spend-cap")],
    [server, stopped("user")],
    [server, stopped("time-cap")],
    [server, stopped(null, "boom")],
  ] as const)
    assert.notEqual(policyLock(b, s), null, JSON.stringify([b, s]));
});

test("each lock says why, and the cap reads in dollars", () => {
  assert.match(policyLock({ hasBackend: false, hasKey: false }, off)!, /No Jev server/);
  assert.match(policyLock({ hasBackend: true, hasKey: false }, off)!, /JEV_API_KEY/);
  assert.match(policyLock(server, stopped("spend-cap"))!, /\$0\.10/);
  assert.match(policyLock(server, stopped("user"))!, /Resume/);
  assert.match(policyLock(server, off, true)!, /Starting/);
  assert.match(policyLock(server, { phase: "off", run: null, lastError: "start failed (500)" })!, /start failed \(500\)/);
});

test("the page starts Jev once, and again only after a time cap", () => {
  assert.equal(shouldStart(server, off, false, false), true);
  assert.equal(shouldStart(server, off, true, false), false, "a failed start waits for Resume");
  assert.equal(shouldStart(server, off, false, true), false, "not while a start is on the wire");
  assert.equal(shouldStart(server, stopped("time-cap"), true, false), true);
  assert.equal(shouldStart(server, stopped("spend-cap"), true, false), false);
  assert.equal(shouldStart(server, stopped("user"), true, false), false);
  assert.equal(shouldStart(server, running, true, false), false);
  assert.equal(shouldStart({ hasBackend: true, hasKey: false }, off, false, false), false);
  assert.equal(shouldStart({ hasBackend: false, hasKey: false }, off, false, false), false);
  assert.equal(shouldStart(null, off, false, false), false);
});

test("Resume is offered only where a run could start", () => {
  assert.equal(canResume(server, stopped("user"), false), true);
  assert.equal(canResume(server, stopped("spend-cap"), false), true, "a new run has its own cap");
  assert.equal(canResume(server, running, false), false);
  assert.equal(canResume(server, off, true), false);
  assert.equal(canResume({ hasBackend: true, hasKey: false }, off, false), false);
  assert.equal(canResume({ hasBackend: false, hasKey: false }, off, false), false);
});
