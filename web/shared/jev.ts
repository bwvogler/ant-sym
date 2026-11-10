// Types shared by the browser and the dev-server middleware. The wire shape
// is TypeSafe's own (POST /v1/systemone); see docs/PRD.md §4 and the OpenAPI
// spec at https://api.typesafe.ai/openapi.json.

export type JevQuestion =
  | { type: "noul"; instructions: unknown; criteria?: { true?: unknown; false?: unknown } }
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> }
  | { type: "score"; instructions: unknown; criteria: unknown[] }
  | { type: "box"; instructions: unknown };

export type JevAsset = { type: "image"; format: "png" | "jpg" | "jpeg"; data_base64: string };

export interface JevRequest {
  model?: string;
  state: unknown;
  questions: Record<string, JevQuestion>;
  assets?: Record<string, JevAsset>;
}

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence?: number | null; probabilities?: Record<string, number> }
  | { type: "score"; score: number; confidence?: number | null; legend?: Record<string, string>; probabilities?: Record<string, number> }
  | { type: "box"; box: { top: number; bottom: number; left: number; right: number }; confidence: number | null };

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

/** What /api/jev returns: the upstream reply plus what it cost. */
export interface JevProxyReply {
  status: number;
  body: JevResponse | { error?: unknown; [k: string]: unknown } | null;
  ms: number;
  attempts: number;
  inputTokens: number;
  run: RunSummary;
}

export type StopReason = "user" | "spend-cap" | "time-cap" | "formed" | "budget";

/**
 * The overall budget (PR #42 review S8): what Jev may cost per day, across every run and page load, kept by the server's
 * ledger. `usdPerDay` and `remainingUsd` are null when no budget is set (the ledger's default, for tests).
 */
export interface Budget {
  /** the UTC day the figures are for (YYYY-MM-DD) */
  day: string;
  usdPerDay: number | null;
  spentUsd: number;
  remainingUsd: number | null;
}

export interface RunCaps {
  /** Dollars this run may spend on Jev before the server refuses further calls. */
  capUsd: number;
  /** Seconds after Start before the server refuses further calls. */
  capSeconds: number;
}

export interface RunSummary {
  running: boolean;
  startedAt: number | null;
  stoppedAt: number | null;
  stopReason: StopReason | null;
  elapsedSeconds: number;
  caps: RunCaps;
  requests: number;
  inFlight: number;
  /** The most calls the server lets run at once (JEV_IN_FLIGHT, default DEFAULT_IN_FLIGHT). The browser never keeps more open. */
  maxInFlight: number;
  inputTokens: number;
  /** Real cost: Σ usage.input_tokens × $0.042 / 1e6. Never an estimate; see `aborted` for what it cannot include. */
  usd: number;
  /** Across every run this server has seen (the browser's session line comes from here, so a reply landing after its run ended still counts). */
  sessionInputTokens: number;
  sessionUsd: number;
  /** Calls cut off by Stop (or a cap) before any reply. Their cost is unknown and is not in `usd`; the client gives sent calls a short grace to finish and be counted, so this is normally 0. */
  aborted: number;
  medianMs: number | null;
  p90Ms: number | null;
  /** Count of upstream statuses seen this run, keyed by status code ("200", "429", …). */
  statuses: Record<string, number>;
  remainingUsd: number;
  remainingSeconds: number;
  /** today's spend against the overall budget (absent from servers before S8) */
  budget?: Budget;
}

/**
 * Browsers open at most 6 HTTP/1.1 connections per host. Five in flight
 * leaves one for /api/run, so Stop reaches the server at once instead of
 * queueing behind the calls it is meant to cut off (measured: 6 open, Stop
 * waited 3.8 s and every call was billed; 5 open, 5 ms). Also the most
 * JEV_IN_FLIGHT may ask for.
 */
export const DEFAULT_IN_FLIGHT = 5;
export const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
/** A run's caps when none are asked for: $0.10 and 30 minutes (about an hour of retuning costs $0.10–0.15, PRD §39). */
export const DEFAULT_CAPS: RunCaps = { capUsd: 0.1, capSeconds: 1800 };

/**
 * The game's runs (PR #42 review S8): no per-run caps that matter. An open run costs nothing (only uncached situations
 * are asked), so a run stays open from the first miss until the page closes, and the overall daily budget is the
 * ceiling on spend: DAILY_BUDGET_USD unless the server's JEV_DAILY_USD says otherwise.
 */
export const GAME_CAPS: RunCaps = { capUsd: 100, capSeconds: 86_400 };

/** What Jev may cost per day, across runs and page loads, unless the server's JEV_DAILY_USD sets another figure. */
export const DAILY_BUDGET_USD = 0.1;
export const DEFAULT_JEV_MODEL = "jev-latest";
