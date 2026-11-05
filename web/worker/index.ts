import { DEFAULT_IN_FLIGHT } from "../shared/jev.ts";
import type { Services } from "../server/api.ts";
import { Ledger } from "../server/ledger.ts";
import { FetchJevClient } from "./fetchJev.ts";
import { DailyBudget, PASS_HEADER, corsHeaders, originAllowed, parseOrigins, passOk, type DailySpend } from "./gate.ts";
import { route } from "./routes.ts";

// The hosted Jev proxy for the GitHub Pages builds (main and PR previews): the
// dev server's /api/health, /api/run and /api/jev on a Cloudflare Worker. The
// Worker checks origin and passphrase; one Durable Object holds the ledger,
// since a run's state (caps, in-flight calls, its abort signal) must be one
// place. Deployed by .github/workflows/pages.yml; setup in docs/hosting.md.

interface Env {
  JEV_API_KEY?: string;
  ACCESS_PASSPHRASE?: string;
  ALLOWED_ORIGINS?: string;
  DAILY_CAP_USD?: string;
  LEDGER: DurableObjectNamespace;
}

// The few Durable Object types this file uses, declared here rather than pulling in @cloudflare/workers-types.
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(req: Request): Promise<Response> };
}
interface DurableObjectState {
  storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> };
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin");
    const allowed = parseOrigins(env.ALLOWED_ORIGINS);
    if (!originAllowed(origin, allowed)) return json(403, { error: "cross-origin request refused" });
    const cors = corsHeaders(origin, allowed);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const path = new URL(req.url).pathname;
    if (!path.startsWith("/api/")) return json(404, { error: "no such route" }, cors);
    const authorized = await passOk(req.headers.get(PASS_HEADER), env.ACCESS_PASSPHRASE);
    if (!authorized) {
      // Health answers without the passphrase, so the page can tell "locked" from "no backend" and ask for it.
      if (path === "/api/health") return json(200, { ok: true, hasKey: !!env.JEV_API_KEY, hosted: true, authorized: false }, cors);
      return json(401, { error: "passphrase required" }, cors);
    }
    const res = await env.LEDGER.get(env.LEDGER.idFromName("global")).fetch(req);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};

const SPEND_KEY = "daily-spend";

/** The one ledger. In memory while the object is resident; only the day's spend is persisted. */
export class JevLedger {
  readonly #state: DurableObjectState;
  readonly #svc: Services;
  #budget: DailyBudget | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.#state = state;
    // Workers' setTimeout returns a number with no unref(), so the ledger's default timer would throw.
    const timer = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as number) };
    this.#svc = {
      client: env.JEV_API_KEY ? new FetchJevClient({ apiKey: env.JEV_API_KEY }) : null,
      ledger: new Ledger({ maxInFlight: DEFAULT_IN_FLIGHT, timer }),
      now: () => Date.now(),
    };
    const cap = Number(env.DAILY_CAP_USD ?? "2");
    void state.blockConcurrencyWhile(async () => {
      const saved = (await state.storage.get<DailySpend>(SPEND_KEY)) ?? null;
      this.#budget = new DailyBudget(cap, saved, Date.now());
    });
  }

  async fetch(req: Request): Promise<Response> {
    const budget = this.#budget as DailyBudget;
    const r = await route(this.#svc, budget, req.method, new URL(req.url).pathname, () => req.text());
    if (r.spent) {
      const { day, inputTokens } = budget.snapshot(Date.now());
      await this.#state.storage.put(SPEND_KEY, { day, inputTokens });
    }
    return json(r.status, r.body);
  }
}
