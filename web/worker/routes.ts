import { DEFAULT_CAPS, type RunCaps } from "../shared/jev.ts";
import { healthReply, jevReply, runReply, type Reply, type Services } from "../server/api.ts";
import { HttpError } from "../server/http.ts";
import type { DailyBudget } from "./gate.ts";

// The hosted proxy's routes, over the same reply functions as the Vite
// middleware (server/api.ts), plus the daily budget. Pure: the Durable Object
// in index.ts hands in the parsed request and saves the budget when told to.

const MAX_JSON_BODY = 1 << 20;

export function parseBody(text: string): unknown {
  if (text.length > MAX_JSON_BODY) throw new HttpError(413, "request body too large");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

export interface Routed extends Reply {
  /** The daily spend changed: persist it. */
  spent: boolean;
}

/** One authorised /api/* request. HttpErrors become their status, as wrap() does for the dev server. */
export async function route(svc: Services, budget: DailyBudget, method: string, path: string, bodyText: () => Promise<string>): Promise<Routed> {
  const now = () => svc.now();
  const daily = () => budget.snapshot(now());
  try {
    let r: Reply;
    if (path === "/api/health") {
      const h = healthReply(svc);
      r = { status: h.status, body: { ...(h.body as object), hosted: true, authorized: true, daily: daily() } };
    } else if (path === "/api/run") {
      if (method !== "GET" && method !== "POST") throw new HttpError(405, "method not allowed (use GET, POST)");
      const body = method === "POST" ? (parseBody(await bodyText()) as { action?: string; caps?: Partial<RunCaps> }) : {};
      if (body.action === "start") {
        const asked = typeof body.caps?.capUsd === "number" && Number.isFinite(body.caps.capUsd) ? body.caps.capUsd : DEFAULT_CAPS.capUsd;
        const capUsd = budget.capFor(asked, now());
        if (capUsd <= 0) {
          const d = daily();
          return { status: 409, body: { error: `the hosted proxy's daily cap ($${d.capUsd.toFixed(2)}) is spent; it resets at 00:00 UTC`, daily: d }, spent: false };
        }
        r = runReply(svc, "POST", { ...body, caps: { ...body.caps, capUsd } });
      } else {
        r = runReply(svc, method, body);
      }
    } else if (path === "/api/jev") {
      if (method !== "POST") throw new HttpError(405, "method not allowed (use POST)");
      if (!svc.client) throw new HttpError(503, "JEV_API_KEY is not set in the Worker's secrets");
      r = await jevReply(svc, parseBody(await bodyText()));
    } else {
      throw new HttpError(404, "no such route");
    }
    const spent = budget.record(svc.ledger.summary(now()).sessionInputTokens, now());
    return { ...r, spent };
  } catch (e) {
    // A call that threw (502) may still have been billed before it did; count whatever the ledger saw.
    const spent = budget.record(svc.ledger.summary(now()).sessionInputTokens, now());
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message }, spent };
    return { status: 500, body: { error: String((e as Error)?.message || e) }, spent };
  }
}
