import http from "node:http";
import https from "node:https";
import type { JevRequest } from "../shared/jev.ts";

// The one place that talks to TypeSafe. Deliberately on node:http(s) with an
// explicit Agent rather than global fetch: undici opens parallel connections
// on a cold start but, once one keep-alive socket is warm, queues every later
// request behind it — a burst of 8 then stacks 200, 400, 600 … ms and looks
// exactly like a server-side concurrency cap (measured 2026-10-25, see
// docs/PRD.md §3). maxSockets here is the in-flight limit, and
// server/tests/jev.test.ts proves requests overlap.

/** What the API handler needs from a caller; JevClient is the real one, tests stub it. */
export interface JevCaller {
  ask(req: JevRequest, signal?: AbortSignal): Promise<JevCallResult>;
  destroy(): void;
}

export interface JevClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Parallel connections = the most requests in flight at once. */
  maxSockets?: number;
  /** Retries on 429/529 (TypeSafe: retry with backoff, honour retry-after). */
  maxRetries?: number;
  /** Overall deadline per attempt, from first byte sent to last byte read. */
  timeoutMs?: number;
  /** Injected so tests do not wait. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /**
   * On abort, a request already sent upstream is billed whether or not we
   * read the reply, so it gets this long to finish and be counted; one not
   * yet sent is dropped at once. 0 cuts everything off immediately.
   */
  abortGraceMs?: number;
}

export interface JevCallResult {
  status: number;
  body: unknown;
  /** network time only, excluding backoff sleeps */
  ms: number;
  attempts: number;
  inputTokens: number;
}

/** Thrown by ask() when the caller's signal fires: the run was stopped. */
export class JevAbortError extends Error {
  constructor() {
    super("jev call aborted: the run was stopped");
    this.name = "JevAbortError";
  }
}

export const DEFAULT_BASE_URL = "https://api.typesafe.ai";
/**
 * Browsers open at most 6 HTTP/1.1 connections per host. Five in flight
 * leaves one for /api/run, so Stop reaches the server at once instead of
 * queueing behind the calls it is meant to cut off (measured: 6 open, Stop
 * waited 3.8 s and every call was billed; 5 open, 5 ms).
 */
export const DEFAULT_IN_FLIGHT = 5;
export const DEFAULT_ABORT_GRACE_MS = 1500;
const RETRYABLE = new Set([429, 529]);

/** How long to wait before attempt `attempt` (1-based) after a retryable status, or null to give up. */
export function retryDelayMs(status: number, retryAfter: string | undefined, attempt: number, maxRetries: number): number | null {
  if (!RETRYABLE.has(status) || attempt > maxRetries) return null;
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 30_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 30_000));
  }
  return Math.min(250 * 2 ** (attempt - 1), 8_000);
}

/** A keep-alive socket the server closed while idle: the request never left, retry it once. */
export function isStaleSocketReset(err: unknown, reusedSocket: boolean): boolean {
  return reusedSocket && (err as { code?: string } | null)?.code === "ECONNRESET";
}

/** usage.input_tokens from a reply body, 0 when absent. */
export function inputTokensOf(body: unknown): number {
  const t = (body as { usage?: { input_tokens?: unknown } } | null)?.usage?.input_tokens;
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
}

