import type { JevRequest } from "../shared/jev.ts";
import {
  DEFAULT_ABORT_GRACE_MS,
  DEFAULT_BASE_URL,
  JevAbortError,
  defaultSleep,
  headersFor,
  inputTokensOf,
  retryDelayMs,
  type JevCallResult,
  type JevCaller,
} from "../server/jev.ts";

// JevClient (server/jev.ts) for a Cloudflare Worker: fetch instead of
// node:https. The Node client avoids fetch because undici serialises requests
// behind one warm keep-alive socket (PRD §3); a Worker's fetch is
// Cloudflare's, each subrequest its own, so that measurement does not carry
// over (and the ledger still caps what is in flight). Same contract: retries
// 429/529 with backoff, an overall deadline per attempt, and a call already
// sent gets `abortGraceMs` to land and be counted when the run stops.

export interface FetchJevClientOptions {
  apiKey: string;
  baseUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
  abortGraceMs?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

class Timeout extends Error {}

export class FetchJevClient implements JevCaller {
  readonly #apiKey: string;
  readonly #url: string;
  readonly #maxRetries: number;
  readonly #timeoutMs: number;
  readonly #abortGraceMs: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(opts: FetchJevClientOptions) {
    this.#apiKey = opts.apiKey;
    this.#url = new URL("/v1/systemone", opts.baseUrl ?? DEFAULT_BASE_URL).toString();
    this.#maxRetries = opts.maxRetries ?? 3;
    this.#timeoutMs = opts.timeoutMs ?? 20_000;
    this.#abortGraceMs = opts.abortGraceMs ?? DEFAULT_ABORT_GRACE_MS;
    this.#fetch = opts.fetchFn ?? ((input, init) => fetch(input, init));
    this.#sleep = opts.sleep ?? defaultSleep;
  }

  async ask(req: JevRequest, signal?: AbortSignal): Promise<JevCallResult> {
    const payload = JSON.stringify(req);
    const headers = headersFor(this.#apiKey, req, 0);
    delete headers["content-length"]; // fetch sets it from the body
    let networkMs = 0;
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) throw new JevAbortError();
      const t0 = performance.now();
      const posted = await this.#post(payload, headers, signal).finally(() => {
        networkMs += performance.now() - t0;
      });
      const delay = retryDelayMs(posted.status, posted.retryAfter, attempt, this.#maxRetries);
      if (delay !== null) {
        await this.#sleep(delay, signal);
        continue;
      }
      let body: unknown = null;
      try {
        body = posted.text ? JSON.parse(posted.text) : null;
      } catch {
        body = { error: "upstream reply was not JSON", text: posted.text.slice(0, 200) };
      }
      return { status: posted.status, body, ms: Math.round(networkMs), attempts: attempt, inputTokens: inputTokensOf(body) };
    }
  }

  async #post(
    payload: string,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<{ status: number; text: string; retryAfter: string | undefined }> {
    const ctl = new AbortController();
    let grace: ReturnType<typeof setTimeout> | null = null;
    const deadline = setTimeout(() => ctl.abort(new Timeout(`jev request exceeded ${this.#timeoutMs} ms`)), this.#timeoutMs);
    // fetch is on the wire as soon as it is called, so a stop always gets the grace (0 cuts at once).
    const onAbort = () => {
      if (this.#abortGraceMs > 0) grace = setTimeout(() => ctl.abort(new JevAbortError()), this.#abortGraceMs);
      else ctl.abort(new JevAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await this.#fetch(this.#url, { method: "POST", headers, body: payload, signal: ctl.signal });
      const text = await res.text();
      return { status: res.status, text, retryAfter: res.headers.get("retry-after") ?? undefined };
    } catch (e) {
      const reason: unknown = ctl.signal.aborted ? ctl.signal.reason : e;
      if (reason instanceof JevAbortError) throw reason;
      if (reason instanceof Timeout) throw new Error(reason.message);
      throw e;
    } finally {
      clearTimeout(deadline);
      if (grace) clearTimeout(grace);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  destroy(): void {}
}
