import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { DEFAULT_IN_FLIGHT, JevAbortError, JevClient, headersFor, inputTokensOf, isStaleSocketReset, retryDelayMs } from "../jev.ts";

// A stand-in for api.typesafe.ai: answers after `delayMs`, counts how many
// requests are open at once, and can be told to 429 the first N calls.
function fakeJev(opts: { delayMs: number; rejectFirst?: number; retryAfter?: string; trickle?: boolean; rawText?: string }) {
  let open = 0;
  let maxOpen = 0;
  let served = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      served++;
      if (opts.rejectFirst && served <= opts.rejectFirst) {
        res.writeHead(429, { "content-type": "application/json", ...(opts.retryAfter ? { "retry-after": opts.retryAfter } : {}) });
        res.end(JSON.stringify({ error: "rate limited" }));
        return;
      }
      open++;
      maxOpen = Math.max(maxOpen, open);
      if (opts.trickle) {
        // never idle, never done: one byte every delayMs
        res.writeHead(200, { "content-type": "application/json" });
        const t = setInterval(() => res.write(" "), opts.delayMs);
        res.on("close", () => clearInterval(t));
        return;
      }
      setTimeout(() => {
        open--;
        if (opts.rawText !== undefined) {
          res.writeHead(200, { "content-type": "text/html" });
          res.end(opts.rawText);
          return;
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const n = Object.keys(body.questions).length;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ model: body.model, answers: {}, usage: { input_tokens: 100 * n, output_tokens: 0 }, sawImagesHeader: req.headers["typesafe-danger-zone-images"] ?? null }));
      }, opts.delayMs);
    });
  });
  return new Promise<{ url: string; stats: () => { maxOpen: number; served: number }; close: () => void }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, stats: () => ({ maxOpen, served }), close: () => server.close() });
    });
  });
}

const REQ = { state: { ants: {} }, questions: { a0_n: { type: "noul" as const, instructions: "north" } } };

test("8 parallel calls overlap on an agent sized 8 (the fixture detects serialisation on an agent sized 1)", async () => {
  const fake = await fakeJev({ delayMs: 150 });
  try {
    const wide = new JevClient({ apiKey: "k", baseUrl: fake.url, maxSockets: 8 });
    let t0 = performance.now();
    const results = await Promise.all(Array.from({ length: 8 }, () => wide.ask(REQ)));
    const wideWall = performance.now() - t0;
    wide.destroy();
    assert.ok(results.every((r) => r.status === 200));
    assert.ok(fake.stats().maxOpen >= 6, `expected ≥6 overlapping requests, saw ${fake.stats().maxOpen}`);
    assert.ok(wideWall < 150 * 3, `8 parallel calls took ${Math.round(wideWall)} ms, which is serial, not parallel`);

    // Prove the fixture can see the failure mode: one socket must stack.
    const narrow = new JevClient({ apiKey: "k", baseUrl: fake.url, maxSockets: 1 });
    t0 = performance.now();
    await Promise.all(Array.from({ length: 4 }, () => narrow.ask(REQ)));
    const narrowWall = performance.now() - t0;
    narrow.destroy();
    assert.ok(narrowWall >= 150 * 3.5, `one socket should have stacked 4 calls to ≥525 ms, took ${Math.round(narrowWall)}`);
  } finally {
    fake.close();
  }
});

test("the default client overlaps too (the width production uses, not just an explicit one)", async () => {
  const fake = await fakeJev({ delayMs: 150 });
  try {
    assert.equal(DEFAULT_IN_FLIGHT, 5, "one of the browser's 6 connections stays free for Stop");
    const c = new JevClient({ apiKey: "k", baseUrl: fake.url });
    const t0 = performance.now();
    await Promise.all(Array.from({ length: DEFAULT_IN_FLIGHT }, () => c.ask(REQ)));
    const wall = performance.now() - t0;
    c.destroy();
    assert.ok(fake.stats().maxOpen >= DEFAULT_IN_FLIGHT - 1, `saw ${fake.stats().maxOpen} overlapping`);
    assert.ok(wall < 150 * 3, `${Math.round(wall)} ms for ${DEFAULT_IN_FLIGHT} calls is serial`);
  } finally {
    fake.close();
  }
});