/** The headers a request needs. Images and box questions sit behind TypeSafe's opt-in header. */
export function headersFor(apiKey: string, req: JevRequest, bodyBytes: number): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "application/json",
    "content-length": String(bodyBytes),
    authorization: `Bearer ${apiKey}`,
  };
  const hasImages = !!req.assets && Object.keys(req.assets).length > 0;
  const hasBox = Object.values(req.questions ?? {}).some((q) => q?.type === "box");
  if (hasImages || hasBox) h["typesafe-danger-zone-images"] = "true";
  return h;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new JevAbortError());
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new JevAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class JevClient implements JevCaller {
  readonly #apiKey: string;
  readonly #url: URL;
  readonly #agent: http.Agent;
  readonly #maxRetries: number;
  readonly #timeoutMs: number;
  readonly #sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly #abortGraceMs: number;

  constructor(opts: JevClientOptions) {
    this.#apiKey = opts.apiKey;
    this.#url = new URL("/v1/systemone", opts.baseUrl ?? DEFAULT_BASE_URL);
    const maxSockets = opts.maxSockets ?? DEFAULT_IN_FLIGHT;
    this.#agent =
      this.#url.protocol === "https:"
        ? new https.Agent({ keepAlive: true, maxSockets })
        : new http.Agent({ keepAlive: true, maxSockets });
    this.#maxRetries = opts.maxRetries ?? 3;
    this.#timeoutMs = opts.timeoutMs ?? 20_000;
    this.#sleep = opts.sleep ?? defaultSleep;
    this.#abortGraceMs = opts.abortGraceMs ?? DEFAULT_ABORT_GRACE_MS;
  }

  /**
   * One logical call: retries 429/529 and one stale-socket reset, returns the
   * final status whatever it is. Throws JevAbortError when `signal` fires
   * before an attempt is sent or during a backoff sleep, and a plain Error on
   * network failure. An attempt already on the wire when the signal fires is
   * given `abortGraceMs` to finish, and its reply is returned (it was billed).
   */
  async ask(req: JevRequest, signal?: AbortSignal): Promise<JevCallResult> {
    const payload = Buffer.from(JSON.stringify(req));
    const headers = headersFor(this.#apiKey, req, payload.byteLength);
    let networkMs = 0;
    let resetRetried = false;
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) throw new JevAbortError();
      const t0 = performance.now();
      let posted: { status: number; text: string; retryAfter: string | undefined };
      try {
        posted = await this.#post(payload, headers, signal);
      } catch (err) {
        networkMs += performance.now() - t0;
        if (err instanceof JevAbortError) throw err;
        if (!resetRetried && isStaleSocketReset(err, (err as { reusedSocket?: boolean }).reusedSocket === true)) {
          resetRetried = true;
          continue;
        }
        throw err;
      }
      networkMs += performance.now() - t0;
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

  #post(payload: Buffer, headers: Record<string, string>, signal?: AbortSignal): Promise<{ status: number; text: string; retryAfter: string | undefined }> {
    const lib = this.#url.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
      let settled = false;
      let sent = false;
      let grace: NodeJS.Timeout | null = null;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        if (grace) clearTimeout(grace);
        signal?.removeEventListener("abort", onAbort);
        fn();
      };
      const r = lib.request(this.#url, { method: "POST", agent: this.#agent, headers }, (resp) => {
        const chunks: Buffer[] = [];
        resp.on("data", (c: Buffer) => chunks.push(c));
        resp.on("end", () =>
          done(() =>
            resolve({
              status: resp.statusCode ?? 0,
              text: Buffer.concat(chunks).toString("utf8"),
              retryAfter: typeof resp.headers["retry-after"] === "string" ? resp.headers["retry-after"] : undefined,
            }),
          ),
        );
        resp.on("error", (e) => done(() => reject(e)));
      });
      // Overall deadline: a trickling upstream never trips an idle timeout.
      const deadline = setTimeout(() => {
        r.destroy(new Error(`jev request exceeded ${this.#timeoutMs} ms`));
      }, this.#timeoutMs);
      const cut = () => r.destroy(new JevAbortError());
      const onAbort = () => {
        if (sent && this.#abortGraceMs > 0) grace = setTimeout(cut, this.#abortGraceMs);
        else cut();
      };
      r.on("finish", () => {
        sent = true;
      });
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
      r.on("error", (e) => {
        (e as { reusedSocket?: boolean }).reusedSocket = r.reusedSocket;
        done(() => reject(e));
      });
      r.end(payload);
    });
  }

  /** For tests and shutdown. */
  destroy(): void {
    this.#agent.destroy();
  }
}
