import type { IncomingMessage, ServerResponse } from "node:http";

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

// A packed request of 100 ants is ~80 KB; an overseer request carries two
// base64 PNGs (≤ 1568 px per side) and can reach a few MB.
const MAX_JSON_BODY = 8 << 20;

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_JSON_BODY) throw new HttpError(413, "request body too large");
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.writeHead(405, { Allow: allow, "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `method not allowed (use ${allow})` }));
}