test("a trickling upstream hits the overall deadline; an abort signal ends a call in flight and before a backoff sleep", { timeout: 5000 }, async () => {
  const fake = await fakeJev({ delayMs: 50, trickle: true });
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: fake.url, timeoutMs: 300, abortGraceMs: 0 });
    const t0 = performance.now();
    await assert.rejects(c.ask(REQ), /exceeded 300 ms/);
    assert.ok(performance.now() - t0 < 1500);
    // abort mid-flight
    const ac = new AbortController();
    const p = c.ask(REQ, ac.signal);
    setTimeout(() => ac.abort(), 60);
    await assert.rejects(p, JevAbortError);
    // abort before the first attempt
    const done = new AbortController();
    done.abort();
    await assert.rejects(c.ask(REQ, done.signal), JevAbortError);
    c.destroy();
  } finally {
    fake.close();
  }
  // abort during backoff: the sleep rejects, no further attempt is made
  const limited = await fakeJev({ delayMs: 5, rejectFirst: 10, retryAfter: "0" });
  try {
    const ac = new AbortController();
    let sleeps = 0;
    const c = new JevClient({
      apiKey: "k",
      baseUrl: limited.url,
      maxRetries: 3,
      sleep: async (_ms, signal) => {
        sleeps++;
        ac.abort();
        if (signal?.aborted) throw new JevAbortError();
      },
    });
    await assert.rejects(c.ask(REQ, ac.signal), JevAbortError);
    assert.equal(sleeps, 1);
    assert.equal(limited.stats().served, 1, "no attempt after the abort");
    c.destroy();
  } finally {
    limited.close();
  }
});

test("a reset on a reused keep-alive socket is retried once; other errors are not", () => {
  assert.equal(isStaleSocketReset({ code: "ECONNRESET" }, true), true);
  assert.equal(isStaleSocketReset({ code: "ECONNRESET" }, false), false);
  assert.equal(isStaleSocketReset({ code: "ECONNREFUSED" }, true), false);
  assert.equal(isStaleSocketReset(null, true), false);
});

test("429 is retried, honouring retry-after, and the final status is reported with the attempt count", async () => {
  const fake = await fakeJev({ delayMs: 5, rejectFirst: 2, retryAfter: "0" });
  const slept: number[] = [];
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: fake.url, maxRetries: 3, sleep: async (ms) => void slept.push(ms) });
    const r = await c.ask(REQ);
    c.destroy();
    assert.equal(r.status, 200);
    assert.equal(r.attempts, 3);
    assert.deepEqual(slept, [0, 0]);
    assert.equal(r.inputTokens, 100);
  } finally {
    fake.close();
  }
});

test("retries give up after maxRetries and return the 429", async () => {
  const fake = await fakeJev({ delayMs: 5, rejectFirst: 10 });
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: fake.url, maxRetries: 2, sleep: async () => {} });
    const r = await c.ask(REQ);
    c.destroy();
    assert.equal(r.status, 429);
    assert.equal(r.attempts, 3);
    assert.equal(r.inputTokens, 0);
  } finally {
    fake.close();
  }
});

test("retryDelayMs: seconds, HTTP-date, exponential fallback, non-retryable", () => {
  assert.equal(retryDelayMs(429, "2", 1, 3), 2000);
  assert.equal(retryDelayMs(529, undefined, 1, 3), 250);
  assert.equal(retryDelayMs(529, undefined, 3, 3), 1000);
  assert.equal(retryDelayMs(429, undefined, 4, 3), null);
  assert.equal(retryDelayMs(500, "1", 1, 3), null);
  const soon = new Date(Date.now() + 1500).toUTCString();
  const d = retryDelayMs(429, soon, 1, 3) as number;
  assert.ok(d > 0 && d <= 1500);
});

test("images header is sent only for assets or box questions", () => {
  const plain = headersFor("k", REQ, 10);
  assert.equal(plain["typesafe-danger-zone-images"], undefined);
  assert.equal(plain.authorization, "Bearer k");
  const withBox = headersFor("k", { ...REQ, questions: { gap: { type: "box", instructions: "x" } } }, 10);
  assert.equal(withBox["typesafe-danger-zone-images"], "true");
  const withAssets = headersFor("k", { ...REQ, assets: { img: { type: "image", format: "png", data_base64: "AA==" } } }, 10);
  assert.equal(withAssets["typesafe-danger-zone-images"], "true");
});

test("inputTokensOf reads usage and tolerates junk", () => {
  assert.equal(inputTokensOf({ usage: { input_tokens: 42 } }), 42);
  assert.equal(inputTokensOf({ usage: { input_tokens: "42" } }), 0);
  assert.equal(inputTokensOf(null), 0);
});

test("abort grace: a call already on the wire finishes and is returned (it was billed); after the grace it is cut; an unsent one is cut at once", { timeout: 5000 }, async () => {
  // Round 2 (PR #1): aborting sent calls under-counted real spend by up to
  // one request per in-flight slot per Stop.
  const fake = await fakeJev({ delayMs: 120 });
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: fake.url, abortGraceMs: 1000 });
    const ac = new AbortController();
    const p = c.ask(REQ, ac.signal);
    setTimeout(() => ac.abort(), 30);
    const r = await p;
    assert.equal(r.status, 200);
    assert.equal(r.inputTokens, 100, "the reply, and its real cost, came back");
    // aborted before the attempt is sent: no grace
    const pre = new AbortController();
    pre.abort();
    await assert.rejects(c.ask(REQ, pre.signal), JevAbortError);
    c.destroy();
  } finally {
    fake.close();
  }
  const slow = await fakeJev({ delayMs: 50, trickle: true });
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: slow.url, timeoutMs: 5000, abortGraceMs: 100 });
    const ac = new AbortController();
    const p = c.ask(REQ, ac.signal);
    setTimeout(() => ac.abort(), 30);
    const t0 = performance.now();
    await assert.rejects(p, JevAbortError);
    const took = performance.now() - t0;
    assert.ok(took >= 80 && took < 1000, `cut after the grace, took ${took.toFixed(0)} ms`);
    c.destroy();
  } finally {
    slow.close();
  }
});

