import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { RunCaps } from "../shared/jev.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "./http.ts";
import { DEFAULT_IN_FLIGHT, JevClient } from "./jev.ts";
import { Ledger, type BudgetStore } from "./ledger.ts";
import { dailyBudget, healthReply, jevReply, runReply, type Reply, type Services } from "./replies.ts";

export { dailyBudget, healthReply, isJevResponse, jevReply, runReply, validateJevRequest, type Reply, type Services } from "./replies.ts";

// The whole "backend": dev-server-only middleware on the Vite server, in the
// shape of lingo-dojo / Atlas. Single-user, localhost, no auth by design. The
// API key lives here and only here.

/**
 * Reject cross-origin requests. Without this, any website the user visits
 * while `npm run dev` is up can POST to these routes — a text/plain body is a
 * CORS "simple request" (no preflight), so the browser sends it and the
 * server would spend the key. A request with no Origin (same-origin
 * navigation, curl) is allowed; one whose Origin host doesn't match the
 * request Host is refused. Pure, so a test pins the rule rather than the wiring.
 */
export function sameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

/** Every route goes through here: same-origin check, JSON error envelope for anything thrown. No exceptions. */
export function wrap(fn: Handler): Handler {
  return (req, res) => {
    if (!sameOrigin(req.headers.origin, req.headers.host)) {
      sendJson(res, 403, { error: "cross-origin request refused" });
      return;
    }
    return Promise.resolve()
      .then(() => fn(req, res))
      .catch((e) => {
        const status = e instanceof HttpError ? e.status : 500;
        if (status === 500) console.error(`[jev-ants] ${req.method} ${req.url}:`, e);
        if (res.headersSent) {
          res.destroy();
          return;
        }
        if (!res.writableEnded) sendJson(res, status, { error: String((e as Error)?.message || e) });
      });
  };
}

/** Where the dev server keeps the day's spend, so the budget holds across restarts: the repo's gitignored data/. */
export const BUDGET_FILE = fileURLToPath(new URL("../../data/jev-budget.json", import.meta.url));

/** The day's spend in a small JSON file. A missing or unreadable file is a fresh day; a failed write is only logged. */
export function fileBudgetStore(path: string): BudgetStore {
  return {
    load: () => {
      try {
        return JSON.parse(readFileSync(path, "utf8")) as { day: string; tokens: number };
      } catch {
        return null;
      }
    },
    save: (v) => {
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(v));
      } catch (e) {
        console.warn(`[jev-ants] could not save the day's Jev spend: ${(e as Error).message}`);
      }
    },
  };
}

/**
 * The real services from the environment: key, in-flight width (JEV_IN_FLIGHT), one ledger sized to match, with the
 * overall daily budget (JEV_DAILY_USD; PR #42 review S8) kept in BUDGET_FILE.
 */
export function buildServices(env: NodeJS.ProcessEnv, budgetFile = BUDGET_FILE): Services & { inFlight: number } {
  const apiKey = env.JEV_API_KEY ?? "";
  const asked = Number(env.JEV_IN_FLIGHT);
  const inFlight = Number.isFinite(asked) && asked !== 0 ? Math.max(1, Math.min(DEFAULT_IN_FLIGHT, Math.trunc(asked))) : DEFAULT_IN_FLIGHT;
  const client = apiKey ? new JevClient({ apiKey, maxSockets: inFlight }) : null;
  const ledger = new Ledger({ maxInFlight: inFlight, dailyUsd: dailyBudget(env), budgetStore: fileBudgetStore(budgetFile) });
  return { client, ledger, now: () => Date.now(), inFlight };
}

export function makeHandlers(svc: Services) {
  const send = (res: ServerResponse, r: Reply) => sendJson(res, r.status, r.body);

  const health: Handler = (_req, res) => send(res, healthReply(svc));

  const run: Handler = async (req, res) => {
    if (req.method === "GET") return send(res, runReply(svc, "GET", {}));
    if (req.method !== "POST") return methodNotAllowed(res, "GET, POST");
    send(res, runReply(svc, "POST", await readJsonBody<{ action?: string; caps?: Partial<RunCaps> }>(req)));
  };

  const jev: Handler = async (req, res) => {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    if (!svc.client) throw new HttpError(503, "JEV_API_KEY is not set in the server's environment");
    send(res, await jevReply(svc, await readJsonBody(req)));
  };

  return { health, run, jev };
}

export function apiPlugins(services?: Services): Plugin {
  return {
    name: "jev-ants-api",
    apply: "serve",
    configureServer(server) {
      const svc = services ?? buildServices(process.env);
      if (!svc.client) console.warn("[jev-ants] JEV_API_KEY is not set: /api/jev will answer 503");
      // When Vite restarts (a config change; server/*.ts edits need a manual restart) close the old pool so sockets do not leak.
      server.httpServer?.once("close", () => svc.client?.destroy());
      const h = makeHandlers(svc);
      server.middlewares.use("/api/health", wrap(h.health));
      server.middlewares.use("/api/run", wrap(h.run));
      server.middlewares.use("/api/jev", wrap(h.jev));
      server.middlewares.use("/api", wrap((_req, res) => sendJson(res, 404, { error: "no such route" })));
    },
  };
}
