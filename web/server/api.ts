import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { DEFAULT_JEV_MODEL, type JevProxyReply, type JevRequest, type RunCaps } from "../shared/jev.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "./http.ts";
import { DEFAULT_IN_FLIGHT, JevAbortError, JevClient, type JevCaller } from "./jev.ts";
import { Ledger, reserveForBytes } from "./ledger.ts";

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

/** The real services from the environment: key, in-flight width (JEV_IN_FLIGHT), one ledger sized to match. */
export function buildServices(env: NodeJS.ProcessEnv): Services & { inFlight: number } {
  const apiKey = env.JEV_API_KEY ?? "";
  const asked = Number(env.JEV_IN_FLIGHT);
  const inFlight = Number.isFinite(asked) && asked !== 0 ? Math.max(1, Math.min(6, Math.trunc(asked))) : DEFAULT_IN_FLIGHT;
  const client = apiKey ? new JevClient({ apiKey, maxSockets: inFlight }) : null;
  return { client, ledger: new Ledger({ maxInFlight: inFlight }), now: () => Date.now(), inFlight };
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
    // Reserve from this request's own size, so a big call cannot hide under a small one's room.
    const reserve = reserveForBytes(Buffer.byteLength(JSON.stringify(request)));
    const gate = svc.ledger.admit(svc.now(), reserve);
    if (!gate.ok) {
      // 429 "busy" is temporary: the pool is full or what is in flight might
      // use up the rest of the cap. 409 means the run is over (or never
      // started). The reply carries the summary so the client learns which
      // without another trip.
      return sendJson(res, gate.reason === "busy" ? 429 : 409, { error: gate.reason, run: svc.ledger.summary(svc.now()) });
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
      if (aborted) return sendJson(res, 409, { error: "stopped", run: svc.ledger.summary(svc.now()) });
      throw new HttpError(502, `jev unreachable: ${(e as Error).message}`);
    }
    // A 200 without answers is not an answer; keep the status for the ledger but say so.
    const body = result.status === 200 && !isJevResponse(result.body) ? { error: "upstream reply had no answers", upstream: result.body } : result.body;
    svc.ledger.end(token, result);
    const reply: JevProxyReply = { ...result, body: body as JevProxyReply["body"], run: svc.ledger.summary(svc.now()) };
    sendJson(res, 200, reply);
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
      // A server/*.ts edit restarts Vite: close the old pool so sockets do not leak across restarts.
      server.httpServer?.once("close", () => svc.client?.destroy());
      const h = makeHandlers(svc);
      server.middlewares.use("/api/health", wrap(h.health));
      server.middlewares.use("/api/run", wrap(h.run));
      server.middlewares.use("/api/jev", wrap(h.jev));
      server.middlewares.use("/api", wrap((_req, res) => sendJson(res, 404, { error: "no such route" })));
    },
  };
}
