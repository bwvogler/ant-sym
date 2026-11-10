import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, RESERVE_TOKENS, percentile, reserveForBytes, type Timer } from "../ledger.ts";

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
  assert.equal(s.caps.capUsd, 0.1);
  assert.equal(s.caps.capSeconds, 1800);
});

test("caps are clamped and junk falls back to defaults", () => {
  const l = new Ledger();
  const s = l.start({ capUsd: 1e9, capSeconds: Number.NaN }, 0);
  assert.equal(s.caps.capUsd, 100);
  assert.equal(s.caps.capSeconds, 1800);
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
  m.end(t, { status: 200, ms: 10, inputTokens: 40_000 }); // $0.00168 spent; one more unknown-size call would pass the cap
  assert.deepEqual(m.admit(3), { ok: false, reason: "spend-cap" }, "nothing in flight and no room: that is the cap");
  assert.equal(m.running, false);
  assert.equal(m.summary(3).stopReason, "spend-cap");
});

test("each call reserves from its own size: a big call cannot hide under a small one's room, and a small cap is spent to the end", () => {
  // Round 3 (PR #1): a reservation shrunk to "1.5× the largest reply seen"
  // let 5 × 60k-token calls in under a 1k-token reply's room (+26 % overspend).
  const l = new Ledger();
  l.start({ capUsd: 0.01, capSeconds: 600 }, 0);
  const small = reserveForBytes(1500); // 1000 tokens
  assert.equal(small, 1000);
  assert.deepEqual(l.admit(1, small), { ok: true });
  l.end(l.begin(small), { status: 200, ms: 1, inputTokens: 1000 });
  const big = reserveForBytes(90_000); // 60k tokens, $0.00252 each
  const tokens: ReturnType<Ledger["begin"]>[] = [];
  let admitted = 0;
  for (let k = 0; k < 6; k++) {
    if (!l.admit(2 + k, big).ok) break;
    tokens.push(l.begin(big));
    admitted++;
  }
  assert.equal(admitted, 3, "3 × $0.00252 + $0.000042 fits under $0.01, a 4th would not");
  assert.deepEqual(l.admit(9, big), { ok: false, reason: "busy" }, "with calls in flight: wait");
  for (const t of tokens) l.end(t, { status: 200, ms: 1, inputTokens: 60_000 });
  assert.ok(l.usd <= 0.01, `never past the cap: $${l.usd}`);
  // nothing in flight and no room for one more big call: the cap
  assert.deepEqual(l.admit(10, big), { ok: false, reason: "spend-cap" });
  // a stream of small calls spends a $0.01 cap to within one small reservation
  const n = new Ledger();
  n.start({ capUsd: 0.01, capSeconds: 600 }, 0);
  const tiny = reserveForBytes(800); // 534 tokens reserved for a 400-token call
  let count = 0;
  for (let k = 0; k < 1000 && n.admit(k, tiny).ok; k++) {
    n.end(n.begin(tiny), { status: 200, ms: 1, inputTokens: 400 });
    count++;
  }
  assert.ok(count >= 590, `admitted ${count}`); // $0.01 / (400 × $0.042/M) = 595
  assert.equal(n.summary(1000).stopReason, "spend-cap");
  // the ceiling: an unknown size reserves the context limit; a huge hint is capped at it; a zero reserve option stays zero
  assert.equal(l.reserveFor(), RESERVE_TOKENS);
  assert.equal(reserveForBytes(10_000_000), RESERVE_TOKENS);
  assert.equal(new Ledger({ reserveTokens: 0 }).reserveFor(5000), 0);
});

