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

export interface JevClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Parallel connections = the most requests in flight at once. */
  maxSockets?: number;
  /** Retries on 429/529 (TypeSafe: retry with backoff, honour retry-after). */
  maxRetries?: number;
  timeoutMs?: number;
  /** Injected so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

export interface JevCallResult {
  status: number;
  body: unknown;
  ms: number;
  attempts: number;
  inputTokens: number;
}

export const DEFAULT_BASE_URL = "https://api.typesafe.ai";
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

export class JevClient {
  readonly #apiKey: string;
  readonly #url: URL;
  readonly #agent: http.Agent;
  readonly #maxRetries: number;
  readonly #timeoutMs: number;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(opts: JevClientOptions) {
    this.#apiKey = opts.apiKey;
    this.#url = new URL("/v1/systemone", opts.baseUrl ?? DEFAULT_BASE_URL);
    const maxSockets = opts.maxSockets ?? 8;
    this.#agent =
      this.#url.protocol === "https:"
        ? new https.Agent({ keepAlive: true, maxSockets })
        : new http.Agent({ keepAlive: true, maxSockets });
    this.#maxRetries = opts.maxRetries ?? 3;
    this.#timeoutMs = opts.timeoutMs ?? 20_000;
    this.#sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** One logical call: retries 429/529, returns the final status whatever it is. Throws only on network/timeout failure. */
  async ask(req: JevRequest): Promise<JevCallResult> {
    const payload = Buffer.from(JSON.stringify(req));
    const headers = headersFor(this.#apiKey, req, payload.byteLength);
    const t0 = performance.now();
    for (let attempt = 1; ; attempt++) {
      const { status, text, retryAfter } = await this.#post(payload, headers);
      const delay = retryDelayMs(status, retryAfter, attempt, this.#maxRetries);
      if (delay !== null) {
        await this.#sleep(delay);
        continue;
      }
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { error: "upstream reply was not JSON", text: text.slice(0, 200) };
      }
      return { status, body, ms: Math.round(performance.now() - t0), attempts: attempt, inputTokens: inputTokensOf(body) };
    }
  }

  #post(payload: Buffer, headers: Record<string, string>): Promise<{ status: number; text: string; retryAfter: string | undefined }> {
    const lib = this.#url.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
      const r = lib.request(this.#url, { method: "POST", agent: this.#agent, headers, timeout: this.#timeoutMs }, (resp) => {
        const chunks: Buffer[] = [];
        resp.on("data", (c: Buffer) => chunks.push(c));
        resp.on("end", () =>
          resolve({
            status: resp.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
            retryAfter: typeof resp.headers["retry-after"] === "string" ? resp.headers["retry-after"] : undefined,
          }),
        );
        resp.on("error", reject);
      });
      r.on("timeout", () => r.destroy(new Error(`jev request timed out after ${this.#timeoutMs} ms`)));
      r.on("error", reject);
      r.end(payload);
    });
  }

  /** For tests and shutdown. */
  destroy(): void {
    this.#agent.destroy();
  }
}
