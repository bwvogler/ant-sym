import { USD_PER_INPUT_TOKEN } from "../shared/jev.ts";

// The hosted proxy's front door, pure so node --test covers it (the Worker in
// index.ts is wiring). The Vite middleware refuses every cross-origin request
// (server/api.ts `sameOrigin`); this proxy serves a page on another origin
// (GitHub Pages), so it does the opposite: only the listed origins, plus a
// passphrase, because a public page with a key behind it is anyone's to spend.

/** The header the page sends its passphrase in. Not the Jev key: that never leaves the Worker. */
export const PASS_HEADER = "x-jev-ants-pass";

/** "https://a.example, https://b.example" → exact origins, no trailing slashes. */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Who may call. A browser always sends Origin on a cross-origin fetch, so a
 * foreign page is refused here. No Origin (curl, a script) is let through to
 * the passphrase check: the passphrase, not the origin, is the lock.
 */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  return origin === null || allowed.includes(origin);
}

/** CORS headers for an allowed origin; none for a request without one. */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (origin === null || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": `content-type, ${PASS_HEADER}`,
    "access-control-max-age": "7200",
    vary: "Origin",
  };
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Does the sent passphrase match? Fails closed: no passphrase configured means nobody gets in. Compares digests in constant time. */
export async function passOk(sent: string | null, expected: string | undefined): Promise<boolean> {
  if (!expected || !sent) return false;
  const [a, b] = await Promise.all([sha256(sent), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/** The UTC day a spend counts against, "YYYY-MM-DD". */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** What the daily budget keeps in storage. */
export interface DailySpend {
  day: string;
  inputTokens: number;
}

/**
 * The proxy's daily cap, across every run. Per-run caps (the ledger) bound one
 * game; this bounds a day, so a leaked passphrase costs at most the cap a day.
 * A run is started with its spend cap cut to what is left of the day, so the
 * ledger's own reservations enforce it; spend is recorded from the ledger's
 * session tokens, so a reply that lands after its run ended still counts.
 */
export class DailyBudget {
  #spend: DailySpend;
  #seenSession = 0;
  readonly #capUsd: number;

  constructor(capUsd: number, saved: DailySpend | null, now: number) {
    this.#capUsd = Number.isFinite(capUsd) && capUsd >= 0 ? capUsd : 0;
    this.#spend = saved ?? { day: utcDay(now), inputTokens: 0 };
  }

  #roll(now: number): void {
    const day = utcDay(now);
    if (day !== this.#spend.day) this.#spend = { day, inputTokens: 0 };
  }

  /** Dollars left today. */
  remainingUsd(now: number): number {
    this.#roll(now);
    return Math.max(0, this.#capUsd - this.#spend.inputTokens * USD_PER_INPUT_TOKEN);
  }

  /** The spend cap a run may start with: what it asked for, never more than today has left. */
  capFor(askedUsd: number, now: number): number {
    return Math.min(askedUsd, this.remainingUsd(now));
  }

  /** Count the ledger's session tokens since the last call. Returns true when there was something new to save. */
  record(sessionInputTokens: number, now: number): boolean {
    const delta = Math.max(0, sessionInputTokens - this.#seenSession);
    this.#seenSession = Math.max(this.#seenSession, sessionInputTokens);
    if (delta === 0) return false;
    this.#roll(now);
    this.#spend = { day: this.#spend.day, inputTokens: this.#spend.inputTokens + delta };
    return true;
  }

  get capUsd(): number {
    return this.#capUsd;
  }

  snapshot(now: number): DailySpend & { capUsd: number; usd: number } {
    this.#roll(now);
    return { ...this.#spend, capUsd: this.#capUsd, usd: this.#spend.inputTokens * USD_PER_INPUT_TOKEN };
  }
}