test("tokens are summed across runs: a reply from a replaced run is on the session line, not the run", () => {
  const l = new Ledger({ reserveTokens: 0 });
  l.start({}, 0);
  const old = l.begin();
  l.end(l.begin(), { status: 200, ms: 1, inputTokens: 1000 });
  l.start({}, 10); // replaces run 1 with `old` still out
  l.end(old, { status: 200, ms: 1, inputTokens: 5000 }); // billed, lands late
  l.end(l.begin(), { status: 200, ms: 1, inputTokens: 300 });
  const s = l.summary(20);
  assert.equal(s.inputTokens, 300, "the run counts only its own calls");
  assert.equal(s.sessionInputTokens, 6300, "the session counts every billed reply");
  assert.ok(Math.abs(s.sessionUsd - 6300 * USD_PER_INPUT_TOKEN) < 1e-12);
  const stale = l.begin();
  l.start({}, 30);
  l.end(stale, { status: 0, ms: 0, inputTokens: 0, aborted: true });
  assert.equal(l.summary(31).sessionInputTokens, 6300, "an aborted stale call adds nothing");
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

// The overall budget (PR #42 review S8): dollars per UTC day across every run, not per run.
const DAY = Date.UTC(2026, 10, 7, 12);
const HOUR = 3_600_000;
const GAME = { capUsd: 100, capSeconds: 86_400 };

test("the daily budget holds across runs: a second run on the same day starts with what the first spent", () => {
  const l = new Ledger({ reserveTokens: 0, dailyUsd: 0.001 });
  l.start(GAME, DAY);
  l.end(l.begin(), { status: 200, ms: 1, inputTokens: 20_000 }); // $0.00084
  l.stop("user", DAY + 1);
  const second = l.start(GAME, DAY + HOUR);
  assert.equal(second.running, true);
  assert.ok(Math.abs(second.budget!.spentUsd - 20_000 * USD_PER_INPUT_TOKEN) < 1e-12, "not $0: the first run's spend");
  assert.equal(second.usd, 0, "the run's own figure starts again");
  l.end(l.begin(), { status: 200, ms: 1, inputTokens: 5_000 }); // $0.00105 today ≥ budget
  assert.deepEqual(l.admit(DAY + HOUR + 1), { ok: false, reason: "budget" });
  const s = l.summary(DAY + HOUR + 1);
  assert.equal(s.stopReason, "budget");
  assert.equal(s.budget!.remainingUsd, 0);
  const third = l.start(GAME, DAY + 2 * HOUR);
  assert.equal(third.running, false, "a run started with the budget spent ends at once");
  assert.equal(third.stopReason, "budget");
});

test("a new UTC day starts the budget again; a reply from a run already replaced still counts", () => {
  const l = new Ledger({ reserveTokens: 0, dailyUsd: 0.001 });
  l.start(GAME, DAY);
  const late = l.begin();
  l.start(GAME, DAY + 1); // replaces the run with `late` still out
  l.end(late, { status: 200, ms: 1, inputTokens: 30_000 }); // $0.00126: billed, so it counts
  assert.deepEqual(l.admit(DAY + 2), { ok: false, reason: "budget" });
  const tomorrow = l.start(GAME, DAY + 24 * HOUR);
  assert.equal(tomorrow.running, true);
  assert.equal(tomorrow.budget!.spentUsd, 0);
  assert.equal(tomorrow.budget!.day, "2026-11-08");
});

test("the budget reserves for calls in flight, as the spend cap does, and survives the server through its store", () => {
  let saved: { day: string; tokens: number } | null = null;
  const store = { load: () => saved, save: (v: { day: string; tokens: number }) => void (saved = { ...v }) };
  const l = new Ledger({ maxInFlight: 3, dailyUsd: 0.001, budgetStore: store });
  l.start(GAME, DAY);
  assert.deepEqual(l.admit(DAY, 10_000), { ok: true });
  const a = l.begin(10_000);
  assert.deepEqual(l.admit(DAY, 20_000), { ok: false, reason: "busy" }, "in flight, the rest might use it up: wait");
  l.end(a, { status: 200, ms: 1, inputTokens: 10_000 });
  assert.deepEqual(saved, { day: "2026-11-07", tokens: 10_000 });
  const restarted = new Ledger({ dailyUsd: 0.001, budgetStore: store });
  assert.ok(Math.abs(restarted.summary(DAY + HOUR).budget!.spentUsd - 10_000 * USD_PER_INPUT_TOKEN) < 1e-12, "a restarted server knows today's spend");
  assert.equal(new Ledger().summary(DAY).budget!.usdPerDay, null, "no budget unless one is set");
});

test("a new run keeps holding the budget for calls still out from the run it replaced (PR #66 review S1)", () => {
  // $0.001 a day is 23,809 tokens. Restarting runs used to drop the old run's reservations, so start + call, over and
  // over, let every call out at once whatever the day had left.
  const l = new Ledger({ maxInFlight: 5, dailyUsd: 0.001 });
  const out = [];
  for (let i = 0; i < 4; i++) {
    l.start(GAME, DAY);
    if (l.admit(DAY, 10_000).ok) out.push(l.begin(10_000));
  }
  assert.equal(out.length, 2, "two calls of 10,000 fit under 23,809 tokens; the third waits, though each start was a new run");
  l.start(GAME, DAY);
  assert.deepEqual(l.admit(DAY, 10_000), { ok: false, reason: "busy" }, "calls still out: wait, the run goes on");
  for (const t of out) l.end(t, { status: 200, ms: 1, inputTokens: 1_000 });
  assert.deepEqual(l.admit(DAY, 10_000), { ok: true }, "once they land, what they really cost is all that counts");
});
