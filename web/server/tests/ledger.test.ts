import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, RESERVE_TOKENS, percentile, type Timer } from "../ledger.ts";

/** A timer driven by hand. */
function fakeTimer() {
  const set: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const timer: Timer = {
    set: (fn, ms) => {
      set.push({ fn, ms, cleared: false });
      return set.length - 1;
    },
    clear: (h) => {
      if (typeof h === "number" && set[h]) (set[h] as { cleared: boolean }).cleared = true;
    },
  };
  return { timer, set };
}
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

test("the spend cap is reachable: no room for one more call with nothing in flight is the cap, not busy", () => {
  // Round 2 (PR #1): a reservation that only ever says "busy" leaves the run
  // running forever with the last reservation's worth unspendable.
  const reserveUsd = RESERVE_TOKENS * USD_PER_INPUT_TOKEN; // $0.002688
  const l = new Ledger();
  l.start({ capUsd: 0.001, capSeconds: 600 }, 0); // below one reservation
  assert.deepEqual(l.admit(1), { ok: false, reason: "spend-cap" });
  assert.equal(l.running, false);
  assert.equal(l.summary(1).stopReason, "spend-cap");

  const m = new Ledger();
  m.start({ capUsd: reserveUsd * 1.2, capSeconds: 600 }, 0);
  assert.deepEqual(m.admit(1), { ok: true });
  const t = m.begin();
  assert.deepEqual(m.admit(2), { ok: false, reason: "busy" }, "one in flight: wait, it may still fit");
  m.end(t, { status: 200, ms: 10, inputTokens: 40_000 }); // $0.00168 spent; the reservation shrinks to 60k ($0.00252)
  assert.equal(m.reserveTokens, 60_000);
  assert.deepEqual(m.admit(3), { ok: false, reason: "spend-cap" }, "nothing in flight and no room: that is the cap");
  assert.equal(m.running, false);
  assert.equal(m.summary(3).stopReason, "spend-cap");
});

test("the reservation shrinks to 1.5× the largest request seen, never above the context limit", () => {
  const l = new Ledger();
  l.start({ capUsd: 0.01, capSeconds: 600 }, 0);
  assert.equal(l.reserveTokens, RESERVE_TOKENS);
  l.end(l.begin(), { status: 200, ms: 1, inputTokens: 2_000 });
  assert.equal(l.reserveTokens, 3_000);
  l.end(l.begin(), { status: 200, ms: 1, inputTokens: 50_000 });
  assert.equal(l.reserveTokens, RESERVE_TOKENS);
  // $0.01 cap at ~400 tokens a call: admitted until the real spend reaches the cap, not $0.0027 short of it
  const n = new Ledger();
  n.start({ capUsd: 0.01, capSeconds: 600 }, 0);
  let admitted = 0;
  for (let i = 0; i < 1000 && n.admit(i).ok; i++) {
    n.end(n.begin(), { status: 200, ms: 1, inputTokens: 400 });
    admitted++;
  }
  assert.ok(admitted >= 590, `admitted ${admitted}`); // $0.01 / (400 × $0.042/M) = 595, minus the last reservation
  assert.equal(n.summary(1000).stopReason, "spend-cap");
  const custom = new Ledger({ reserveTokens: 0 });
  custom.start({}, 0);
  custom.end(custom.begin(), { status: 200, ms: 1, inputTokens: 2_000 });
  assert.equal(custom.reserveTokens, 0, "a zero reservation stays zero");
});

test("the time cap fires from a timer, not only on the next admit; stop and a new start clear it", () => {
  const { timer, set } = fakeTimer();
  const l = new Ledger({ timer, reserveTokens: 0 });
  l.start({ capSeconds: 2 }, 1000);
  assert.equal(set.length, 1);
  assert.equal(set[0]?.ms, 2000);
  const signal = l.signal;
  const t = l.begin();
  set[0]?.fn();
  const s = l.summary(3500);
  assert.equal(s.running, false);
  assert.equal(s.stopReason, "time-cap");
  assert.equal(s.stoppedAt, 3000);
  assert.equal(s.elapsedSeconds, 2);
  assert.equal(signal.aborted, true, "calls in flight are told");
  l.end(t, { status: 0, ms: 0, inputTokens: 0, aborted: true });
  assert.equal(l.summary(3500).aborted, 1);
  // stop clears the timer; a new start arms a fresh one
  l.start({ capSeconds: 5 }, 4000);
  assert.equal(set.length, 2);
  l.stop("user", 4100);
  assert.equal(set[1]?.cleared, true);
  l.start({ capSeconds: 5 }, 5000);
  l.start({ capSeconds: 5 }, 6000);
  assert.equal(set[2]?.cleared, true, "a restart clears the previous run's timer");
  assert.equal(set.length, 4);
});

test("aborted calls are counted apart: not a request, no status, no latency, no cost", () => {
  const l = new Ledger({ reserveTokens: 0 });
  l.start({}, 0);
  const a = l.begin();
  const b = l.begin();
  l.end(a, { status: 200, ms: 300, inputTokens: 1000 });
  l.end(b, { status: 0, ms: 0, inputTokens: 0, aborted: true });
  const s = l.summary(1);
  assert.equal(s.requests, 1);
  assert.equal(s.aborted, 1);
  assert.equal(s.inFlight, 0);
  assert.equal(s.medianMs, 300, "a cut-off call does not drag the median to 0");
  assert.deepEqual(s.statuses, { "200": 1 });
  assert.equal(s.inputTokens, 1000);
});
