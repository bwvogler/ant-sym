import { DEFAULT_IN_FLIGHT } from "../shared/jev.ts";
import { dailyBudget, type Services } from "../server/replies.ts";
import { Ledger, reserveForBytes, type BudgetStore } from "../server/ledger.ts";
import { FetchJevClient } from "./fetchJev.ts";
import { PASS_HEADER, corsHeaders, originAllowed, parseOrigins, passOk } from "./gate.ts";
import { MAX_JSON_BODY, route } from "./routes.ts";

// The hosted Jev proxy for the GitHub Pages builds (main and PR previews): the
// dev server's /api/health, /api/run and /api/jev on a Cloudflare Worker. The
// Worker checks origin and passphrase; one Durable Object holds the ledger,
// since a run's state (caps, in-flight calls, its abort signal) and the day's
// budget must be in one place. Deployed by .github/workflows/pages.yml; setup
// in docs/hosting.md.

interface Env {
  JEV_API_KEY?: string;
  ACCESS_PASSPHRASE?: string;
  ALLOWED_ORIGINS?: string;
  /** dollars per UTC day, as the dev server's JEV_DAILY_USD */
  JEV_DAILY_USD?: string;
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
/**
 * The most one call may reserve against the day: what the largest body the Worker accepts could bill (~700k tokens,
 * $0.029). The dev server's 64k (the context limit) let a body past ~96 KB reserve less than its size (PR #66 re-review).
 */
const RESERVE_CEILING = reserveForBytes(MAX_JSON_BODY, Infinity);
/** Per attempt: the Jev client's deadline, and how long a stopped run's call may still take. */
const CALL_DEADLINE_MS = 20_000;

/** The one ledger. In memory while the object is resident; the day's spend is kept in its storage. */
export class JevLedger {
  #svc: Services | null = null;

  constructor(state: DurableObjectState, env: Env) {
    void state.blockConcurrencyWhile(async () => {
      const saved = (await state.storage.get<{ day: string; tokens: number }>(SPEND_KEY)) ?? null;
      // The ledger's store is synchronous; a Durable Object's write is confirmed before the reply leaves (output gate).
      const store: BudgetStore = { load: () => saved, save: (v) => void state.storage.put(SPEND_KEY, v) };
      // Workers' setTimeout returns a number with no unref(), so the ledger's default timer would throw. Under Node (the
      // tests) the handle has one, and unref keeps a run's time cap from holding the process open.
      const timer = {
        set: (fn: () => void, ms: number) => {
          const t = setTimeout(fn, ms);
          (t as unknown as { unref?: () => void }).unref?.();
          return t;
        },
        clear: (h: unknown) => clearTimeout(h as number),
      };
      this.#svc = {
        // A stop never cuts off a call already sent: it runs to its reply or its deadline, so what Jev bills is counted
        // against the day (PR #66 review S1). The dev server's 1.5 s grace suits one local user; here it was a way past the cap.
        client: env.JEV_API_KEY ? new FetchJevClient({ apiKey: env.JEV_API_KEY, timeoutMs: CALL_DEADLINE_MS, abortGraceMs: CALL_DEADLINE_MS }) : null,
        ledger: new Ledger({ maxInFlight: DEFAULT_IN_FLIGHT, timer, reserveTokens: RESERVE_CEILING, dailyUsd: dailyBudget(env as unknown as NodeJS.ProcessEnv), budgetStore: store }),
        now: () => Date.now(),
      };
    });
  }

  async fetch(req: Request): Promise<Response> {
    // Refuse an oversized body before reading it (PR #66 review N3); parseBody still checks a body sent without a length.
    if (Number(req.headers.get("content-length") ?? 0) > MAX_JSON_BODY) return json(413, { error: "request body too large" });
    const r = await route(this.#svc as Services, req.method, new URL(req.url).pathname, () => req.text());
    return json(r.status, r.body);
  }
}
