import { DEFAULT_CAPS, DEFAULT_IN_FLIGHT, USD_PER_INPUT_TOKEN, type RunCaps, type RunSummary, type StopReason } from "../shared/jev.ts";

// The spend ledger: one run at a time, real tokens only. The browser decides
// *when* to stop for "formed"; the server enforces the spend and time caps so
// a UI bug can never run the key away. Pure — the clock is injected.
//
// Two things the first review caught (PR #1): a cap that only counts
// finished calls is overrun by whatever is in flight, so every admitted call
// reserves a worst-case cost until it ends; and a stop must reach calls
// already accepted, so each run owns an AbortController that stop() fires
// and the handler threads into the client.
//
// Round two: the reservation must not make the cap unreachable (when nothing
// is in flight and one more worst case would pass the cap, that *is* the
// spend cap); the time cap runs on a timer, not only on the next admit; and
// aborted calls are counted apart, never as zero-cost replies.
//
// Round three: each call reserves from its own payload size (bytes / 1.5,
// capped at the context limit) rather than from "the largest reply seen",
// which let a big call slip in under a small one's reservation. Measured
// 2026-10-25: the compass pack is 2.16 bytes per billed token, the noul pack
// 3.39, the overseer (base64 images) 19.6, so bytes / 1.5 over-reserves by
// 1.4× or more and never under-reserves. Tokens are also summed across runs
// so a reply landing after its run ended is still on the session line.

const LATENCY_WINDOW = 200;
/** Reserved per in-flight call when its size is unknown: the 64k-token context limit, the most one request can bill. */
export const RESERVE_TOKENS = 64_000;
/** Request bytes per reserved token: below every measured schema (2.16 compass, 3.39 nouls, 19.6 overseer). */
export const RESERVE_BYTES_PER_TOKEN = 1.5;

/** The tokens to hold back for a request of `bytes` JSON bytes. */
export function reserveForBytes(bytes: number, ceiling = RESERVE_TOKENS): number {
  return Math.min(ceiling, Math.max(1, Math.ceil(bytes / RESERVE_BYTES_PER_TOKEN)));
}

export interface LedgerOptions {
  maxInFlight?: number;
  reserveTokens?: number;
  /** Injected so the time-cap timer can be driven by hand in tests. */
  timer?: Timer;
}

export interface Timer {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimer: Timer = {
  set: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref();
    return t;
  },
  clear: (h) => clearTimeout(h as NodeJS.Timeout),
};

export interface CallResult {
  status: number;
  ms: number;
  inputTokens: number;
  /** The call was cut off before a reply: counted in `aborted`, not as a request. */
  aborted?: boolean;
}

/** Handed out by begin(); end() counts a token from an earlier run on the session line only. */
export interface InFlightToken {
  runId: number;
  /** tokens this call holds back until it ends */
  reserved: number;
}

export type Admission = { ok: true } | { ok: false; reason: "not-running" | "spend-cap" | "time-cap" | "busy" };

export class Ledger {
  #caps: RunCaps = { ...DEFAULT_CAPS };
  #runId = 0;
  #startedAt: number | null = null;
  #stoppedAt: number | null = null;
  #stopReason: StopReason | null = null;
  #requests = 0;
  #inFlight = 0;
  #inputTokens = 0;
  #latencies: number[] = [];
  #statuses: Record<string, number> = {};
  #controller = new AbortController();
  #aborted = 0;
  #reservedInFlight = 0;
  #sessionTokens = 0;
  #timeCap: unknown = null;
  readonly #maxInFlight: number;
  readonly #reserveTokens: number;
  readonly #timer: Timer;

  constructor(opts: LedgerOptions = {}) {
    this.#maxInFlight = opts.maxInFlight ?? DEFAULT_IN_FLIGHT;
    this.#reserveTokens = opts.reserveTokens ?? RESERVE_TOKENS;
    this.#timer = opts.timer ?? realTimer;
  }

  /** The ceiling held back per in-flight call whose size is not given. */
  get reserveTokens(): number {
    return this.#reserveTokens;
  }

  /** What one call of `hint` tokens (from its payload, see reserveForBytes) reserves: the hint, never above the ceiling. */
  reserveFor(hint?: number): number {
    return hint === undefined ? this.#reserveTokens : Math.min(this.#reserveTokens, Math.max(0, Math.ceil(hint)));
  }

