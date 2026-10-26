import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { JevClient, headersFor, inputTokensOf, retryDelayMs } from "../jev.ts";

// A stand-in for api.typesafe.ai: answers after `delayMs`, counts how many
// requests are open at once, and can be told to 429 the first N calls.
function fakeJev(opts: { delayMs: number; rejectFirst?: number; retryAfter?: string }) {
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
      setTimeout(() => {
        open--;
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
