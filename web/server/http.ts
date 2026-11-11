import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_JSON_BODY } from "../shared/jev.ts";

// HTTP helpers shared by every route, in the shape of lingo-dojo's server/sse.ts
// minus SSE (nothing streams here yet).

/** Thrown by a route; wrap() turns it into the status it names. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** A request body's text as JSON (an empty body is `{}`): the dev server's readJsonBody and the hosted proxy's routes both parse through here. */
export function parseJsonText(text: string): unknown {
  if (text.length > MAX_JSON_BODY) throw new HttpError(413, "request body too large");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_JSON_BODY) throw new HttpError(413, "request body too large");
    chunks.push(c as Buffer);
  }
  return parseJsonText(Buffer.concat(chunks).toString("utf8"));
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.writeHead(405, { Allow: allow, "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `method not allowed (use ${allow})` }));
}
