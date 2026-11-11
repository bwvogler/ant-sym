import { DAILY_BUDGET_USD, DEFAULT_JEV_MODEL, type HealthReply, type JevProxyReply, type JevRequest, type RunRequest } from "../shared/jev.ts";
import { HttpError } from "./http.ts";
import { JevAbortError, type JevCaller } from "./jev.ts";
import { reserveForBytes, type Ledger } from "./ledger.ts";

// What the API routes answer, transport-neutral and free of node:fs, so the
// Vite middleware (api.ts) and the hosted Worker (web/worker) share it. A
// Worker cannot load api.ts itself: its budget-file path is resolved from
// import.meta.url when the module loads, which throws there.

/** Shape-check a Jev request from the browser. The server owns the model default; the browser never names the key. */
export function validateJevRequest(raw: unknown): JevRequest {
  const r = raw as Partial<JevRequest> | null;
  if (!r || typeof r !== "object") throw new HttpError(400, "body must be a Jev request object");
  if (r.state === undefined) throw new HttpError(400, "state is required");
  if (!r.questions || typeof r.questions !== "object" || Object.keys(r.questions).length === 0) {
    throw new HttpError(400, "questions must be a non-empty object");
  }
  for (const [name, q] of Object.entries(r.questions)) {
    if (!q || typeof q !== "object" || !["noul", "choice", "score", "box"].includes((q as { type: string }).type)) {
      throw new HttpError(400, `question ${name} has no valid type`);
    }
    // A choice among nothing has no answer: billed every time, never cached, and upstream may fail the whole batch on it.
    const c = (q as { type: string; criteria?: unknown }).criteria;
    if ((q as { type: string }).type === "choice" && (!c || typeof c !== "object" || Object.keys(c).length === 0)) {
      throw new HttpError(400, `question ${name} is a choice with no options`);
    }
  }
  return {
    model: typeof r.model === "string" && r.model ? r.model : DEFAULT_JEV_MODEL,
    state: r.state,
    questions: r.questions,
    ...(r.assets ? { assets: r.assets } : {}),
  };
}

/** A 200 from upstream must carry an answers object to count as an answer. */
export function isJevResponse(body: unknown): boolean {
  const b = body as { answers?: unknown } | null;
  return !!b && typeof b === "object" && !!b.answers && typeof b.answers === "object";
}

export interface Services {
  client: JevCaller | null;
  ledger: Ledger;
  now: () => number;
}

/** The daily budget from JEV_DAILY_USD (dollars, ≥ 0), else DAILY_BUDGET_USD. */
export function dailyBudget(env: { JEV_DAILY_USD?: string }): number {
  const v = Number(env.JEV_DAILY_USD);
  return env.JEV_DAILY_USD !== undefined && env.JEV_DAILY_USD !== "" && Number.isFinite(v) && v >= 0 ? v : DAILY_BUDGET_USD;
}

/** A route's answer, transport-neutral: the Vite middleware and the hosted Worker (web/worker) both send it. */
export interface Reply {
  status: number;
  body: unknown;
}

export function healthReply(svc: Services): Reply {
  const body: HealthReply = { ok: true, hasKey: svc.client !== null, run: svc.ledger.summary(svc.now()) };
  return { status: 200, body };
}

/** What a thrown error answers, for both transports: an HttpError its own status, anything else a 500; always `{error}`. */
export function errorReply(e: unknown): Reply {
  return { status: e instanceof HttpError ? e.status : 500, body: { error: String((e as Error)?.message || e) } };
}

/** /api/run: GET is the summary; POST {action} starts or stops the run. */
export function runReply(svc: Services, method: string | undefined, body: RunRequest): Reply {
  if (method === "GET") return { status: 200, body: svc.ledger.summary(svc.now()) };
  if (body.action === "start") return { status: 200, body: svc.ledger.start(body.caps ?? {}, svc.now()) };
  if (body.action === "stop") return { status: 200, body: svc.ledger.stop("user", svc.now()) };
  if (body.action === "formed") return { status: 200, body: svc.ledger.stop("formed", svc.now()) };
  throw new HttpError(400, "action must be start, stop or formed");
}

/** /api/jev: one Jev call through the ledger. Throws HttpError for 400/502/503. */
export async function jevReply(svc: Services, raw: unknown): Promise<Reply> {
  if (!svc.client) throw new HttpError(503, "JEV_API_KEY is not set in the server's environment");
  // The ledger prices tokens at jev-latest's rate, so a caller may not pick another model (PR #66 review N2): both transports pin it here.
  const request = { ...validateJevRequest(raw), model: DEFAULT_JEV_MODEL };
  // Reserve from this request's own size, so a big call cannot hide under a small one's room.
  // Up to the ledger's own ceiling: the dev server's is the 64k context limit; the Worker's covers its largest body
  // (PR #66 re-review), so a big request cannot reserve less than it might bill.
  const reserve = reserveForBytes(new TextEncoder().encode(JSON.stringify(request)).length, svc.ledger.reserveTokens);
  const gate = svc.ledger.admit(svc.now(), reserve);
  if (!gate.ok) {
    // 429 "busy" is temporary: the pool is full or what is in flight might
    // use up the rest of the cap. 409 means the run is over (or never
    // started). The reply carries the summary so the client learns which
    // without another trip.
    return { status: gate.reason === "busy" ? 429 : 409, body: { error: gate.reason, run: svc.ledger.summary(svc.now()) } };
  }
  const token = svc.ledger.begin(reserve);
  const signal = svc.ledger.signal;
  let result: Awaited<ReturnType<JevCaller["ask"]>>;
  try {
    result = await svc.client.ask(request, signal);
  } catch (e) {
    const aborted = e instanceof JevAbortError || signal.aborted;
    // An aborted call never got a reply: its cost is unknown, so it is counted apart, not as a free request.
    svc.ledger.end(token, { status: 0, ms: 0, inputTokens: 0, aborted });
    if (aborted) return { status: 409, body: { error: "stopped", run: svc.ledger.summary(svc.now()) } };
    throw new HttpError(502, `jev unreachable: ${(e as Error).message}`);
  }
  // A 200 without answers is not an answer; keep the status for the ledger but say so.
  const body = result.status === 200 && !isJevResponse(result.body) ? { error: "upstream reply had no answers", upstream: result.body } : result.body;
  svc.ledger.end(token, result);
  const reply: JevProxyReply = { ...result, body: body as JevProxyReply["body"], run: svc.ledger.summary(svc.now()) };
  return { status: 200, body: reply };
}