test("the real backoff sleep is given the signal: Stop during a long retry-after returns at once", { timeout: 5000 }, async () => {
  // Round 2 (PR #1): the injected test sleep aborted synchronously, so a
  // retry sleep that ignored the signal stayed green while Stop took 4.9 s.
  const fake = await fakeJev({ delayMs: 5, rejectFirst: 10, retryAfter: "5" });
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: fake.url, maxRetries: 3 });
    const ac = new AbortController();
    const p = c.ask(REQ, ac.signal);
    setTimeout(() => ac.abort(), 60);
    const t0 = performance.now();
    await assert.rejects(p, JevAbortError);
    assert.ok(performance.now() - t0 < 1000, "did not wait out the 5 s retry-after");
    assert.equal(fake.stats().served, 1);
    c.destroy();
  } finally {
    fake.close();
  }
});

test("latency is network time only: a backoff sleep is not in ms", async () => {
  const fake = await fakeJev({ delayMs: 5, rejectFirst: 1, retryAfter: "0" });
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: fake.url, maxRetries: 2, sleep: () => new Promise((r) => setTimeout(r, 250)) });
    const r = await c.ask(REQ);
    assert.equal(r.status, 200);
    assert.equal(r.attempts, 2);
    assert.ok(r.ms < 150, `ms ${r.ms} includes the 250 ms sleep`);
    c.destroy();
  } finally {
    fake.close();
  }
});

test("a non-JSON 200 is returned as an error body, not thrown", async () => {
  const fake = await fakeJev({ delayMs: 5, rawText: "<html>maintenance</html>" });
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: fake.url });
    const r = await c.ask(REQ);
    assert.equal(r.status, 200);
    assert.match(String((r.body as { error: string }).error), /not JSON/);
    assert.equal(r.inputTokens, 0);
    c.destroy();
  } finally {
    fake.close();
  }
});

test("a reset on a reused keep-alive socket is retried on a fresh connection; a reset on a fresh socket is not", { timeout: 5000 }, async () => {
  // The upstream kills the socket when the second request on it arrives,
  // before answering: what an idle keep-alive connection closing looks like.
  let connections = 0;
  let killOnRequest = 2;
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () =>
      setTimeout(() => {
        if (res.socket?.destroyed) return;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ answers: {}, usage: { input_tokens: 7 } }));
      }, 10),
    );
  });
  server.on("connection", (s) => {
    connections++;
    let n = 0;
    s.on("data", () => {
      n++;
      if (n === killOnRequest) s.destroy();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: url, maxSockets: 1 });
    assert.equal((await c.ask(REQ)).status, 200);
    const second = await c.ask(REQ); // reused socket, reset by the server, retried on a new one
    assert.equal(second.status, 200);
    assert.equal(second.inputTokens, 7);
    assert.equal(connections, 2);
    c.destroy();
    // a fresh socket that resets is a real failure
    killOnRequest = 1;
    const d = new JevClient({ apiKey: "k", baseUrl: url, maxSockets: 1 });
    await assert.rejects(d.ask(REQ), (e: Error) => !(e instanceof JevAbortError));
    assert.equal(connections, 3, "no retry on a fresh socket");
    d.destroy();
  } finally {
    server.close();
  }
});

test("the default grace lets a sent call finish; a call still queued behind a busy socket is cut at once and never sent", { timeout: 5000 }, async () => {
  // Round 3 (PR #1) mutation gaps G1 and G3.
  const fake = await fakeJev({ delayMs: 150 });
  try {
    const c = new JevClient({ apiKey: "k", baseUrl: fake.url, maxSockets: 1 }); // default abortGraceMs
    const ac = new AbortController();
    const first = c.ask(REQ, ac.signal); // takes the one socket
    const second = c.ask(REQ, ac.signal); // queued in the agent, not yet sent
    setTimeout(() => ac.abort(), 30);
    const t0 = performance.now();
    await assert.rejects(second, JevAbortError);
    assert.ok(performance.now() - t0 < 100, "the queued call was cut at once");
    const r = await first;
    assert.equal(r.status, 200, "the sent call finished within the default grace");
    assert.equal(fake.stats().served, 1, "the queued call never reached upstream");
    c.destroy();
  } finally {
    fake.close();
  }
});
