import { DEFAULT_JEV_MODEL, type RunCaps } from "../shared/jev.ts";
import { healthReply, jevReply, runReply, type Reply, type Services } from "../server/replies.ts";
import { HttpError } from "../server/http.ts";

// The hosted proxy's routes, over the same reply functions as the Vite
// middleware (server/replies.ts). The daily budget is the ledger's own (PR #42
// review S8), kept in Durable Object storage by index.ts. Pure, so node --test
// covers it.

export const MAX_JSON_BODY = 1 << 20;

export function parseBody(text: string): unknown {
  if (text.length > MAX_JSON_BODY) throw new HttpError(413, "request body too large");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

/** One authorised /api/* request. HttpErrors become their status, as wrap() does for the dev server. */
export async function route(svc: Services, method: string, path: string, bodyText: () => Promise<string>): Promise<Reply> {
  try {
    if (path === "/api/health") {
      const h = healthReply(svc);
      return { status: h.status, body: { ...(h.body as object), hosted: true, authorized: true } };
    }
    if (path === "/api/run") {
      if (method !== "GET" && method !== "POST") throw new HttpError(405, "method not allowed (use GET, POST)");
      const body = method === "POST" ? (parseBody(await bodyText()) as { action?: string; caps?: Partial<RunCaps> }) : {};
      return runReply(svc, method, body);
    }
    if (path === "/api/jev") {
      if (method !== "POST") throw new HttpError(405, "method not allowed (use POST)");
      if (!svc.client) throw new HttpError(503, "JEV_API_KEY is not set in the Worker's secrets");
      const raw = parseBody(await bodyText());
      // The ledger prices tokens at jev-latest's rate, so a caller may not pick another model (PR #66 review N2).
      return await jevReply(svc, raw && typeof raw === "object" ? { ...raw, model: DEFAULT_JEV_MODEL } : raw);
    }
    throw new HttpError(404, "no such route");
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    return { status: 500, body: { error: String((e as Error)?.message || e) } };
  }
}