  /** Start a run. Anything still in flight from the previous run is aborted and will not be counted. */
  start(caps: Partial<RunCaps>, now: number): RunSummary {
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#runId++;
    this.#caps = {
      capUsd: clampNumber(caps.capUsd, DEFAULT_CAPS.capUsd, 0, 100),
      capSeconds: clampNumber(caps.capSeconds, DEFAULT_CAPS.capSeconds, 1, 86_400),
    };
    this.#startedAt = now;
    this.#stoppedAt = null;
    this.#stopReason = null;
    this.#requests = 0;
    this.#inFlight = 0;
    this.#inputTokens = 0;
    this.#latencies = [];
    this.#statuses = {};
    this.#aborted = 0;
    this.#reservedInFlight = 0;
    this.#timer.clear(this.#timeCap);
    const capMs = this.#caps.capSeconds * 1000;
    this.#timeCap = this.#timer.set(() => this.stop("time-cap", now + capMs), capMs);
    return this.summary(now);
  }

  /** Stop the run and abort every call it still has out. */
  stop(reason: StopReason, now: number): RunSummary {
    if (this.#startedAt !== null && this.#stoppedAt === null) {
      this.#stoppedAt = now;
      this.#stopReason = reason;
      this.#timer.clear(this.#timeCap);
      this.#timeCap = null;
      this.#controller.abort();
    }
    return this.summary(now);
  }

  get running(): boolean {
    return this.#startedAt !== null && this.#stoppedAt === null;
  }

  /** The current run's abort signal; fires on stop, on a cap, and when a new run starts. */
  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  /**
   * May a Jev call go out now? Stops the run itself when a cap is hit. A call
   * is refused as "busy" (temporary) when the pool is full or when the calls
   * in flight might, at worst, use up what is left; with nothing in flight,
   * no room for one more call is the spend cap.
   */
  admit(now: number, reserveHint?: number): Admission {
    if (!this.running) return { ok: false, reason: "not-running" };
    if (this.usd >= this.#caps.capUsd) {
      this.stop("spend-cap", now);
      return { ok: false, reason: "spend-cap" };
    }
    if ((now - (this.#startedAt as number)) / 1000 >= this.#caps.capSeconds) {
      this.stop("time-cap", now);
      return { ok: false, reason: "time-cap" };
    }
    if (this.#inFlight >= this.#maxInFlight) return { ok: false, reason: "busy" };
    const reserved = (this.#reservedInFlight + this.reserveFor(reserveHint)) * USD_PER_INPUT_TOKEN;
    if (this.usd + reserved > this.#caps.capUsd) {
      if (this.#inFlight > 0) return { ok: false, reason: "busy" };
      this.stop("spend-cap", now);
      return { ok: false, reason: "spend-cap" };
    }
    return { ok: true };
  }

  /** Take a slot. `reserveHint` must be the same value admit() was asked with. */
  begin(reserveHint?: number): InFlightToken {
    this.#inFlight++;
    const reserved = this.reserveFor(reserveHint);
    this.#reservedInFlight += reserved;
    return { runId: this.#runId, reserved };
  }

  /** Record a finished call. Tokens are the real usage.input_tokens of the reply. A token from an earlier run is ignored. */
  end(token: InFlightToken, result: CallResult): void {
    const tokens = Math.max(0, result.inputTokens);
    if (token.runId !== this.#runId) {
      // A call from a run that has since been replaced: its slot and reservation went with that run, but it was billed.
      if (!result.aborted) this.#sessionTokens += tokens;
      return;
    }
    this.#inFlight = Math.max(0, this.#inFlight - 1);
    this.#reservedInFlight = Math.max(0, this.#reservedInFlight - token.reserved);
    if (result.aborted) {
      this.#aborted++;
      return;
    }
    this.#requests++;
    this.#inputTokens += tokens;
    this.#sessionTokens += tokens;
    this.#latencies.push(result.ms);
    if (this.#latencies.length > LATENCY_WINDOW) this.#latencies.shift();
    const k = String(result.status);
    this.#statuses[k] = (this.#statuses[k] ?? 0) + 1;
  }

  get usd(): number {
    return this.#inputTokens * USD_PER_INPUT_TOKEN;
  }

  summary(now: number): RunSummary {
    const end = this.#stoppedAt ?? now;
    const elapsed = this.#startedAt === null ? 0 : Math.max(0, (end - this.#startedAt) / 1000);
    return {
      running: this.running,
      startedAt: this.#startedAt,
      stoppedAt: this.#stoppedAt,
      stopReason: this.#stopReason,
      elapsedSeconds: round(elapsed, 1),
      caps: { ...this.#caps },
      requests: this.#requests,
      inFlight: this.#inFlight,
      maxInFlight: this.#maxInFlight,
      inputTokens: this.#inputTokens,
      usd: this.usd,
      sessionInputTokens: this.#sessionTokens,
      sessionUsd: this.#sessionTokens * USD_PER_INPUT_TOKEN,
      aborted: this.#aborted,
      medianMs: percentile(this.#latencies, 0.5),
      p90Ms: percentile(this.#latencies, 0.9),
      statuses: { ...this.#statuses },
      remainingUsd: Math.max(0, this.#caps.capUsd - this.usd),
      remainingSeconds: this.running ? Math.max(0, round(this.#caps.capSeconds - elapsed, 1)) : 0,
    };
  }
}

export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i] as number;
}

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function round(x: number, places: number): number {
  const f = 10 ** places;
  return Math.round(x * f) / f;
}
