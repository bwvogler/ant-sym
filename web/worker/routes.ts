import { readRunRequest, type HealthReply } from "../shared/jev.ts";
import { errorReply, healthReply, jevReply, runReply, type Reply, type Services } from "../server/replies.ts";
import { HttpError, parseJsonText } from "../server/http.ts";

// The hosted proxy's routes, over the same reply functions as the Vite
// middleware (server/replies.ts). The daily budget is the ledger's own (PR #42
// review S8), kept in Durable Object storage by index.ts. Pure, so node --test
// covers it.

/** One authorised /api/* request. HttpErrors become their status, as wrap() does for the dev server. */
export async function route(svc: Services, method: string, path: string, bodyText: () => Promise<string>): Promise<Reply> {
  try {
    if (path === "/api/health") {
      const h = healthReply(svc);
      const body: HealthReply = { ...(h.body as HealthReply), hosted: true, authorized: true };
      return { status: h.status, body };
    }
    if (path === "/api/run") {
      if (method !== "GET" && method !== "POST") throw new HttpError(405, "method not allowed (use GET, POST)");
      const body = method === "POST" ? readRunRequest(parseJsonText(await bodyText())) : {};
      return runReply(svc, method, body);
    }
    if (path === "/api/jev") {
      if (method !== "POST") throw new HttpError(405, "method not allowed (use POST)");
      if (!svc.client) throw new HttpError(503, "JEV_API_KEY is not set in the Worker's secrets");
      return await jevReply(svc, parseJsonText(await bodyText()));
    }
    throw new HttpError(404, "no such route");
  } catch (e) {
    return errorReply(e);
  }
}
