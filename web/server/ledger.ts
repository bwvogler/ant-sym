import { DEFAULT_CAPS, USD_PER_INPUT_TOKEN, type RunCaps, type RunSummary, type StopReason } from "../shared/jev.ts";

// The spend ledger: one run at a time, real tokens only. The browser decides
// *when* to stop for "formed"; the server enforces the spend and time caps so
// a UI bug can never run the key away. Pure — the clock is injected.

const LATENCY_WINDOW = 200;

export class Ledger {
  #caps: RunCaps = { ...DEFAULT_CAPS };
  #startedAt: number | null = null;
  #stoppedAt: number | null = null;
  #stopReason: StopReason | null = null;
  #requests = 0;
  #inFlight = 0;
  #inputTokens = 0;
  #latencies: number[] = [];
  #statuses: Record<string, number> = {};

  start(caps: Partial<RunCaps>, now: number): RunSummary {
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
    return this.summary(now);
  }

  stop(reason: StopReason, now: number): RunSummary {
    if (this.#startedAt !== null && this.#stoppedAt === null) {
      this.#stoppedAt = now;
      this.#stopReason = reason;
    }
    return this.summary(now);
  }

  get running(): boolean {
    return this.#startedAt !== null && this.#stoppedAt === null;
  }

  /** May a Jev call go out now? Stops the run itself when a cap is hit. */
  admit(now: number): { ok: true } | { ok: false; reason: "not-running" | "spend-cap" | "time-cap" } {
    if (!this.running) return { ok: false, reason: "not-running" };
    if (this.usd >= this.#caps.capUsd) {
      this.stop("spend-cap", now);
      return { ok: false, reason: "spend-cap" };
    }
    if ((now - (this.#startedAt as number)) / 1000 >= this.#caps.capSeconds) {
      this.stop("time-cap", now);
      return { ok: false, reason: "time-cap" };
    }
    return { ok: true };
  }

  begin(): void {
    this.#inFlight++;
  }

  /** Record a finished call. Tokens are the real usage.input_tokens of the reply. */
  end(result: { status: number; ms: number; inputTokens: number }): void {
    this.#inFlight = Math.max(0, this.#inFlight - 1);
    this.#requests++;
    this.#inputTokens += Math.max(0, result.inputTokens);
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
      inputTokens: this.#inputTokens,
      usd: this.usd,
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
