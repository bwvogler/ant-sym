import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, RESERVE_TOKENS, percentile } from "../ledger.ts";
import { USD_PER_INPUT_TOKEN } from "../../shared/jev.ts";

test("cost is real tokens × price, and the spend cap stops the run", () => {
  const l = new Ledger({ reserveTokens: 0 });
  l.start({ capUsd: 0.001, capSeconds: 600 }, 1000);
  assert.deepEqual(l.admit(1000), { ok: true });
  l.end(l.begin(), { status: 200, ms: 300, inputTokens: 20_000 }); // $0.00084
  assert.ok(Math.abs(l.usd - 20_000 * USD_PER_INPUT_TOKEN) < 1e-12);
  assert.deepEqual(l.admit(2000), { ok: true });
  l.end(l.begin(), { status: 200, ms: 300, inputTokens: 5_000 }); // $0.00105 ≥ cap
  assert.deepEqual(l.admit(3000), { ok: false, reason: "spend-cap" });
  const s = l.summary(3000);
  assert.equal(s.running, false);
  assert.equal(s.stopReason, "spend-cap");
  assert.equal(s.requests, 2);
  assert.equal(s.inputTokens, 25_000);
  assert.equal(s.remainingUsd, 0);
  assert.equal(s.elapsedSeconds, 2);
});

test("the time cap stops the run; a stopped run admits nothing; start resets", () => {
  const l = new Ledger();
  l.start({ capSeconds: 10 }, 0);
  assert.deepEqual(l.admit(9_999), { ok: true });
  assert.deepEqual(l.admit(10_000), { ok: false, reason: "time-cap" });
  assert.deepEqual(l.admit(10_001), { ok: false, reason: "not-running" });
  assert.equal(l.summary(50_000).elapsedSeconds, 10);
  l.start({}, 60_000);
  const s = l.summary(60_000);
  assert.equal(s.running, true);
  assert.equal(s.requests, 0);
  assert.equal(s.caps.capUsd, 0.5);
  assert.equal(s.caps.capSeconds, 180);
});

test("caps are clamped and junk falls back to defaults", () => {
  const l = new Ledger();
  const s = l.start({ capUsd: 1e9, capSeconds: Number.NaN }, 0);
  assert.equal(s.caps.capUsd, 100);
  assert.equal(s.caps.capSeconds, 180);
});

test("in-flight calls reserve their worst case against the cap, and the pool has a ceiling", () => {
  const reserveUsd = RESERVE_TOKENS * USD_PER_INPUT_TOKEN; // $0.002688
  const l = new Ledger({ maxInFlight: 3 });
  l.start({ capUsd: reserveUsd * 2.5, capSeconds: 600 }, 0);
  assert.deepEqual(l.admit(1), { ok: true });
  const t1 = l.begin();
  assert.deepEqual(l.admit(2), { ok: true });
  const t2 = l.begin();
  // a third call would reserve 3× the worst case, past the cap: refused as busy, run still running
  assert.deepEqual(l.admit(3), { ok: false, reason: "busy" });
  assert.equal(l.running, true);
  l.end(t1, { status: 200, ms: 10, inputTokens: 1000 });
  assert.deepEqual(l.admit(4), { ok: true });
  l.begin();
  l.end(t2, { status: 200, ms: 10, inputTokens: 1000 });
  // pool ceiling: 3 in flight is the most, whatever the cap
  const wide = new Ledger({ maxInFlight: 3, reserveTokens: 0 });
  wide.start({ capUsd: 100 }, 0);
  wide.begin();
  wide.begin();
  wide.begin();
  assert.deepEqual(wide.admit(1), { ok: false, reason: "busy" });
});

test("stop aborts the run's signal; start aborts the previous run and ignores its late tokens", () => {
  const l = new Ledger({ reserveTokens: 0 });
  l.start({}, 0);
  const s1 = l.signal;
  const old = l.begin();
  assert.equal(s1.aborted, false);
  l.stop("user", 10);
  assert.equal(s1.aborted, true);
  l.start({}, 20);
  assert.notEqual(l.signal, s1);
  assert.equal(l.signal.aborted, false);
  const s2 = l.signal;
  l.end(old, { status: 200, ms: 5, inputTokens: 50_000 }); // from run 1: ignored
  const s = l.summary(21);
  assert.equal(s.requests, 0);
  assert.equal(s.inputTokens, 0);
  assert.equal(s.inFlight, 0);
  l.start({}, 30); // a new start aborts whatever run 2 had out
  assert.equal(s2.aborted, true);
});

test("latency percentiles, status counts and in-flight tracking", () => {
  const l = new Ledger({ reserveTokens: 0 });
  l.start({}, 0);
  for (const ms of [100, 200, 300, 400, 500]) {
    l.end(l.begin(), { status: ms === 500 ? 429 : 200, ms, inputTokens: 1 });
  }
  l.begin();
  const s = l.summary(1);
  assert.equal(s.medianMs, 300);
  assert.equal(s.p90Ms, 500);
  assert.equal(s.inFlight, 1);
  assert.deepEqual(s.statuses, { "200": 4, "429": 1 });
  assert.equal(percentile([], 0.5), null);
});
