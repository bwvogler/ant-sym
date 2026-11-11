import { test } from "node:test";
import assert from "node:assert/strict";
import { errorOf, hasAnswers, isProxyReply, isRunSummary, readHealth, readRunRequest, runOf } from "../../../shared/jev.ts";

// What the page reads back from the API is checked, not cast (shared/jev.ts): a wrong-shaped body is nothing, never a wrong object.

const RUN = {
  running: true,
  startedAt: 1,
  stoppedAt: null,
  stopReason: null,
  elapsedSeconds: 2,
  caps: { capUsd: 1, capSeconds: 60 },
  requests: 3,
  inFlight: 0,
  maxInFlight: 5,
  inputTokens: 10,
  usd: 0,
  sessionInputTokens: 10,
  sessionUsd: 0,
  aborted: 0,
  medianMs: null,
  p90Ms: null,
  statuses: {},
  remainingUsd: 1,
  remainingSeconds: 58,
};

test("a run summary is recognised by the fields the page reads; a partial or foreign body is not one", () => {
  assert.equal(isRunSummary(RUN), true);
  assert.equal(isRunSummary({ ...RUN, running: "yes" }), false);
  assert.equal(isRunSummary({ ...RUN, caps: undefined }), false);
  assert.equal(isRunSummary({ error: "no" }), false);
  assert.equal(isRunSummary(null), false);
  assert.equal(isRunSummary("<html>404</html>"), false);
});

test("errorOf and runOf read an error body and the run it carries, or nothing", () => {
  assert.equal(errorOf({ error: "busy", run: RUN }), "busy");
  assert.equal(errorOf({ error: 5 }), undefined);
  assert.equal(errorOf(null), undefined);
  assert.equal(runOf({ error: "busy", run: RUN }), RUN);
  assert.equal(runOf({ error: "busy", run: { running: true } }), null);
  assert.equal(runOf([]), null);
});

test("a proxy reply carries its status, attempts, tokens and run; its body holds answers only when it has an answers object", () => {
  const reply = {
    status: 200,
    body: { model: "m", answers: { q: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 1, output_tokens: 0 } },
    ms: 5,
    attempts: 1,
    inputTokens: 1,
    run: RUN,
  };
  assert.equal(isProxyReply(reply), true);
  assert.equal(hasAnswers(reply.body), true);
  assert.equal(
    isProxyReply({ ...reply, run: { running: true } }),
    true,
    "a drifted run summary does not make a billed reply unreadable (read the run with runOf)",
  );
  assert.equal(runOf(reply), RUN);
  assert.equal(runOf({ ...reply, run: { running: true } }), null);
  assert.equal(isProxyReply({ ...reply, run: undefined }), false);
  assert.equal(isProxyReply({ status: 200 }), false);
  assert.equal(hasAnswers({ error: "upstream reply had no answers" }), false);
  assert.equal(hasAnswers(null), false);
});

test("a health body is read for the key, the hosted flags and today's budget; a 404 page or another service's JSON is none", () => {
  assert.equal(readHealth({ ok: false }), null);
  assert.equal(readHealth("<html>"), null);
  assert.equal(readHealth(null), null);
  assert.deepEqual(readHealth({ ok: true, hasKey: true, run: RUN }), { hasKey: true });
  assert.deepEqual(readHealth({ ok: true, hasKey: 1, hosted: true, authorized: false }), {
    hasKey: false,
    hosted: true,
    authorized: false,
  });
  const budget = { day: "2026-11-11", usdPerDay: 0.1, spentUsd: 0.01, remainingUsd: 0.09 };
  assert.deepEqual(readHealth({ ok: true, hasKey: true, run: { budget } })?.budget, budget);
  assert.equal(readHealth({ ok: true, hasKey: true, run: { budget: { day: 3 } } })?.budget, undefined);
});

test("a run request keeps a string action and numeric caps, and drops the rest", () => {
  assert.deepEqual(readRunRequest({ action: "start", caps: { capUsd: 0.5, capSeconds: "x", extra: 1 } }), {
    action: "start",
    caps: { capUsd: 0.5 },
  });
  assert.deepEqual(readRunRequest({ action: 3 }), {});
  assert.deepEqual(readRunRequest(null), {});
  assert.deepEqual(readRunRequest([]), {});
});
