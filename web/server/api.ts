import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { DEFAULT_JEV_MODEL, type JevProxyReply, type JevRequest, type RunCaps } from "../shared/jev.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "./http.ts";
import { JevClient } from "./jev.ts";
import { Ledger } from "./ledger.ts";

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

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

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
  }
  return {
    model: typeof r.model === "string" && r.model ? r.model : DEFAULT_JEV_MODEL,
    state: r.state,
    questions: r.questions,
    ...(r.assets ? { assets: r.assets } : {}),
  };
}

export interface Services {
  client: JevClient | null;
  ledger: Ledger;
  now: () => number;
}

export function makeHandlers(svc: Services) {
  const health: Handler = (_req, res) => sendJson(res, 200, { ok: true, hasKey: svc.client !== null, run: svc.ledger.summary(svc.now()) });

  const run: Handler = async (req, res) => {
    if (req.method === "GET") return sendJson(res, 200, svc.ledger.summary(svc.now()));
    if (req.method !== "POST") return methodNotAllowed(res, "GET, POST");
    const body = await readJsonBody<{ action?: string; caps?: Partial<RunCaps> }>(req);
    if (body.action === "start") return sendJson(res, 200, svc.ledger.start(body.caps ?? {}, svc.now()));
    if (body.action === "stop") return sendJson(res, 200, svc.ledger.stop("user", svc.now()));
    if (body.action === "formed") return sendJson(res, 200, svc.ledger.stop("formed", svc.now()));
    throw new HttpError(400, "action must be start, stop or formed");
  };

  const jev: Handler = async (req, res) => {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    if (!svc.client) throw new HttpError(503, "JEV_API_KEY is not set in the server's environment");
    const request = validateJevRequest(await readJsonBody(req));
    const gate = svc.ledger.admit(svc.now());
    if (!gate.ok) {
      // 409: the run is not accepting calls. The reply carries the summary so
      // the client learns which cap fired without another round trip.
      return sendJson(res, 409, { error: gate.reason, run: svc.ledger.summary(svc.now()) });
    }
    svc.ledger.begin();
    try {
      const result = await svc.client.ask(request);
      svc.ledger.end(result);
      const reply: JevProxyReply = { ...result, body: result.body as JevProxyReply["body"], run: svc.ledger.summary(svc.now()) };
      sendJson(res, 200, reply);
    } catch (e) {
      svc.ledger.end({ status: 0, ms: 0, inputTokens: 0 });
      throw new HttpError(502, `jev unreachable: ${(e as Error).message}`);
    }
  };

  return { health, run, jev };
}

export function apiPlugins(): Plugin {
  return {
    name: "jev-ants-api",
    apply: "serve",
    configureServer(server) {
      const apiKey = process.env.JEV_API_KEY ?? "";
      if (!apiKey) console.warn("[jev-ants] JEV_API_KEY is not set: /api/jev will answer 503");
      const inFlight = Number(process.env.JEV_IN_FLIGHT) || 8;
      const svc: Services = {
        client: apiKey ? new JevClient({ apiKey, maxSockets: inFlight }) : null,
        ledger: new Ledger(),
        now: () => Date.now(),
      };
      const h = makeHandlers(svc);
      server.middlewares.use("/api/health", wrap(h.health));
      server.middlewares.use("/api/run", wrap(h.run));
      server.middlewares.use("/api/jev", wrap(h.jev));
      server.middlewares.use("/api", wrap((_req, res) => sendJson(res, 404, { error: "no such route" })));
    },
  };
}
